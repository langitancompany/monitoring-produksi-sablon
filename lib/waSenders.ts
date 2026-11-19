// lib/waSenders.ts — helper murni (tanpa import) untuk banyak nomor pengirim WhatsApp.
//
// Satu "tugas" di layar = satu atau beberapa jenis pesan (wa_outbox.event_type). Yang disimpan di
// database adalah jenis pesannya, supaya gateway tidak perlu tahu daftar tugas ini.

export const DEFAULT_SENDER_ID = 'utama';
export const MAKS_SENDER = 10;
export const SENDER_ID_RE = /^[a-z0-9][a-z0-9-]{0,30}$/;

export interface WaTugas {
  key: string;
  label: string;
  desc: string;
  events: string[];
}

export const WA_TUGAS: WaTugas[] = [
  { key: 'order_baru', label: 'Order baru', desc: 'Pesanan baru ke PJ, helper, dan grup produksi.', events: ['order_baru'] },
  { key: 'tahap', label: 'Pergantian tahap', desc: 'Kabar tahap produksi ke PJ dan helper.', events: ['tahap'] },
  { key: 'kendala', label: 'Kendala pesanan', desc: 'Laporan kendala ke grup dan nomor penerima kendala.', events: ['kendala'] },
  { key: 'revisi', label: 'Revisi', desc: 'Pesanan masuk revisi (ke grup).', events: ['revisi'] },
  { key: 'selesai', label: 'Pesanan selesai', desc: 'Pesanan selesai (ke grup).', events: ['selesai'] },
  { key: 'deadline', label: 'Pengingat deadline', desc: 'Pengingat deadline ke PJ/helper dan grup.', events: ['deadline'] },
  { key: 'verifikasi', label: 'Verifikasi keuangan', desc: 'Pembayaran, refund, atau pengeluaran menunggu verifikasi.', events: ['verifikasi'] },
  { key: 'proofing', label: 'Persetujuan proofing', desc: 'Kirim proofing dan konfirmasi balasan ACC/Revisi. Balasan masuk ke nomor yang mengirim, jadi keduanya satu paket.', events: ['proofing', 'proofing_balasan'] },
];

const EVENT_RE = /^[a-z0-9_.:-]+$/i;

/** Kunci tugas → daftar jenis pesan (tanpa duplikat, kunci tak dikenal diabaikan). */
export function eventsDariTugas(keys: string[]): string[] {
  const hasil: string[] = [];
  for (const t of WA_TUGAS) {
    if (!keys.includes(t.key)) continue;
    for (const e of t.events) if (!hasil.includes(e)) hasil.push(e);
  }
  return hasil;
}

/** Jenis pesan tersimpan → kunci tugas (tugas dihitung terpilih bila SEMUA jenisnya ada). */
export function tugasDariEvents(events: string[]): string[] {
  return WA_TUGAS.filter((t) => t.events.every((e) => events.includes(e))).map((t) => t.key);
}

/** Jenis pesan yang aman dipakai di filter database (cegah karakter aneh). */
export const eventAman = (e: string) => EVENT_RE.test(e);

/** Tugas yang sudah dipegang nomor lain: mengembalikan pesan error, atau null bila tidak bentrok. */
export function cariBentrok(
  senderLain: { id: string; label: string; tasks: string[] }[],
  eventsBaru: string[],
): string | null {
  for (const s of senderLain) {
    const kena = eventsBaru.find((e) => s.tasks.includes(e));
    if (kena) {
      const t = WA_TUGAS.find((x) => x.events.includes(kena));
      return `Tugas "${t?.label ?? kena}" sudah dipegang ${s.label || s.id}. Lepas dulu dari nomor itu.`;
    }
  }
  return null;
}

/** Kode pendek acak untuk nomor baru, mis. "n7k2qa". */
export function buatSenderId(acak: () => number = Math.random): string {
  const abjad = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = 'n';
  for (let i = 0; i < 5; i++) s += abjad[Math.floor(acak() * abjad.length)];
  return s;
}
