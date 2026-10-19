-- 012 (PREVIEW) — hanya MEMBACA, tidak mengubah apa pun.
-- Jalankan sebelum 012_rename_supervisor_to_super_admin.sql.
-- Baris di schema monitoring_sablon = akan diubah otomatis (kecuali jenis "kolom/tabel/trigger/index",
-- yang hanya dilaporkan). Baris di schema lain TIDAK diubah otomatis — kabari kalau ada.

select 'user' as jenis, 'monitoring_sablon.users' as lokasi,
       role::text || ' (' || count(*) || ' user)' as detail
from monitoring_sablon.users group by role
union all
select 'fungsi', n.nspname || '.' || p.proname,
       case when p.proname ilike '%supervisor%' then 'NAMA fungsi mengandung supervisor'
            when pg_get_function_arguments(p.oid) ilike '%supervisor%' then 'PARAMETER: ' || pg_get_function_arguments(p.oid)
            else 'isi fungsi menyebut supervisor' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname not in ('pg_catalog', 'information_schema') and n.nspname not like 'pg_%'
  and p.prokind in ('f', 'p')
  and (p.proname ilike '%supervisor%' or case when p.prokind in ('f', 'p') then pg_get_functiondef(p.oid) end ilike '%supervisor%')
union all
select 'policy', schemaname || '.' || tablename, policyname
from pg_policies
where coalesce(qual, '') ilike '%supervisor%' or coalesce(with_check, '') ilike '%supervisor%'
union all
select 'constraint', c.conrelid::regclass::text, c.conname
from pg_constraint c
where c.contype = 'c' and pg_get_constraintdef(c.oid) ilike '%supervisor%'
union all
select 'view', schemaname || '.' || viewname, ''
from pg_views
where schemaname not in ('pg_catalog', 'information_schema') and definition ilike '%supervisor%'
union all
select 'enum', n.nspname || '.' || t.typname, e.enumlabel
from pg_enum e join pg_type t on t.oid = e.enumtypid join pg_namespace n on n.oid = t.typnamespace
where e.enumlabel = 'supervisor'
union all
select 'kolom', table_schema || '.' || table_name, column_name
from information_schema.columns
where table_schema not in ('pg_catalog', 'information_schema') and column_name ilike '%supervisor%'
union all
select 'tabel/trigger/index', n.nspname || '.' || c.relname, ''
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname not in ('pg_catalog', 'information_schema') and c.relname ilike '%supervisor%'
union all
select 'trigger', tgrelid::regclass::text, tgname from pg_trigger
where not tgisinternal and tgname ilike '%supervisor%'
order by 1, 2;
