-- 015a_preview_rapikan_kode_kembar.sql
--
-- PREVIEW (hanya membaca, tidak mengubah apa pun).
-- Menampilkan pesanan mana yang akan diganti kode produksinya oleh
-- 015b_rapikan_kode_kembar.sql, dan kode barunya.
--
-- Aturan:
--   * "Bulan dan tahun yang sama" = bagian MM/YY pada kode (LCO-10/26-0019 -> 10/26).
--   * Untuk tiap kode kembar, pesanan yang PALING AWAL dibuat tetap memakai kode lama.
--   * Pesanan kembar lainnya mendapat nomor setelah nomor TERTINGGI di bulan/tahun itu
--     (termasuk pesanan di Sampah), berurutan menurut waktu dibuat.

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
select
  l.kode_produksi                                                   as kode_lama,
  'LCO-' || l.periode || '-' || lpad((m.mx + l.urut)::text, 4, '0') as kode_baru,
  o.nama_pemesan,
  o.jenis_produksi,
  o.created_at,
  o.deleted_at,
  (select ko.nama_pemesan
     from ranked k
     join monitoring_sablon.orders ko on ko.id = k.id
    where k.kode_produksi = l.kode_produksi and k.rn = 1
    limit 1)                                                        as pemilik_kode_lama_tetap
from losers l
join maxno m using (periode)
join monitoring_sablon.orders o on o.id = l.id
order by l.periode, l.urut;

-- Kode kembar yang formatnya TIDAK standar (bukan LCO-MM/YY-NNNN) tidak ikut diproses.
-- Kalau query ini mengeluarkan baris, kabari saya:
select kode_produksi, count(*) as jumlah
from monitoring_sablon.orders
where kode_produksi !~ '^LCO-\d{2}/\d{2}-\d+$' or kode_produksi is null
group by kode_produksi
having count(*) > 1;
