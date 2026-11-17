-- 022 — Link pendek untuk gambar proofing di pesan WhatsApp (database SABLON, schema monitoring_sablon).
-- Link di pesan menjadi https://<domain-aplikasi>/p/<kode> dan mengarah ke gambar proofing.
-- Aman dijalankan ulang; hanya menambah kolom.

begin;

alter table monitoring_sablon.wa_proofing_requests
  add column if not exists short_code text;

create unique index if not exists wa_proofing_requests_short_code_uidx
  on monitoring_sablon.wa_proofing_requests (short_code)
  where short_code is not null;

commit;

notify pgrst, 'reload schema';
