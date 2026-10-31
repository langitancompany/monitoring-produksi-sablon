-- 014_kode_produksi_atomic.sql
--
-- Kode produksi (LCO-MM/YY-NNNN) dibuat oleh DATABASE, bukan oleh browser.
--
-- Masalah sebelumnya: nomor dihitung di browser dari daftar pesanan yang sedang
-- terbuka. Kalau dua orang (atau dua tab/perangkat) menyimpan pesanan hampir
-- bersamaan, atau daftar belum ter-refresh, keduanya mendapat nomor yang sama.
-- Nomor juga bisa terpakai ulang kalau pesanan terakhir dihapus permanen
-- (Sampah -> hapus permanen).
--
-- Sekarang:
--   * Satu counter per bulan, dipakai bersama SEMUA jenis produksi
--     (manual, DTF, merchandise) -> selalu urut: 0019 manual, 0020 DTF, 0021 merchandise.
--   * Penambahan counter bersifat atomik (di-lock per baris), jadi tidak mungkin kembar.
--   * Counter tidak pernah turun, jadi nomor pesanan yang dihapus tidak dipakai ulang.
--   * Trigger BEFORE INSERT selalu menimpa kode_produksi, jadi walau ada tab/PWA
--     lama yang masih mengirim kode buatan browser, kodenya tetap benar.
--
-- JALANKAN DI SUPABASE (SQL Editor) SEBELUM meng-deploy kode baru.
-- Schema: monitoring_sablon. Aman dijalankan berulang kali.

-- 1) Counter per bulan -------------------------------------------------------
create table if not exists monitoring_sablon.kode_produksi_counter (
  periode  text primary key,            -- format 'MM/YY', mis. '10/26'
  terakhir integer not null default 0   -- nomor terakhir yang sudah dipakai bulan itu
);

-- Tabel internal: tidak boleh diakses langsung dari browser.
alter table monitoring_sablon.kode_produksi_counter enable row level security;

-- 2) Isi counter dari data yang sudah ada (termasuk pesanan di Sampah) --------
insert into monitoring_sablon.kode_produksi_counter (periode, terakhir)
select
  substring(kode_produksi from '^LCO-(\d{2}/\d{2})-'),
  max((substring(kode_produksi from '-(\d+)$'))::int)
from monitoring_sablon.orders
where kode_produksi ~ '^LCO-\d{2}/\d{2}-\d+$'
group by 1
on conflict (periode) do update
  set terakhir = greatest(monitoring_sablon.kode_produksi_counter.terakhir, excluded.terakhir);

-- 3) Fungsi pengambil nomor berikutnya ----------------------------------------
create or replace function monitoring_sablon.next_kode_produksi()
returns text
language plpgsql
security definer
set search_path = monitoring_sablon, public
as $$
declare
  v_periode text;
  v_no      integer;
begin
  -- Bulan mengikuti waktu Indonesia (WIB), bukan jam server.
  v_periode := to_char(now() at time zone 'Asia/Jakarta', 'MM/YY');

  insert into kode_produksi_counter (periode, terakhir)
  values (v_periode, 1)
  on conflict (periode)
  do update set terakhir = kode_produksi_counter.terakhir + 1
  returning terakhir into v_no;

  return 'LCO-' || v_periode || '-' || lpad(v_no::text, 4, '0');
end;
$$;

-- 4) Trigger: setiap pesanan baru otomatis dapat kode dari counter --------------
create or replace function monitoring_sablon.trg_orders_set_kode()
returns trigger
language plpgsql
as $$
begin
  new.kode_produksi := monitoring_sablon.next_kode_produksi();
  return new;
end;
$$;

drop trigger if exists orders_set_kode on monitoring_sablon.orders;
create trigger orders_set_kode
  before insert on monitoring_sablon.orders
  for each row execute function monitoring_sablon.trg_orders_set_kode();

-- 5) Larangan kode kembar di level database -----------------------------------
-- Hanya dibuat kalau SUDAH tidak ada kode kembar. Kalau masih ada, bagian ini
-- dilewati (pesanan baru tetap aman karena nomor dari counter); rapikan data
-- lama dulu (lihat query di bawah), lalu jalankan file ini sekali lagi.
do $$
begin
  if exists (
    select 1 from monitoring_sablon.orders
    group by kode_produksi having count(*) > 1
  ) then
    raise notice 'Masih ada kode produksi kembar di data lama: unique index BELUM dibuat.';
  else
    create unique index if not exists orders_kode_produksi_uniq
      on monitoring_sablon.orders (kode_produksi);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- CEK KODE KEMBAR (jalankan sendiri, hanya membaca):
--
--   select o.kode_produksi, o.id, o.nama_pemesan, o.jenis_produksi,
--          o.created_at, o.deleted_at
--   from monitoring_sablon.orders o
--   where o.kode_produksi in (
--     select kode_produksi from monitoring_sablon.orders
--     group by kode_produksi having count(*) > 1
--   )
--   order by o.kode_produksi, o.created_at;
--
-- CEK COUNTER:
--   select * from monitoring_sablon.kode_produksi_counter order by periode;
-- ---------------------------------------------------------------------------
