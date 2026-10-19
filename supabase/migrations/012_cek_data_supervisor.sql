-- 012 (CEK DATA) — hanya MEMBACA. Mencari nilai 'supervisor' yang tersimpan sebagai DATA
-- di tabel Sablon selain tabel users (mis. log aktivitas, pengaturan, notifikasi).
-- Migrasi 012 hanya mengubah data di tabel users. Kalau hasil query ini menampilkan
-- tabel lain, itu data lama yang masih bertuliskan 'supervisor' (kabari kalau ada).

select table_name, column_name, data_type, jumlah
from (
  select c.table_name, c.column_name, c.data_type,
         (xpath('/row/c/text()', query_to_xml(
            format('select count(*) as c from %I.%I where %I::text %s %L',
                   c.table_schema, c.table_name, c.column_name,
                   case when c.data_type in ('text', 'character varying') then '=' else 'ilike' end,
                   case when c.data_type in ('text', 'character varying') then 'supervisor' else '%supervisor%' end),
            false, true, '')))[1]::text::int as jumlah
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
  where c.table_schema = 'monitoring_sablon'
    and c.data_type in ('text', 'character varying', 'ARRAY', 'jsonb', 'json')
) x
where jumlah > 0
order by table_name, column_name;
