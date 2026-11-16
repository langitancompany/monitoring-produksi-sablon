// app/api/wa/proofing-reply/route.ts
// Dipanggil oleh wa-gateway setiap ada pesan MASUK yang tampak seperti balasan proofing.
//   Header: Authorization: Bearer <token gateway>  (sama dengan token di Pengaturan → WhatsApp Bot)
//   Body  : { from, chatJid, messageId, quotedId, text }
//
//   "siap produksi"        → step Proofing ditandai selesai (ACC)
//   "Revisi: <alasan>"     → step Proofing masuk mode revisi, alasan = teks setelah titik dua
//
// Pesan lain / dari nomor yang tidak terdaftar diabaikan TANPA balasan (handled: false).
// Alur revisi sama dengan tombol "Revisi" di aplikasi (step.proofing_note), jadi tombol
// "Upload Ulang (Revisi)" yang sudah ada tetap dipakai.

import { NextResponse, type NextRequest } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { enqueueWa, normalizeWa, orang, ORDER_WITH_PEOPLE, type WaItem } from '@/lib/waQueue';
import { getWaSettings } from '@/lib/waSettings';
import { bacaBalasanProofing } from '@/lib/waProofing';
import {
  pesanProofingAcc, pesanProofingRevisi, pesanProofingMintaAlasan, pesanProofingTidakAda,
  pesanProofingBanyak, pesanProofingSudah, pesanTahapPersonal,
} from '@/lib/waMessages';
import { getOrderSteps, getStepsKey } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const sha = (v: string) => createHash('sha256').update(v).digest();
const sama = (a: string, b: string) => timingSafeEqual(sha(a), sha(b));

const PENERIMA_NOTIF_APP = ['super_admin', 'admin', 'manager', 'produksi'];

export async function POST(request: NextRequest) {
  try {
    const cfg = await getWaSettings();
    const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    if (!cfg.gatewayToken || !sama(bearer, cfg.gatewayToken)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const b = (await request.json()) as {
      from?: string | null; chatJid?: string; messageId?: string; quotedId?: string | null; text?: string;
    };
    const balasan = bacaBalasanProofing(b.text);
    if (!balasan || !cfg.enabled) return NextResponse.json({ handled: false });

    const db = getSupabaseAdmin();
    const penerima = new Set(cfg.notifyProofingNumbers);
    const dari = normalizeWa(b.from);
    const msgId = String(b.messageId ?? Date.now());

    // Kirim balasan lewat antrian (ikut batas kirim & jeda anti-blokir gateway)
    const balas = async (nomor: string, teks: string) => {
      const item: WaItem = {
        target_type: 'user', target: nomor, event_type: 'proofing_balasan', message: teks,
        dedupe_key: `proofing-balas:${msgId}:${nomor}`,
      };
      try { await enqueueWa([item], cfg); } catch (e) { console.error('proofing-reply: gagal antre balasan', e); }
    };

    // ── 1. Tentukan permintaan proofing yang dimaksud ─────────────────────────
    let req: any = null;
    let nomorBalas: string | null = dari;

    if (b.quotedId) {
      // Pembalas men-swipe pesan proofing tertentu → pasti pesanan yang benar
      const { data: out } = await db
        .from('wa_outbox')
        .select('target, dedupe_key')
        .eq('wa_message_id', b.quotedId).eq('event_type', 'proofing')
        .maybeSingle();
      const target = out ? normalizeWa(out.target) : null;
      const id = /^proofing:([0-9a-f-]{36}):/i.exec(String(out?.dedupe_key ?? ''))?.[1];
      if (id && target && penerima.has(target)) {
        const { data } = await db.from('wa_proofing_requests').select('*').eq('id', id).maybeSingle();
        req = data;
        nomorBalas = target;
      }
    }

    if (!req) {
      // Tanpa swipe: hanya nomor terdaftar yang dilayani; nomor lain diabaikan tanpa balasan
      if (!dari || !penerima.has(dari)) return NextResponse.json({ handled: false });

      const { data: menunggu } = await db
        .from('wa_proofing_requests')
        .select('*')
        .eq('status', 'menunggu').contains('numbers', [dari])
        .order('created_at', { ascending: false });
      const daftar = menunggu ?? [];

      if (daftar.length === 0) {
        await balas(dari, pesanProofingTidakAda());
        return NextResponse.json({ handled: true, hasil: 'tidak_ada' });
      }
      if (daftar.length > 1) {
        await balas(dari, pesanProofingBanyak(daftar.map((r: any) => String(r.kode_produksi ?? r.order_id))));
        return NextResponse.json({ handled: true, hasil: 'banyak' });
      }
      req = daftar[0];
    }

    if (!req || !nomorBalas) return NextResponse.json({ handled: false });
    const kode = String(req.kode_produksi ?? '');

    if (balasan.jenis === 'revisi_kosong') {
      await balas(nomorBalas, pesanProofingMintaAlasan());
      return NextResponse.json({ handled: true, hasil: 'minta_alasan' });
    }

    // ── 2. Permintaan sudah diputuskan / sudah tidak berlaku ──────────────────
    if (req.status !== 'menunggu') {
      const keadaan = req.status === 'acc' ? 'acc' : req.status === 'revisi' ? 'revisi' : 'diganti';
      await balas(nomorBalas, pesanProofingSudah(kode, keadaan));
      return NextResponse.json({ handled: true, hasil: `sudah_${req.status}` });
    }

    const { data: o } = await db.from('orders').select(ORDER_WITH_PEOPLE).eq('id', req.order_id).maybeSingle();
    const stepsKey = o ? getStepsKey(o.jenis_produksi) : null;
    const steps = o ? (JSON.parse(JSON.stringify(getOrderSteps(o))) as any[]) : [];
    const idx = steps.findIndex((s) => s.id === req.step_id);
    const step = idx >= 0 ? steps[idx] : null;

    const tutup = (status: string) =>
      db.from('wa_proofing_requests').update({ status }).eq('id', req.id).eq('status', 'menunggu');

    // Gambar sudah diganti upload baru / step hilang → permintaan ini basi
    if (!o || !step || step.fileUrl !== req.file_url) {
      await tutup('diganti');
      await balas(nomorBalas, pesanProofingSudah(kode, 'diganti'));
      return NextResponse.json({ handled: true, hasil: 'diganti' });
    }
    // Sudah diputuskan lewat tombol di aplikasi
    if (step.isCompleted) {
      await tutup('acc');
      await balas(nomorBalas, pesanProofingSudah(kode, 'acc'));
      return NextResponse.json({ handled: true, hasil: 'sudah_acc_manual' });
    }
    if (step.proofing_note) {
      await tutup('revisi');
      await balas(nomorBalas, pesanProofingSudah(kode, 'revisi'));
      return NextResponse.json({ handled: true, hasil: 'sudah_revisi_manual' });
    }

    // ── 3. "Klaim" permintaan: hanya satu balasan yang boleh menang (aman dobel kirim) ──
    const statusBaru = balasan.jenis === 'acc' ? 'acc' : 'revisi';
    const { data: klaim } = await db
      .from('wa_proofing_requests')
      .update({
        status: statusBaru,
        revisi_note: balasan.jenis === 'revisi' ? balasan.alasan : null,
        responded_by: nomorBalas,
        responded_at: new Date().toISOString(),
      })
      .eq('id', req.id).eq('status', 'menunggu')
      .select('id');
    if (!klaim || klaim.length === 0) return NextResponse.json({ handled: true, hasil: 'sudah_diproses' });

    // ── 4. Terapkan ke pesanan ────────────────────────────────────────────────
    const sekarang = new Date();
    const waktu = sekarang.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const statusLama = String(o.status ?? '');
    let statusPesanan = statusLama;

    if (balasan.jenis === 'acc') {
      steps[idx] = {
        ...step,
        isCompleted: true,
        completedAt: sekarang.toISOString(),
        timestamp: waktu,
        approved_via: 'whatsapp',
        approved_by: nomorBalas,
      };
      delete steps[idx].proofing_note;
      if (steps.every((s) => s.isCompleted) && statusLama === 'On Process') statusPesanan = 'Finishing';
    } else {
      steps[idx] = { ...step, isCompleted: false, proofing_note: balasan.alasan, revisi_via: 'whatsapp' };
    }

    // Hanya kolom langkah (+ status bila berubah) yang ditulis, supaya tidak menimpa field lain
    const patch: Record<string, unknown> = { [stepsKey as string]: steps };
    if (statusPesanan !== statusLama) patch.status = statusPesanan;
    const { error: upErr } = await db.from('orders').update(patch).eq('id', o.id);
    if (upErr) {
      await db.from('wa_proofing_requests').update({ status: 'menunggu', revisi_note: null, responded_by: null, responded_at: null }).eq('id', req.id);
      throw new Error(upErr.message);
    }

    // ── 5. Log aktivitas, notifikasi aplikasi, balasan WhatsApp ───────────────
    const oleh = `WhatsApp (+${nomorBalas})`;
    await db.from('order_logs').insert([
      balasan.jenis === 'acc'
        ? {
            order_id: o.id, kode_produksi: kode, category: 'STATUS', event_name: 'Proofing Disetujui via WhatsApp',
            description: `Step "${step.name}" disetujui (siap produksi)`,
            old_value: statusLama, new_value: statusPesanan, oleh, metadata: { via: 'whatsapp', from: nomorBalas },
          }
        : {
            order_id: o.id, kode_produksi: kode, category: 'REVISI', event_name: 'Revisi Proofing via WhatsApp',
            description: `Step "${step.name}": ${balasan.alasan}`,
            old_value: statusLama, new_value: statusLama, oleh, metadata: { via: 'whatsapp', from: nomorBalas },
          },
    ]).then(({ error }) => { if (error) console.error('proofing-reply: gagal catat log', error.message); });

    try {
      const { data: users } = await db.from('users').select('id').in('role', PENERIMA_NOTIF_APP);
      if (users?.length) {
        const judul = balasan.jenis === 'acc' ? `Proofing disetujui: ${kode}` : `Revisi proofing: ${kode}`;
        const isi = balasan.jenis === 'acc' ? 'Siap produksi (disetujui via WhatsApp).' : balasan.alasan;
        await db.from('notifications').insert(
          users.map((u: any) => ({ user_id: u.id, title: judul, message: isi, order_id: o.id, is_read: false })),
        );
      }
    } catch (e) {
      console.error('proofing-reply: gagal buat notifikasi aplikasi', e);
    }

    // Status pesanan ikut pindah tahap (jarang: hanya bila proofing adalah step terakhir)
    if (statusPesanan !== statusLama && statusPesanan === 'Finishing') {
      const { pj, helper } = orang(o);
      const tahap: WaItem[] = [];
      for (const [peran, p] of [['pj', pj], ['helper', helper]] as const) {
        if (p?.wa) tahap.push({
          order_id: o.id, target_type: 'user', target: p.wa, event_type: 'tahap',
          message: pesanTahapPersonal(p.nama, statusPesanan, o), dedupe_key: `tahap:${o.id}:${statusPesanan}:${peran}:proofing:${req.id}`,
        });
      }
      if (tahap.length) { try { await enqueueWa(tahap, cfg); } catch (e) { console.error(e); } }
    }

    await balas(nomorBalas, balasan.jenis === 'acc' ? pesanProofingAcc(kode) : pesanProofingRevisi(kode, balasan.alasan));
    return NextResponse.json({ handled: true, hasil: statusBaru });
  } catch (e: any) {
    console.error('wa/proofing-reply error:', e);
    return NextResponse.json({ error: e?.message ?? 'Gagal' }, { status: 500 });
  }
}
