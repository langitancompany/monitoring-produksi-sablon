-- 026_jadwal_meja_gabung.sql
--
-- Penanda "bisa digabung": order ini boleh berbagi meja dengan order lain di
-- tanggal yang sama (keputusan petugas produksi). Dipakai kalender untuk
-- memberi peringatan bila dua order yang tidak bisa digabung bertumpuk.
--
-- Jalankan setelah 025. Schema: monitoring_sablon. Aman dijalankan berulang.

alter table monitoring_sablon.orders
  add column if not exists meja_gabung boolean not null default false;
