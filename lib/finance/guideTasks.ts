// lib/finance/guideTasks.ts
// Isi tab "Panduan": tugas rutin admin Keuangan, aturan penting, dan helper periode centang.
// Murni data + fungsi kecil (tanpa React) agar mudah diuji.

import type { FinCaps } from './caps';

export type GuideTarget = 'overview' | 'invoices' | 'payments' | 'verify' | 'expenses' | 'report' | 'audit' | 'settings';
export type Freq = 'daily' | 'weekly' | 'monthly';
export type Needs = 'create' | 'edit' | 'super_admin';

export interface GuideTask {
  id: string;
  freq: Freq;
  title: string;
  why: string;
  steps: string[];
  /** hak minimum yang dibutuhkan; kosong = semua yang punya akses Keuangan */
  needs?: Needs;
  go?: { tab: GuideTarget; label: string; pending?: boolean };
  /** tugas yang dikerjakan di luar tab Keuangan */
  outside?: string;
}

export const FREQ_LABEL: Record<Freq, string> = {
  daily: 'Harian',
  weekly: 'Mingguan',
  monthly: 'Bulanan',
};

export const FREQ_PERIOD_HINT: Record<Freq, string> = {
  daily: 'hari ini',
  weekly: 'minggu ini',
  monthly: 'bulan ini',
};

export const TASKS: GuideTask[] = [
  // ───────────── Harian ─────────────
  {
    id: 'd-verify', freq: 'daily', needs: 'edit',
    title: 'Proses antrean verifikasi pembayaran',
    why: 'Pembayaran baru belum dihitung sebagai uang masuk sampai diverifikasi.',
    steps: [
      'Buka tab Verifikasi.',
      'Klik Lihat bukti, lalu cocokkan nominal, tanggal, dan pengirim dengan mutasi rekening.',
      'Klik Verifikasi bila cocok, atau Tolak dengan alasan.',
      'Antrean kosong berarti selesai.',
    ],
    go: { tab: 'verify', label: 'Buka antrean' },
  },
  {
    id: 'd-approve', freq: 'daily', needs: 'edit',
    title: 'Setujui atau tolak pengeluaran',
    why: 'Pengeluaran yang belum disetujui tidak dihitung di laporan.',
    steps: [
      'Buka tab Pengeluaran, pilih status Menunggu persetujuan.',
      'Periksa nota, kategori, dan nominal.',
      'Klik Setujui, atau Tolak dengan alasan.',
    ],
    go: { tab: 'expenses', pending: true, label: 'Buka antrean' },
  },
  {
    id: 'd-invoice', freq: 'daily', needs: 'create',
    title: 'Terbitkan tagihan untuk order baru',
    why: 'Pembayaran hanya bisa dicatat pada order yang sudah punya tagihan.',
    steps: [
      'Buka tab Tagihan, cari order berstatus Belum Ditagih.',
      'Klik Rincian, lalu Terbitkan tagihan.',
      'Isi harga dasar per pcs, tambahan ukuran besar atau lengan panjang bila ada, diskon, dan jatuh tempo.',
      'Kirim invoice ke customer: Invoice, lalu Unduh PDF atau Kirim via WhatsApp.',
    ],
    go: { tab: 'invoices', label: 'Buka Tagihan' },
  },
  {
    id: 'd-payment', freq: 'daily', needs: 'create',
    title: 'Catat pembayaran yang masuk',
    why: 'Uang yang diterima tetapi tidak dicatat tidak akan muncul di laporan.',
    steps: [
      'Di tab Tagihan klik Catat bayar pada order yang bersangkutan.',
      'Isi nominal, metode, akun kas/bank, dan tanggal diterima.',
      'Lampirkan bukti (wajib untuk transfer dan QRIS).',
      'Simpan. Pembayaran masuk antrean verifikasi.',
    ],
    go: { tab: 'invoices', label: 'Buka Tagihan' },
  },
  {
    id: 'd-expense', freq: 'daily', needs: 'create',
    title: 'Catat pengeluaran hari ini',
    why: 'Biaya yang tidak dicatat membuat laba terlihat lebih besar dari kenyataan.',
    steps: [
      'Buka tab Pengeluaran, klik Catat pengeluaran.',
      'Pilih kategori dan akun yang dipakai membayar.',
      'Kaitkan ke order bila biayanya khusus untuk satu order, supaya laba per order akurat.',
      'Lampirkan nota (wajib mulai batas yang ditetapkan).',
    ],
    go: { tab: 'expenses', label: 'Buka Pengeluaran' },
  },
  // ───────────── Mingguan ─────────────
  {
    id: 'w-aging', freq: 'weekly',
    title: 'Tinjau piutang yang jatuh tempo',
    why: 'Semakin lama tagihan menunggak, semakin sulit ditagih.',
    steps: [
      'Buka Ringkasan, lihat Umur piutang dan Sisa tagihan terbesar.',
      'Hubungi customer yang telat. Invoice bisa dikirim ulang lewat tombol Invoice.',
      'Catat pembayaran begitu uangnya masuk.',
    ],
    go: { tab: 'overview', label: 'Buka Ringkasan' },
  },
  {
    id: 'w-unbilled', freq: 'weekly', needs: 'create',
    title: 'Tagih order yang belum ditagih',
    why: 'Order tanpa tagihan tidak tercatat sebagai pendapatan.',
    steps: [
      'Di tab Tagihan pilih filter Belum Ditagih.',
      'Terbitkan tagihan untuk order yang harganya sudah jelas.',
    ],
    go: { tab: 'invoices', label: 'Buka Tagihan' },
  },
  {
    id: 'w-complete', freq: 'weekly', needs: 'create',
    title: 'Pastikan pengeluaran minggu ini lengkap',
    why: 'Laporan laba rugi hanya seakurat kelengkapan biaya yang dicatat.',
    steps: [
      'Cocokkan dengan nota dan mutasi rekening minggu ini.',
      'Catat yang belum masuk, kaitkan ke order bila khusus untuk satu order.',
      'Jangan mencatat gaji secara manual; gaji dicatat dari menu Gaji.',
    ],
    go: { tab: 'expenses', label: 'Buka Pengeluaran' },
  },
  // ───────────── Bulanan ─────────────
  {
    id: 'm-salary', freq: 'monthly',
    title: 'Tandai gaji dibayar, lalu setujui pengeluaran gajinya',
    why: 'Biaya gaji baru masuk laporan setelah dicatat dan disetujui.',
    steps: [
      'Buka menu Gaji, pilih bulan dan karyawan.',
      'Klik Tandai Sudah Dibayar. Sistem otomatis mencatat pengeluaran gaji per order.',
      'Kembali ke Keuangan, tab Pengeluaran, lalu setujui pengeluaran gajinya (pemegang hak Verifikasi).',
      'Jangan mencatat gaji yang sama secara manual agar tidak terhitung dobel.',
    ],
    outside: 'Dikerjakan di menu Gaji, di luar tab Keuangan.',
    go: { tab: 'expenses', pending: true, label: 'Buka antrean pengeluaran' },
  },
  {
    id: 'm-reconcile', freq: 'monthly', needs: 'edit',
    title: 'Cocokkan kas dan bank dengan mutasi',
    why: 'Selisih menandakan ada transaksi yang belum dicatat atau salah catat.',
    steps: [
      'Bandingkan kas masuk terverifikasi dan pengeluaran disetujui dengan mutasi rekening dan uang tunai.',
      'Telusuri selisih lewat tab Transaksi dan Pengeluaran.',
      'Aplikasi belum punya rekonsiliasi otomatis, jadi pencocokan ini dilakukan manual.',
    ],
    go: { tab: 'payments', label: 'Buka Transaksi' },
  },
  {
    id: 'm-report', freq: 'monthly', needs: 'edit',
    title: 'Periksa laporan bulan ini',
    why: 'Mendeteksi biaya yang belum lengkap dan order yang merugi.',
    steps: [
      'Buka tab Laporan, pilih rentang bulan yang diperiksa.',
      'Perhatikan peringatan kelengkapan biaya dan margin yang janggal.',
      'Periksa order dengan laba kotor negatif.',
    ],
    go: { tab: 'report', label: 'Buka Laporan' },
  },
  {
    id: 'm-export', freq: 'monthly', needs: 'edit',
    title: 'Ekspor dan arsipkan laporan',
    why: 'Arsip bulanan memudahkan pemeriksaan di kemudian hari.',
    steps: [
      'Di tab Laporan klik Ekspor Excel.',
      'Simpan file dengan nama bulan di folder arsip yang aman.',
    ],
    go: { tab: 'report', label: 'Buka Laporan' },
  },
  {
    id: 'm-audit', freq: 'monthly', needs: 'super_admin',
    title: 'Tinjau log audit',
    why: 'Void, revisi tagihan, dan ekspor yang tidak biasa perlu ditanyakan alasannya.',
    steps: [
      'Buka tab Audit, pilih rentang bulan lalu.',
      'Perhatikan void, revisi tagihan, dan ekspor.',
      'Tanyakan alasannya bila ada yang janggal.',
    ],
    go: { tab: 'audit', label: 'Buka Audit' },
  },
];

export const RULES: string[] = [
  'Jangan menghapus data. Koreksi dengan Void atau Revisi tagihan, dan selalu isi alasannya.',
  'Yang mencatat sebaiknya bukan yang memverifikasi atau menyetujui.',
  'Selalu lampirkan bukti. Bukti wajib untuk transfer, QRIS, dan pengeluaran di atas batas.',
  'Jangan mencatat gaji secara manual untuk gaji yang sudah ditandai dibayar di menu Gaji.',
  'Selama audit berjalan, jangan menghapus atau mengubah data historis.',
  'Aplikasi ini adalah sumber data transaksi, bukan pembukuan resmi. Pembukuan resmi disusun akuntan dari data ini.',
];

export const FAQ: { q: string; a: string }[] = [
  { q: 'Salah mengisi nominal pembayaran. Bagaimana?',
    a: 'Void transaksi yang salah (wajib alasan), lalu catat ulang dengan nominal yang benar. Perlu hak Void.' },
  { q: 'Harga pada tagihan salah.',
    a: 'Klik Revisi tagihan pada order itu dan isi alasannya. Versi lama tetap tersimpan di Riwayat tagihan.' },
  { q: 'Customer meminta uangnya dikembalikan.',
    a: 'Catat sebagai Refund lewat kotak centang pada form pembayaran. Hanya pemegang hak Verifikasi yang bisa.' },
  { q: 'Cara mengirim invoice ke customer.',
    a: 'Klik Invoice pada order. Pilih Unduh PDF, Bagikan file (HP), Kirim via WhatsApp, atau Cetak. Untuk WhatsApp, lampirkan PDF-nya secara manual.' },
  { q: 'Pembayaran sudah dicatat tetapi Terbayar belum bertambah.',
    a: 'Pembayaran masih menunggu verifikasi. Nominalnya baru dihitung setelah diverifikasi.' },
  { q: 'Laba di laporan terlihat terlalu besar.',
    a: 'Biasanya biaya belum lengkap dicatat atau belum disetujui. Lengkapi pengeluaran dan proses antreannya.' },
  { q: 'Gaji tidak bisa ditandai dibayar.',
    a: 'Baca pesan errornya. Penyebab umum: pengaturan akun default gaji belum benar, atau periode sudah ditutup. Hubungi Super Admin.' },
];

export const canDo = (t: GuideTask, caps: FinCaps): boolean =>
  !t.needs || (t.needs === 'super_admin' ? caps.isSuperAdmin : caps[t.needs]);

export const tasksFor = (caps: FinCaps): GuideTask[] => TASKS.filter((t) => canDo(t, caps));

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Kunci periode centang: harian = tanggal, mingguan = tanggal Senin minggu itu, bulanan = YYYY-MM. */
export function periodKey(freq: Freq, now: Date = new Date()): string {
  if (freq === 'daily') return ymd(now);
  if (freq === 'monthly') return ymd(now).slice(0, 7);
  const sinceMonday = (now.getDay() + 6) % 7;
  return ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMonday));
}

export const taskKey = (t: GuideTask, now: Date = new Date()) => `${t.id}|${periodKey(t.freq, now)}`;

/** Buang centang periode lama (hari/minggu/bulan yang sudah lewat) supaya daftar kembali kosong. */
export function pruneDone(done: Record<string, true>, tasks: GuideTask[], now: Date = new Date()): Record<string, true> {
  const valid = new Set(tasks.map((t) => taskKey(t, now)));
  const out: Record<string, true> = {};
  for (const k of Object.keys(done)) if (valid.has(k)) out[k] = true;
  return out;
}
