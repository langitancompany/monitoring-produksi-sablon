// app/api/wa/pelanggan/route.ts
// Pesan otomatis ke PELANGGAN (nomor `no_hp` di detail pesanan) saat APPROVAL terbit.
// Dipanggil dari browser (hooks/useUpload.ts) tepat setelah file approval (mockup) berhasil diupload:
//   event 'approval' → kirim link tracking (sekali per pesanan & nomor).
//
// Gambar PROOFING ke pelanggan tidak lewat sini: itu ditangani /api/wa/proofing (bersama nomor internal),
// dan balasan "ACC" / "Revisi: alasan" pelanggan diproses /api/wa/proofing-reply.
// Teks dibuat DI SINI dari data database, jadi browser tidak bisa mengirim teks sembarang.
//
// Hanya jalan bila saklar "WhatsApp Bot" DAN "Pesan otomatis ke pelanggan" (Pengaturan) aktif.

import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { enqueueWa, normalizeWa, type WaItem } from '@/lib/waQueue';
import { getWaSettings } from '@/lib/waSettings';
import { pesanTrackingPelanggan } from '@/lib/waMessages';
import { linkTracking } from '@/lib/waAppUrl';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.response;

  try {
    const { orderId, event } = (await request.json()) as { orderId?: string; event?: string };
    if (!orderId || event !== 'approval') {
      return NextResponse.json({ error: 'orderId wajib dan event harus "approval"' }, { status: 400 });
    }

    const cfg = await getWaSettings();
    if (!cfg.enabled || !cfg.notifyPelanggan) {
      return NextResponse.json({ success: true, queued: 0, skipped: 'nonaktif' });
    }

    const { data: o, error } = await getSupabaseAdmin().from('orders').select('*').eq('id', orderId).maybeSingle();
    if (error || !o) return NextResponse.json({ error: 'Order tidak ditemukan' }, { status: 404 });
    if (o.deleted_at) return NextResponse.json({ success: true, queued: 0, skipped: 'order_dihapus' });

    // Kebenaran ada di database: kirim hanya bila approval memang sudah terbit.
    if (!o.link_approval?.link) {
      return NextResponse.json({ success: true, queued: 0, skipped: 'approval_belum_terbit' });
    }

    // normalizeWa memberi 62xxxxxxxxxx; batas panjang mencegah salah ketik / dua nomor tertempel jadi satu
    const nomor = normalizeWa(o.no_hp);
    if (!nomor || nomor.length < 10 || nomor.length > 15) {
      console.warn(`[wa/pelanggan] ${o.kode_produksi}: nomor HP pelanggan tidak valid (${o.no_hp ?? 'kosong'}), pesan tidak dikirim`);
      return NextResponse.json({ success: true, queued: 0, skipped: 'nomor_tidak_valid' });
    }

    const item: WaItem = {
      target_type: 'user',
      target: nomor,
      event_type: 'tracking',
      order_id: o.id as string,
      message: pesanTrackingPelanggan(o, linkTracking(o.kode_produksi)),
      // Sekali per pesanan & nomor: upload ulang mockup tidak mengirim tracking lagi.
      dedupe_key: `tracking:${o.id}:${nomor}`,
    };

    const res = await enqueueWa([item], cfg);
    console.log(`[wa/pelanggan] ${o.kode_produksi} event=approval masuk=${res.queued}`);
    return NextResponse.json({ success: true, ...res });
  } catch (e) {
    console.error('wa/pelanggan error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Gagal' }, { status: 500 });
  }
}
