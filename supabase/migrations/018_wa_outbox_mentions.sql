-- 018 — Pastikan tabel antrian WhatsApp (wa_outbox) punya kolom `mentions`
-- (database SABLON, schema monitoring_sablon).
--
-- GEJALA kalau kolom ini tidak ada: pesan ke PJ saat ORDER BARU, dan pesan KENDALA / REVISI
-- (ke nomor penerima maupun grup) tidak pernah masuk antrian, sedangkan pesan pindah tahap
-- (tanpa mention) tetap terkirim. Penyebabnya: pesan grup membawa daftar @mention dan insert ke
-- tabel ditolak karena kolomnya tidak dikenal.
--
-- Aman dijalankan ulang (add column if not exists). Tidak mengubah data lama.

begin;

alter table monitoring_sablon.wa_outbox
  add column if not exists mentions text[] not null default '{}';

commit;

notify pgrst, 'reload schema';

-- ─── Cek hasil ───────────────────────────────────────────────────────────────
-- 1) Kolom wa_outbox (pastikan `mentions` ada; tipenya harus ARRAY / text[]):
--   select column_name, data_type, udt_name
--   from information_schema.columns
--   where table_schema = 'monitoring_sablon' and table_name = 'wa_outbox'
--   order by ordinal_position;
--
-- 2) Pesan terakhir yang masuk antrian, per jenis (kendala / order_baru harus muncul di sini
--    setelah Anda mencoba lapor kendala / buat pesanan baru):
--   select created_at, event_type, target_type, status, attempts, last_error
--   from monitoring_sablon.wa_outbox
--   order by created_at desc
--   limit 20;
