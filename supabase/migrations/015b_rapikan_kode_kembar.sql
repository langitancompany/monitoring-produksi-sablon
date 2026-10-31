-- 015b_rapikan_kode_kembar.sql
--
-- Merapikan kode produksi yang kembar. JALANKAN 015a (preview) DULU dan pastikan
-- hasilnya sesuai harapan. Jalankan file ini cukup SEKALI; kalau tidak ada kode
-- kembar, tidak ada yang berubah.
--
-- Aturan:
--   * "Bulan dan tahun yang sama" = bagian MM/YY pada kode (LCO-10/26-0019 -> 10/26).
--   * Untuk tiap kode kembar, pesanan yang PALING AWAL dibuat tetap memakai kode lama.
--   * Pesanan kembar lainnya mendapat nomor setelah nomor TERTINGGI di bulan/tahun itu
--     (termasuk pesanan di Sampah), berurutan menurut waktu dibuat.
--   * Salinan kode di tabel lain yang punya kolom order_id + kode_produksi
--     (mis. order_logs, production_notes) ikut diperbarui berdasarkan order_id.
--   * Semua perubahan dicatat di tabel kode_produksi_perubahan (kode lama -> baru).
--
-- Semuanya satu transaksi: kalau ada error, tidak ada yang berubah.
-- Schema: monitoring_sablon.

begin;

-- Cegah ada pesanan baru masuk selama proses (hanya beberapa detik).
lock table monitoring_sablon.orders in share row exclusive mode;

-- Catatan perubahan (untuk jaga-jaga dan untuk melacak kode lama).
create table if not exists monitoring_sablon.kode_produksi_perubahan (
  id         bigserial primary key,
  order_id   text        not null,
  kode_lama  text        not null,
  kode_baru  text        not null,
  diubah_pada timestamptz not null default now()
);
alter table monitoring_sablon.kode_produksi_perubahan enable row level security;

-- Pemetaan kode lama -> kode baru.
create temp table _map on commit drop as
with parsed as (
  select o.id, o.kode_produksi, o.created_at,
         substring(o.kode_produksi from '^LCO-(\d{2}/\d{2})-\d+$') as periode,
         (substring(o.kode_produksi from '-(\d+)$'))::int           as no
  from monitoring_sablon.orders o
  where o.kode_produksi ~ '^LCO-\d{2}/\d{2}-\d+$'
),
ranked as (
  select p.*,
         row_number() over (partition by kode_produksi order by created_at nulls last, id::text) as rn
  from parsed p
),
losers as (
  select r.*,
         row_number() over (partition by periode order by created_at nulls last, id::text) as urut
  from ranked r
  where rn > 1
),
maxno as (
  select periode, max(no) as mx from parsed group by periode
)
select l.id::text                                                    as order_id,
       l.kode_produksi                                               as kode_lama,
       'LCO-' || l.periode || '-' || lpad((m.mx + l.urut)::text, 4, '0') as kode_baru,
       l.periode                                                     as periode
from losers l
join maxno m using (periode);

-- Catat dulu, lalu ubah.
insert into monitoring_sablon.kode_produksi_perubahan (order_id, kode_lama, kode_baru)
select order_id, kode_lama, kode_baru from _map;

update monitoring_sablon.orders o
   set kode_produksi = m.kode_baru
  from _map m
 where o.id::text = m.order_id;

-- Perbarui salinan kode di tabel lain yang terhubung lewat order_id.
do $$
declare
  t record;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.columns c2
      on c2.table_schema = c.table_schema
     and c2.table_name   = c.table_name
     and c2.column_name  = 'order_id'
    join information_schema.tables tb
      on tb.table_schema = c.table_schema
     and tb.table_name   = c.table_name
     and tb.table_type   = 'BASE TABLE'
    where c.table_schema = 'monitoring_sablon'
      and c.column_name  = 'kode_produksi'
      and c.table_name not in ('orders', 'kode_produksi_perubahan')
  loop
    execute format(
      'update monitoring_sablon.%I x
          set kode_produksi = m.kode_baru
         from _map m
        where x.order_id::text = m.order_id
          and x.kode_produksi = m.kode_lama',
      t.table_name);
    raise notice 'Salinan kode diperbarui di tabel: %', t.table_name;
  end loop;
end $$;

-- Naikkan counter (dari migrasi 014) supaya pesanan berikutnya melanjutkan dari nomor terakhir.
do $$
begin
  if to_regclass('monitoring_sablon.kode_produksi_counter') is not null then
    insert into monitoring_sablon.kode_produksi_counter (periode, terakhir)
    select substring(kode_produksi from '^LCO-(\d{2}/\d{2})-'),
           max((substring(kode_produksi from '-(\d+)$'))::int)
    from monitoring_sablon.orders
    where kode_produksi ~ '^LCO-\d{2}/\d{2}-\d+$'
    group by 1
    on conflict (periode) do update
      set terakhir = greatest(monitoring_sablon.kode_produksi_counter.terakhir, excluded.terakhir);
  else
    raise notice 'Tabel kode_produksi_counter belum ada: jalankan 014_kode_produksi_atomic.sql.';
  end if;
end $$;

-- Setelah bersih, kunci di database: kode produksi tidak boleh kembar lagi.
do $$
begin
  if exists (
    select 1 from monitoring_sablon.orders group by kode_produksi having count(*) > 1
  ) then
    raise notice 'Masih ada kode kembar (format tidak standar?): unique index belum dibuat.';
  else
    create unique index if not exists orders_kode_produksi_uniq
      on monitoring_sablon.orders (kode_produksi);
  end if;
end $$;

commit;

-- HASIL: daftar perubahan yang baru saja dilakukan.
select kode_lama, kode_baru, order_id, diubah_pada
from monitoring_sablon.kode_produksi_perubahan
order by id desc
limit 50;

-- CEK: harus 0 baris.
select kode_produksi, count(*) as jumlah
from monitoring_sablon.orders
group by kode_produksi
having count(*) > 1;
