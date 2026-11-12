// lib/waMessages.ts — template pesan WhatsApp (teks saja, tanpa akses database)

import { MERCHANDISE_PRODUCTS } from '../types';

export interface WaOrder {
  kode_produksi: string;
  nama_pemesan: string;
  jumlah?: number | null;
  jenis_produksi?: string | null;
  deadline?: string | null;
  // Rincian produk (opsional; bila tidak ada, jenis_produksi saja yang ditampilkan)
  jenis_pakaian?: string | null;      // 'kaos' | 'sweater_hoodie' (kosong = kaos)
  jenis_merchandise?: string | null;  // mis. 'lanyard', 'totebag'
  varian_merchandise?: string | null; // mis. 'stopper', 'tanpa_stopper'
}

export const fmtTanggal = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta',
      })
    : '-';

const rapikan = (v: string) => v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Jenis produksi yang mudah dibaca:
 *  - Kaos            → "Kaos – DTF" / "Kaos – Manual" (sweater/hoodie → "Sweater / Hoodie – DTF")
 *  - Merchandise     → "Lanyard – Dengan Stopper", "Totebag", "Gantungan Kunci"
 * Label produk & varian merchandise diambil dari MERCHANDISE_PRODUCTS (types/index.ts), jadi
 * produk/varian baru otomatis ikut tampil dengan namanya.
 */
export function labelProduk(o: WaOrder): string {
  const jp = (o.jenis_produksi ?? '').trim();
  const kecil = jp.toLowerCase();

  if (kecil === 'merchandise' || kecil === 'lanyard') {
    const kode = o.jenis_merchandise || (kecil === 'lanyard' ? 'lanyard' : '');
    const produk = MERCHANDISE_PRODUCTS.find((p) => p.value === kode);
    const nama = produk?.label ?? (kode ? rapikan(kode) : 'Merchandise');
    const varian =
      produk?.variants.find((v) => v.value === o.varian_merchandise)?.label ??
      (o.varian_merchandise ? rapikan(o.varian_merchandise) : '');
    return varian ? `${nama} – ${varian}` : nama;
  }

  if (kecil === 'dtf' || kecil === 'manual') {
    const pakaian = o.jenis_pakaian === 'sweater_hoodie' ? 'Sweater / Hoodie' : 'Kaos';
    return `${pakaian} – ${kecil === 'dtf' ? 'DTF' : 'Manual'}`;
  }
  return jp;
}

// Satu baris ringkas (dipakai di daftar banyak pesanan): *KODE* — Pemesan • Produk (n pcs)
export const baris = (o: WaOrder) => {
  const produk = labelProduk(o);
  return (
    `*${o.kode_produksi}* — ${o.nama_pemesan}` +
    (produk ? ` • ${produk}` : '') +
    (o.jumlah ? ` (${o.jumlah} pcs)` : '')
  );
};

// Blok rincian untuk pesan satu pesanan: kode, pemesan, jenis produksi, jumlah.
export const detailPesanan = (o: WaOrder) => {
  const produk = labelProduk(o);
  return [
    `*Kode:* ${o.kode_produksi}`,
    `*Pemesan:* ${o.nama_pemesan || '-'}`,
    produk ? `*Produksi:* ${produk}` : null,
    o.jumlah ? `*Jumlah:* ${o.jumlah} pcs` : null,
  ].filter((x): x is string => x !== null).join('\n');
};

const sebut = (nomor: string[]) => nomor.map((n) => `@${n}`).join(' ');

// 1) Order baru → grup produksi
export const pesanOrderBaruGrup = (o: WaOrder, pj?: string, helper?: string, mention: string[] = []) =>
  [
    '📦 *PESANAN BARU MASUK*',
    '',
    detailPesanan(o),
    `Deadline: ${fmtTanggal(o.deadline)}`,
    `PJ: ${pj ?? '-'}${helper ? ` • Helper: ${helper}` : ''}`,
    mention.length ? `\n${sebut(mention)}` : '',
  ].join('\n').trim();

// 2) Order baru → personal (PJ / helper)
export const pesanOrderBaruPersonal = (nama: string, peran: 'PJ' | 'Helper', o: WaOrder) =>
  [
    `Halo ${nama} 👋`,
    `Ada pesanan baru untuk kamu sebagai *${peran}*:`,
    '',
    detailPesanan(o),
    `Deadline: ${fmtTanggal(o.deadline)}`,
  ].join('\n');

// 3) Pindah tahap → personal
const TEKS_TAHAP: Record<string, string> = {
  'On Process': 'sudah masuk tahap *PRODUKSI*, silakan mulai dikerjakan.',
  Finishing: 'sudah masuk tahap *FINISHING & QC*.',
  Kirim: 'sudah masuk tahap *PENGIRIMAN*.',
};
export const adaPesanTahap = (status: string) => status in TEKS_TAHAP;
export const pesanTahapPersonal = (nama: string, status: string, o: WaOrder) =>
  [`Halo ${nama} 👋`, `Pesanan berikut ${TEKS_TAHAP[status] ?? `berubah ke tahap *${status}*.`}`, '',
   detailPesanan(o), `Deadline: ${fmtTanggal(o.deadline)}`].join('\n');

// 4) Kendala / Revisi → grup (mention yang bertugas)
export const pesanKendalaGrup = (o: WaOrder, catatan: string, pelapor: string | undefined, mention: string[]) =>
  [
    '⚠️ *ADA KENDALA*',
    '',
    detailPesanan(o),
    `Kendala: ${catatan || '-'}`,
    pelapor ? `Dilaporkan oleh: ${pelapor}` : null,
    mention.length ? `\nMohon ditindak: ${sebut(mention)}` : null,
  ].filter((x): x is string => x !== null).join('\n');

export const pesanRevisiGrup = (o: WaOrder, catatanQC: string, mention: string[]) =>
  [
    '🔁 *REVISI QC*',
    '',
    detailPesanan(o),
    `Catatan QC: ${catatanQC || '-'}`,
    mention.length ? `\nMohon diperbaiki: ${sebut(mention)}` : '',
  ].join('\n');

// 4b) Pesanan selesai sepenuhnya → grup (info saja, tanpa mention)
export const pesanSelesaiGrup = (o: WaOrder, pj?: string, helper?: string) =>
  [
    '✅ *PESANAN SELESAI*',
    '',
    detailPesanan(o),
    `PJ: ${pj ?? '-'}${helper ? ` • Helper: ${helper}` : ''}`,
  ].join('\n');

// 5) Pengingat deadline → personal (rangkum semua order orang itu jadi 1 pesan)
export interface ItemDeadline { order: WaOrder; sisaHari: number } // sisaHari<0 = telat
const labelSisa = (d: number) =>
  d < 0 ? `⛔ telat ${Math.abs(d)} hari` : d === 0 ? '🔥 deadline HARI INI' : `⏰ ${d} hari lagi`;

export const pesanDeadlinePersonal = (nama: string, items: ItemDeadline[]) =>
  [
    `Halo ${nama} 👋 pengingat pesanan kamu:`,
    '',
    ...items.map((i) => `• ${baris(i.order)}\n   ${labelSisa(i.sisaHari)} (${fmtTanggal(i.order.deadline)})`),
  ].join('\n');

// 6) Ringkasan deadline → grup (1 pesan saja)
export const pesanDeadlineGrup = (items: ItemDeadline[]) =>
  [
    '📋 *PENGINGAT DEADLINE*',
    '',
    ...items.map((i) => `• ${baris(i.order)} — ${labelSisa(i.sisaHari)}`),
  ].join('\n');

// 7) Verifikasi keuangan → nomor penerima (pembayaran / refund / pengeluaran menunggu verifikasi)
export interface PesanVerifikasi {
  jenis: 'pembayaran' | 'refund' | 'pengeluaran';
  nominal: number;
  pencatat: string;
  /** Pembayaran/refund: "KODE — Nama pemesan". Pengeluaran: keterangan. */
  rincian: string;
  menunggu: { pembayaran: number; pengeluaran: number };
  link: string;
}

const rupiah = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

export const pesanVerifikasi = (v: PesanVerifikasi) => {
  const judul = {
    pembayaran: 'PEMBAYARAN MENUNGGU VERIFIKASI',
    refund: 'REFUND MENUNGGU VERIFIKASI',
    pengeluaran: 'PENGELUARAN MENUNGGU PERSETUJUAN',
  }[v.jenis];
  const antre = [
    v.menunggu.pembayaran ? `${v.menunggu.pembayaran} pembayaran/refund` : '',
    v.menunggu.pengeluaran ? `${v.menunggu.pengeluaran} pengeluaran` : '',
  ].filter(Boolean).join(' dan ');
  return [
    `🧾 *${judul}*`,
    '',
    v.rincian,
    `Nominal: *${rupiah(v.nominal)}*`,
    `Dicatat oleh: ${v.pencatat}`,
    antre ? `\nTotal antrean saat ini: ${antre}.` : null,
    `\nBuka verifikasi:\n${v.link}`,
  ].filter((x): x is string => x !== null).join('\n');
};

// 8) Laporan kendala lengkap → nomor penerima (pribadi, bukan grup)
export const pesanKendalaPengelola = (
  o: WaOrder, catatan: string, pelapor: string | undefined, pj: string | undefined,
  helper: string | undefined, link: string,
) =>
  [
    '⚠️ *LAPORAN KENDALA PESANAN*',
    '',
    detailPesanan(o),
    `Deadline: ${fmtTanggal(o.deadline)}`,
    `PJ: ${pj ?? '-'}${helper ? ` • Helper: ${helper}` : ''}`,
    '',
    'Isi laporan:',
    catatan || '-',
    pelapor ? `\nDilaporkan oleh: ${pelapor}` : null,
    `\nBuka pesanan:\n${link}`,
  ].filter((x): x is string => x !== null).join('\n');
