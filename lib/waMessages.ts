// lib/waMessages.ts — template pesan WhatsApp (teks saja, tanpa akses database)

export interface WaOrder {
  kode_produksi: string;
  nama_pemesan: string;
  jumlah?: number | null;
  jenis_produksi?: string | null;
  deadline?: string | null;
}

export const fmtTanggal = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta',
      })
    : '-';

const baris = (o: WaOrder) =>
  `*${o.kode_produksi}* — ${o.nama_pemesan}` +
  (o.jumlah ? ` (${o.jumlah} pcs)` : '') +
  (o.jenis_produksi ? ` • ${o.jenis_produksi}` : '');

const sebut = (nomor: string[]) => nomor.map((n) => `@${n}`).join(' ');

// 1) Order baru → grup produksi
export const pesanOrderBaruGrup = (o: WaOrder, pj?: string, helper?: string, mention: string[] = []) =>
  [
    '📦 *PESANAN BARU MASUK*',
    '',
    baris(o),
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
    baris(o),
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
  [`Halo ${nama} 👋`, `Pesanan ${baris(o)}`, TEKS_TAHAP[status] ?? `berubah ke tahap *${status}*.`,
   `Deadline: ${fmtTanggal(o.deadline)}`].join('\n');

// 4) Kendala / Revisi → grup (mention yang bertugas)
export const pesanKendalaGrup = (o: WaOrder, catatan: string, pelapor: string | undefined, mention: string[]) =>
  [
    '⚠️ *ADA KENDALA*',
    '',
    baris(o),
    `Kendala: ${catatan || '-'}`,
    pelapor ? `Dilaporkan oleh: ${pelapor}` : '',
    mention.length ? `\nMohon ditindak: ${sebut(mention)}` : '',
  ].filter(Boolean).join('\n');

export const pesanRevisiGrup = (o: WaOrder, catatanQC: string, mention: string[]) =>
  [
    '🔁 *REVISI QC*',
    '',
    baris(o),
    `Catatan QC: ${catatanQC || '-'}`,
    mention.length ? `\nMohon diperbaiki: ${sebut(mention)}` : '',
  ].join('\n');

// 4b) Pesanan selesai sepenuhnya → grup (info saja, tanpa mention)
export const pesanSelesaiGrup = (o: WaOrder, pj?: string, helper?: string) =>
  [
    '✅ *PESANAN SELESAI*',
    '',
    baris(o),
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