-- 011_merchandise_orders.sql
--
-- Menu "Merchandise" (lanyard, totebag, gantungan kunci, dst.). Pesanan
-- merchandise disimpan di tabel `orders` yang sama (jenis_produksi =
-- 'merchandise'), jadi tagihan/pembayaran, tracking, notifikasi, log aktivitas
-- dan sampah ikut bekerja tanpa tabel baru.
--
-- JALANKAN SQL INI DI SUPABASE (SQL Editor) SEBELUM meng-deploy kode baru:
-- query tracking publik, tampilan TV, dan halaman pesanan sama-sama membaca
-- kolom steps_merchandise, sehingga akan error bila kolomnya belum ada.
--
-- Schema: monitoring_sablon (sama dengan semua client Supabase di aplikasi).
-- Aman dijalankan berulang kali.

-- (Opsional) Hanya bila versi awal migrasi ini (kolom *_lanyard) sempat dijalankan:
-- ganti nama kolomnya. Bila belum pernah, blok ini tidak melakukan apa pun.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'monitoring_sablon' and table_name = 'orders' and column_name = 'jenis_lanyard')
     and not exists (select 1 from information_schema.columns
             where table_schema = 'monitoring_sablon' and table_name = 'orders' and column_name = 'jenis_merchandise') then
    alter table monitoring_sablon.orders rename column jenis_lanyard to jenis_merchandise;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'monitoring_sablon' and table_name = 'orders' and column_name = 'steps_lanyard')
     and not exists (select 1 from information_schema.columns
             where table_schema = 'monitoring_sablon' and table_name = 'orders' and column_name = 'steps_merchandise') then
    alter table monitoring_sablon.orders rename column steps_lanyard to steps_merchandise;
  end if;
end $$;

-- Produk merchandise (value dari MERCHANDISE_PRODUCTS di types/index.ts), mis. 'lanyard', 'totebag'.
alter table monitoring_sablon.orders
  add column if not exists jenis_merchandise text;

-- Variasi produk bila ada, mis. 'stopper' / 'tanpa_stopper' untuk lanyard.
alter table monitoring_sablon.orders
  add column if not exists varian_merchandise text;

-- Langkah produksi merchandise (disalin dari template produk saat pesanan dibuat).
alter table monitoring_sablon.orders
  add column if not exists steps_merchandise jsonb not null default '[]'::jsonb;

-- Pesanan merchandise tidak punya detail ukuran (jumlah diisi manual). Bila
-- kolom ini dulu dibuat NOT NULL, perintah di bawah melonggarkannya; bila sudah
-- boleh NULL, perintah ini tidak mengubah apa pun.
alter table monitoring_sablon.orders
  alter column detail_ukuran drop not null;

comment on column monitoring_sablon.orders.jenis_merchandise is
  'Khusus pesanan merchandise (jenis_produksi = merchandise): produk, value dari MERCHANDISE_PRODUCTS.';
comment on column monitoring_sablon.orders.varian_merchandise is
  'Khusus pesanan merchandise: variasi produk (mis. stopper), value dari MERCHANDISE_PRODUCTS[].variants.';
comment on column monitoring_sablon.orders.steps_merchandise is
  'Khusus pesanan merchandise: array langkah produksi (status_update).';
