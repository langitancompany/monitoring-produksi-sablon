// lib/waRows.ts — helper murni (tanpa import) untuk menyiapkan baris wa_outbox.
//
// Mengapa ada: insert massal lewat PostgREST/supabase-js mengisi kolom yang TIDAK ada di sebuah
// baris dengan NULL (bukan nilai default kolom) bila baris lain dalam batch yang sama punya kolom
// itu. Pesan grup membawa `mentions`, pesan pribadi tidak → baris pribadi dikirim dengan
// mentions = NULL. Kalau kolom `mentions` NOT NULL, SELURUH batch ditolak, sehingga pesan ke PJ dan
// nomor penerima ikut tidak masuk antrian setiap kali batch memuat pesan grup.
// Solusi: semua baris dalam satu batch memakai kumpulan kolom yang sama.

export function seragamkanBaris<T extends { mentions?: string[] }>(
  items: T[],
): (T & { mentions: string[] })[] {
  return items.map((i) => ({ ...i, mentions: i.mentions ?? [] }));
}
