// lib/waNotifyVerifikasi.ts — SERVER ONLY.
// Mengantrekan pesan WhatsApp ke nomor penerima (Pengaturan > WhatsApp Bot) setiap kali ada
// pembayaran / refund / pengeluaran yang masuk antrean verifikasi.
//
// Aturan:
//  - Hanya dipanggil untuk transaksi berstatus PENDING. Transaksi yang langsung terverifikasi
//    (auto-verify) dan gaji yang ditandai lunas (sudah otomatis disetujui di fin_post_salary)
//    tidak pernah sampai ke sini.
//  - Tidak pernah melempar error: gagal mengantre tidak boleh menggagalkan pencatatan transaksi.
//  - dedupe_key per transaksi + nomor, jadi satu transaksi tidak mengirim pesan dobel.

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { enqueueWa, type WaItem } from '@/lib/waQueue';
import { getWaSettings } from '@/lib/waSettings';
import { pesanVerifikasi, detailPesanan } from '@/lib/waMessages';
import { linkVerifikasi } from '@/lib/waAppUrl';

type Input =
  | { jenis: 'pembayaran' | 'refund'; id: string; nominal: number; pencatat: string; orderId: string }
  | { jenis: 'pengeluaran'; id: string; nominal: number; pencatat: string; keterangan: string };

export async function notifyVerifikasi(input: Input): Promise<void> {
  try {
    const cfg = await getWaSettings();
    if (!cfg.enabled || cfg.notifyVerifikasiNumbers.length === 0) return;

    const admin = getSupabaseAdmin();

    let rincian = '';
    if (input.jenis === 'pengeluaran') {
      rincian = input.keterangan;
    } else {
      const { data: o } = await admin
        .from('orders')
        .select('kode_produksi, nama_pemesan, jumlah, jenis_produksi, jenis_pakaian, jenis_merchandise, varian_merchandise')
        .eq('id', input.orderId).maybeSingle();
      rincian = o ? detailPesanan(o) : 'Pesanan tidak diketahui';
    }

    // Jumlah antrean saat ini (termasuk transaksi ini, karena sudah tercatat).
    const [pay, exp] = await Promise.all([
      admin.from('order_payments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      admin.from('finance_expenses').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);

    const message = pesanVerifikasi({
      jenis: input.jenis,
      nominal: input.nominal,
      pencatat: input.pencatat,
      rincian,
      menunggu: { pembayaran: pay.count ?? 0, pengeluaran: exp.count ?? 0 },
      link: linkVerifikasi(),
    });

    const items: WaItem[] = cfg.notifyVerifikasiNumbers.map((nomor) => ({
      target_type: 'user',
      target: nomor,
      message,
      event_type: 'verifikasi',
      dedupe_key: `verif:${input.jenis}:${input.id}:${nomor}`,
    }));
    await enqueueWa(items, cfg);
  } catch (e) {
    console.error('notifyVerifikasi gagal (transaksi tetap tercatat):', e);
  }
}
