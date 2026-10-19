-- 012 (DUMP) — hanya MEMBACA. Menghasilkan SATU sel teks berisi definisi tabel users Sablon
-- dan semua fungsi/policy yang menyebut "supervisor", supaya bisa diperiksa sebelum migrasi.
-- Cara pakai: jalankan, klik sel hasilnya, salin seluruh isinya.

select string_agg(x, E'\n\n') as definisi
from (
  select '-- USERS: kolom' || E'\n' || string_agg(
           format('%s  %s  nullable=%s  default=%s', column_name,
                  case when data_type = 'USER-DEFINED' then 'enum ' || udt_name else data_type end,
                  is_nullable, coalesce(column_default, '-')),
           E'\n' order by ordinal_position) as x
  from information_schema.columns
  where table_schema = 'monitoring_sablon' and table_name = 'users'
  union all
  select '-- USERS: constraint' || E'\n' || coalesce(string_agg(conname || ': ' || pg_get_constraintdef(oid), E'\n'), '(tidak ada)')
  from pg_constraint where conrelid = 'monitoring_sablon.users'::regclass
  union all
  select '-- USERS: trigger' || E'\n' || coalesce(string_agg(pg_get_triggerdef(oid), E'\n'), '(tidak ada)')
  from pg_trigger where tgrelid = 'monitoring_sablon.users'::regclass and not tgisinternal
  union all
  select '-- USERS: policy' || E'\n' || coalesce(string_agg(
           policyname || ' [' || cmd || '] USING ' || coalesce(qual, '-') || ' CHECK ' || coalesce(with_check, '-'), E'\n'), '(tidak ada)')
  from pg_policies where schemaname = 'monitoring_sablon' and tablename = 'users'
  union all
  select '-- FUNGSI (ACL: ' || coalesce(p.proacl::text, 'default') || ')' || E'\n' || pg_get_functiondef(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'monitoring_sablon' and p.prokind in ('f', 'p')
    and (p.proname ilike '%supervisor%' or case when p.prokind in ('f', 'p') then pg_get_functiondef(p.oid) end ilike '%supervisor%')
  union all
  select '-- POLICY ' || tablename || ' / ' || policyname || ' [' || cmd || ']' || E'\n'
         || 'USING ' || coalesce(qual, '-') || E'\n' || 'CHECK ' || coalesce(with_check, '-')
  from pg_policies
  where schemaname = 'monitoring_sablon'
    and (coalesce(qual, '') ilike '%supervisor%' or coalesce(with_check, '') ilike '%supervisor%')
) t;
