-- 025_jadwal_meja_produksi.sql
--
-- Kalender Produksi: admin menandai kapan sebuah order naik ke meja produksi
-- dan berapa hari pengerjaannya. Estimasi selesai = meja_mulai + meja_durasi - 1
-- (hari kalender), lalu dibandingkan dengan deadline permintaan customer.
--
-- JALANKAN di Supabase SQL Editor sebelum deploy kode baru: halaman pesanan
-- membaca `select *`, tetapi menyimpan jadwal akan gagal bila kolomnya belum ada.
-- Schema: monitoring_sablon. Aman dijalankan berulang.

alter table monitoring_sablon.orders
  add column if not exists meja_mulai  date,
  add column if not exists meja_durasi integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_meja_jadwal_check'
      and conrelid = 'monitoring_sablon.orders'::regclass
  ) then
    alter table monitoring_sablon.orders
      add constraint orders_meja_jadwal_check check (
        (meja_mulai is null and meja_durasi is null)
        or (meja_mulai is not null and meja_durasi between 1 and 90)
      );
  end if;
end $$;

-- Kalender membaca order yang jadwalnya menyentuh satu bulan.
create index if not exists orders_meja_mulai_idx
  on monitoring_sablon.orders (meja_mulai)
  where meja_mulai is not null and deleted_at is null;
