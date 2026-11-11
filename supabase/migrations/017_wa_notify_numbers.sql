-- 017 — Nomor penerima notifikasi WhatsApp: Verifikasi Keuangan dan Kendala pesanan
-- (database SABLON, schema monitoring_sablon).
--
-- Aman dijalankan ulang. Hanya MENAMBAH kolom ke wa_settings; data lama tidak diubah.
-- Kode aplikasi membaca kolom ini dengan aman: kalau SQL ini belum dijalankan, WhatsApp Bot
-- tetap bekerja seperti biasa, hanya fitur nomor penerima yang belum aktif.
--
--   notify_verifikasi_numbers  nomor yang dikabari saat ada pembayaran/refund/pengeluaran
--                              menunggu verifikasi (format 62812..., dinormalisasi oleh aplikasi)
--   notify_kendala_numbers     nomor yang dikabari saat ada pesanan melaporkan kendala
--
-- Daftar kosong = notifikasi jenis itu tidak dikirim.
-- (Bila versi 017 sebelumnya sempat dijalankan, kolom notify_numbers / notify_verifikasi /
--  notify_kendala dari versi itu tidak dipakai lagi dan boleh dibiarkan.)

begin;

alter table monitoring_sablon.wa_settings
  add column if not exists notify_verifikasi_numbers text[] not null default '{}',
  add column if not exists notify_kendala_numbers    text[] not null default '{}';

commit;

notify pgrst, 'reload schema';

-- ─── Cek hasil ───────────────────────────────────────────────────────────────
--   select id, enabled, notify_verifikasi_numbers, notify_kendala_numbers
--   from monitoring_sablon.wa_settings;
