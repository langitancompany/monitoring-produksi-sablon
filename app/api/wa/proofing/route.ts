// app/api/wa/proofing/route.ts
// Dipanggil dari browser (hooks/useUpload.ts) tepat setelah file PROOFING diupload.
// Membuat 1 permintaan persetujuan (wa_proofing_requests) lalu mengantrekan pesan berisi link
// gambar ke semua nomor "Persetujuan proofing" di Pengaturan. Balasan ditangani oleh
// /api/wa/proofing-reply (dipanggil wa-gateway).
//
// Teks pesan & link gambar dibuat DI SINI dari data database, bukan dari browser.

import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { enqueueWa, type WaItem } from '@/lib/waQueue';
import { getWaSettings } from '@/lib/waSettings';
import { pesanProofing } from '@/lib/waMessages';
import { getOrderSteps } from '@/lib/utils';
import { linkProofing } from '@/lib/waAppUrl';
import { randomBytes } from 'node:crypto';

// Kode link pendek: 8 karakter acak huruf kecil + angka (tanpa 0/o/1/l yang mudah tertukar)
const HURUF = 'abcdefghjkmnpqrstuvwxyz23456789';
const buatKode = () =>
  Array.from(randomBytes(8), (b) => HURUF[b % HURUF.length]).join('');

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.response;

  try {
    const { orderId, stepId } = (await request.json()) as { orderId?: string; stepId?: string };
    if (!orderId || !stepId) return NextResponse.json({ error: 'orderId & stepId wajib' }, { status: 400 });

    const cfg = await getWaSettings();
    if (!cfg.enabled) return NextResponse.json({ success: true, queued: 0, skipped: 'nonaktif' });
    if (cfg.notifyProofingNumbers.length === 0) {
      return NextResponse.json({ success: true, queued: 0, skipped: 'tidak_ada_penerima' });
    }

    const db = getSupabaseAdmin();
    const { data: o, error } = await db.from('orders').select('*').eq('id', orderId).single();
    if (error || !o) return NextResponse.json({ error: 'Order tidak ditemukan' }, { status: 404 });

    const step = (getOrderSteps(o) as any[]).find((s) => s.id === stepId);
    if (!step || !String(step.name ?? '').toLowerCase().includes('proofing')) {
      return NextResponse.json({ success: true, queued: 0, skipped: 'bukan_proofing' });
    }
    if (!step.fileUrl || step.isCompleted) {
      return NextResponse.json({ success: true, queued: 0, skipped: 'tidak_menunggu' });
    }

    // Upload ulang (mis. setelah revisi) → permintaan lama tidak berlaku lagi
    await db
      .from('wa_proofing_requests')
      .update({ status: 'diganti' })
      .eq('order_id', o.id).eq('step_id', stepId).eq('status', 'menunggu');

    const dasar = {
      order_id: o.id,
      step_id: stepId,
      kode_produksi: o.kode_produksi,
      file_url: step.fileUrl,
      numbers: cfg.notifyProofingNumbers,
    };
    // Link pendek: butuh kolom short_code (migration 022). Belum dijalankan → pakai link panjang apa adanya.
    const kodePendek = buatKode();
    let { data: req, error: reqErr } = await db
      .from('wa_proofing_requests').insert({ ...dasar, short_code: kodePendek }).select('id').single();
    let linkGambar: string = linkProofing(kodePendek);
    if (reqErr && /short_code/i.test(reqErr.message)) {
      console.warn('wa/proofing: kolom short_code belum ada (jalankan migration 022) → memakai link panjang');
      ({ data: req, error: reqErr } = await db.from('wa_proofing_requests').insert(dasar).select('id').single());
      linkGambar = step.fileUrl;
    }
    if (reqErr || !req) throw new Error(reqErr?.message ?? 'Gagal membuat permintaan proofing');

    const message = pesanProofing(o, step.name, step.uploadedBy, linkGambar);
    const items: WaItem[] = cfg.notifyProofingNumbers.map((nomor) => ({
      order_id: o.id as string,
      target_type: 'user',
      target: nomor,
      event_type: 'proofing',
      message,
      dedupe_key: `proofing:${req.id}:${nomor}`,
    }));

    try {
      const res = await enqueueWa(items, cfg);
      return NextResponse.json({ success: true, requestId: req.id, ...res });
    } catch (e) {
      // Pesan tidak masuk antrian → permintaan ini tidak boleh menggantung
      await db.from('wa_proofing_requests').update({ status: 'kedaluwarsa' }).eq('id', req.id);
      throw e;
    }
  } catch (e: any) {
    console.error('wa/proofing error:', e);
    return NextResponse.json({ error: e?.message ?? 'Gagal' }, { status: 500 });
  }
}
