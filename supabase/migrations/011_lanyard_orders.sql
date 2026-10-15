-- 011_lanyard_orders.sql
--
-- Menu "Pesanan Lanyard". Pesanan lanyard disimpan di tabel `orders` yang sama
-- (jenis_produksi = 'lanyard'), jadi tagihan/pembayaran, tracking, notifikasi,
-- log aktivitas dan sampah ikut bekerja tanpa tabel baru.
--
-- JALANKAN SQL INI DI SUPABASE (SQL Editor) SEBELUM meng-deploy kode baru:
-- query tracking publik, tampilan TV, dan halaman pesanan sama-sama membaca
-- kolom steps_lanyard, sehingga akan error bila kolomnya belum ada.
--
-- Schema: monitoring_sablon (sama dengan semua client Supabase di aplikasi).
-- Aman dijalankan berulang kali.

-- Jenis lanyard (value dari JENIS_LANYARD_OPTIONS di types/index.ts).
alter table monitoring_sablon.orders
  add column if not exists jenis_lanyard text;

-- Langkah produksi lanyard: Cetak Kertas Sublim → Produksi Sublim.
alter table monitoring_sablon.orders
  add column if not exists steps_lanyard jsonb not null default '[]'::jsonb;

-- Pesanan lanyard tidak punya detail ukuran (jumlah diisi manual). Bila kolom
-- ini dulu dibuat NOT NULL, perintah di bawah melonggarkannya; bila sudah
-- boleh NULL, perintah ini tidak mengubah apa pun.
alter table monitoring_sablon.orders
  alter column detail_ukuran drop not null;

comment on column monitoring_sablon.orders.jenis_lanyard is
  'Khusus pesanan lanyard (jenis_produksi = lanyard): value dari JENIS_LANYARD_OPTIONS.';
comment on column monitoring_sablon.orders.steps_lanyard is
  'Khusus pesanan lanyard: array langkah produksi (status_update).';
