-- 024 — Pesan otomatis ke PELANGGAN: link tracking & persetujuan proofing lewat WhatsApp
-- (database SABLON, schema monitoring_sablon).
--
-- Aman dijalankan ulang. Hanya MENAMBAH kolom; data lama tidak diubah.
-- Butuh migration 021 (wa_proofing_requests, wa_outbox.wa_message_id) sudah dijalankan.
-- Kode aplikasi membaca kolom ini dengan aman: kalau SQL ini belum dijalankan, WhatsApp Bot
-- tetap bekerja seperti biasa, hanya fitur pesan ke pelanggan yang belum aktif.
--
--   wa_settings.notify_pelanggan   saklar pesan otomatis ke nomor pelanggan (no_hp di detail pesanan).
--                                  DEFAULT MATI: tidak ada pelanggan yang dikirimi pesan sebelum
--                                  saklar dinyalakan di Pengaturan → WhatsApp Bot.

begin;

alter table monitoring_sablon.wa_settings
  add column if not exists notify_pelanggan boolean not null default false;

-- Pencarian "proofing apa saja yang sudah dikirim ke nomor ini" (dipakai saat balasan datang)
create index if not exists wa_outbox_proofing_target_idx
  on monitoring_sablon.wa_outbox (target, created_at desc)
  where event_type = 'proofing';

commit;

notify pgrst, 'reload schema';

-- ─── Cek hasil ───────────────────────────────────────────────────────────────
--   select id, enabled, notify_pelanggan from monitoring_sablon.wa_settings;
--
--   -- Jenis pesan baru: tracking, proofing_acc, proofing_revisi (selain proofing & proofing_balasan dari 021).
--   -- Bila insert pesan ini ditolak (error "check constraint"), tabel wa_outbox punya batasan
--   -- event_type; lihat dengan:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'monitoring_sablon.wa_outbox'::regclass and contype = 'c';
--
--   -- Setelah mencoba: pesan ke pelanggan harus muncul, dan wa_message_id terisi begitu terkirim
--   select created_at, event_type, target, status, wa_message_id, last_error
--   from monitoring_sablon.wa_outbox
--   where event_type in ('tracking','proofing') order by created_at desc limit 20;
