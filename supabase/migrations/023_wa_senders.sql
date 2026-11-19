-- 023 — Banyak nomor pengirim WhatsApp (database SABLON, schema monitoring_sablon).
--
-- Aman dijalankan ulang. Hanya MENAMBAH tabel / kolom; data lama tidak diubah.
--
--   wa_senders            satu baris per nomor pengirim. Baris 'utama' = nomor yang sudah ada
--                         (sesinya tidak berubah, tidak perlu scan QR ulang).
--     id                  kode pendek (huruf kecil/angka/strip), dipakai sebagai nama folder sesi
--     label               nama tampilan, mis. "Nomor Admin 2"
--     enabled             false = sesi dihentikan (folder sesi dipertahankan)
--     tasks               jenis pesan (wa_outbox.event_type) yang dikirim lewat nomor ini.
--                         Nomor 'utama' mengirim SEMUA jenis yang tidak dialihkan ke nomor lain.
--   wa_outbox.sender_id   nomor mana yang mengirim pesan (diisi gateway; kosong = 'utama').
--                         Dipakai agar batas kirim per nomor tidak ter-reset saat gateway restart.
--
-- Gateway membaca tabel ini tiap 30 detik. Kalau SQL ini belum dijalankan, gateway tetap
-- bekerja seperti biasa dengan satu nomor.

begin;

create table if not exists monitoring_sablon.wa_senders (
  id          text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,30}$'),
  label       text        not null default '',
  enabled     boolean     not null default true,
  tasks       text[]      not null default '{}',
  created_at  timestamptz not null default now()
);

insert into monitoring_sablon.wa_senders (id, label)
values ('utama', 'Nomor Utama')
on conflict (id) do nothing;

alter table monitoring_sablon.wa_outbox
  add column if not exists sender_id text;

commit;

notify pgrst, 'reload schema';

-- ─── Cek hasil ───────────────────────────────────────────────────────────────
--   select id, label, enabled, tasks from monitoring_sablon.wa_senders order by created_at;
