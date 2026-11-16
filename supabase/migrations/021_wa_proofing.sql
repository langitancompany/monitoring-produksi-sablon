-- 021 — Persetujuan PROOFING lewat WhatsApp (database SABLON, schema monitoring_sablon).
--
-- Alur: proofing diupload → bot mengirim link gambar ke nomor penerima "Persetujuan proofing"
-- → penerima membalas "siap produksi" (ACC) atau "Revisi: alasan" (revisi).
--
-- Aman dijalankan ulang. Hanya MENAMBAH kolom / tabel; data lama tidak diubah.
--
--   wa_settings.notify_proofing_numbers  nomor yang dikirimi proofing & boleh membalas ACC/revisi
--   wa_outbox.wa_message_id              ID pesan WhatsApp yang terkirim (dipakai mencocokkan
--                                        balasan "swipe/reply" ke pesan proofing yang benar)
--   wa_proofing_requests                 satu baris per proofing yang menunggu keputusan

begin;

alter table monitoring_sablon.wa_settings
  add column if not exists notify_proofing_numbers text[] not null default '{}';

alter table monitoring_sablon.wa_outbox
  add column if not exists wa_message_id text;

create index if not exists wa_outbox_wa_message_id_idx
  on monitoring_sablon.wa_outbox (wa_message_id)
  where wa_message_id is not null;

create table if not exists monitoring_sablon.wa_proofing_requests (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid        not null,
  step_id       text        not null,
  kode_produksi text,
  file_url      text        not null,
  numbers       text[]      not null default '{}',   -- nomor yang dikirimi (62xxx)
  status        text        not null default 'menunggu', -- menunggu | acc | revisi | diganti | kedaluwarsa
  revisi_note   text,
  responded_by  text,                                  -- nomor yang membalas
  responded_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists wa_proofing_requests_menunggu_idx
  on monitoring_sablon.wa_proofing_requests (order_id, step_id)
  where status = 'menunggu';

-- Hanya diakses server (service role). RLS aktif tanpa policy = tertutup untuk browser.
alter table monitoring_sablon.wa_proofing_requests enable row level security;

commit;

notify pgrst, 'reload schema';

-- ─── Cek hasil ───────────────────────────────────────────────────────────────
--   select id, notify_proofing_numbers from monitoring_sablon.wa_settings;
--   select created_at, kode_produksi, status, revisi_note, responded_by
--   from monitoring_sablon.wa_proofing_requests order by created_at desc limit 20;
