-- =====================================================================
-- 019_finance_category_cost_type.sql
-- Kategori biaya bertipe: HPP (biaya produksi langsung) atau Operasional.
-- Dipakai Laporan Keuangan untuk laba rugi bertingkat:
--   Pendapatan − HPP = Laba Kotor − Biaya Operasional = Laba Bersih
--
-- ATURAN KLASIFIKASI DI LAPORAN
--   Sebuah pengeluaran dihitung HPP bila:
--     (a) dikaitkan ke order (order_id terisi), ATAU
--     (b) kategorinya bertipe 'hpp'.
--   Selain itu dihitung Biaya Operasional.
--   Jadi gaji produksi per order otomatis HPP, sedangkan gaji tetap tetap Operasional.
--
-- Aman dijalankan ulang untuk bagian struktur. Bagian "isi awal" (UPDATE) hanya
-- menebak dari nama kategori — jalankan SEKALI, lalu koreksi lewat Keuangan >
-- Laporan > Biaya per kategori (klik penanda HPP/Operasional).
-- Tidak mengubah data transaksi. Jalankan di database SABLON.
-- =====================================================================
begin;
set local search_path to monitoring_sablon, public;

alter table finance_categories
  add column if not exists cost_type text not null default 'operasional';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'finance_categories_cost_type_chk'
  ) then
    alter table finance_categories
      add constraint finance_categories_cost_type_chk
      check (cost_type in ('hpp', 'operasional'));
  end if;
end $$;

-- Isi awal (tebakan dari nama; GAJI sengaja tidak termasuk).
update finance_categories
   set cost_type = 'hpp'
 where kind = 'expense'
   and cost_type = 'operasional'
   and code <> 'GAJI'
   and name ilike any (array[
     '%kaos%', '%kain%', '%bahan%', '%tinta%', '%film%',
     '%packing%', '%kemasan%', '%plastik%', '%sablon%'
   ]);

commit;

-- CEK HASIL: pastikan tiap kategori bertipe benar.
select code, name, cost_type
from monitoring_sablon.finance_categories
where kind = 'expense'
order by sort_order;
