-- 012 — Ganti 'supervisor' menjadi 'super_admin' di database SABLON (schema monitoring_sablon).
--
-- URUTAN: (1) backup  (2) jalankan 012_preview_supervisor_usage.sql  (3) skrip INI
--         (4) SEGERA deploy kode aplikasi versi Super Admin.
-- Skrip berjalan dalam SATU transaksi: kalau ada langkah yang gagal, SEMUA dibatalkan
-- dan database tetap seperti semula. Konveksi dan schema lain tidak disentuh.
--
-- Yang diubah:
--   a. enum (bila kolom role/roles memakai enum) → nilai 'supervisor' di-rename
--   b. CHECK constraint yang menyebut 'supervisor' → dibuat ulang
--   c. data user: role dan roles
--   d. fungsi: nama fungsi (mis. is_admin_or_supervisor → is_admin_or_super_admin),
--      nama parameter p_is_supervisor → p_is_super_admin, literal 'supervisor' → 'super_admin',
--      dan kata "supervisor" di pesan/komentar → "Super Admin".
--      Fungsi yang parameternya berganti nama di-DROP lalu dibuat ulang (Postgres tidak
--      mengizinkan CREATE OR REPLACE untuk mengganti nama parameter); izin EXECUTE disalin.
--   e. policy RLS → ekspresinya diperbarui; f. nama policy yang memuat "supervisor" → "Super Admin"
-- Nama kolom/tabel/trigger yang mengandung "supervisor" TIDAK diubah otomatis; kalau ada,
-- daftarnya muncul di pesan NOTICE di akhir.

begin;

-- SQL-language function bisa memanggil fungsi lain yang baru dibuat ulang; jangan validasi isi dulu.
select set_config('check_function_bodies', 'off', true);

do $$
declare
  r record;
  n_enum int := 0; n_con int := 0; n_user int := 0;
  n_ren  int := 0; n_fn  int := 0; n_re  int := 0; n_pol int := 0; n_pname int := 0;
  cnt int;
  def text; newdef text; kind text;
  has_acl boolean; grantees text[]; g text; role_name text;
  using_sql text; check_sql text;
  left_fn text; left_col text;
begin
  -- a. enum ------------------------------------------------------------------------
  for r in
    select distinct format('%I.%I', n.nspname, et.typname) as typname
    from pg_attribute a
    join pg_type t  on t.oid = a.atttypid
    join pg_type et on et.oid = case when t.typtype = 'e' then t.oid
                                     when t.typcategory = 'A' then t.typelem end
    join pg_namespace n on n.oid = et.typnamespace
    where a.attrelid = 'monitoring_sablon.users'::regclass
      and a.attname in ('role', 'roles') and not a.attisdropped and et.typtype = 'e'
      and exists (select 1 from pg_enum e where e.enumtypid = et.oid and e.enumlabel = 'supervisor')
  loop
    execute format('alter type %s rename value %L to %L', r.typname, 'supervisor', 'super_admin');
    n_enum := n_enum + 1;
  end loop;

  -- b1. lepas CHECK constraint yang menyebut 'supervisor' (dipasang lagi setelah data diubah)
  create temp table _con_fix on commit drop as
    select c.conrelid::regclass::text as tbl, c.conname, pg_get_constraintdef(c.oid) as def
    from pg_constraint c join pg_namespace n on n.oid = c.connamespace
    where n.nspname = 'monitoring_sablon' and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%''supervisor''%';
  for r in select * from _con_fix loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;

  -- c. data user ---------------------------------------------------------------------
  begin
    update monitoring_sablon.users set role = 'super_admin' where role::text = 'supervisor';
    get diagnostics cnt = row_count; n_user := n_user + cnt;
  exception when invalid_text_representation then null;  -- role bertipe enum yang sudah di-rename
  end;
  begin
    update monitoring_sablon.users
       set roles = array_replace(roles, 'supervisor', 'super_admin')
     where 'supervisor' = any(roles);
    get diagnostics cnt = row_count; n_user := n_user + cnt;
  exception when invalid_text_representation or undefined_function or datatype_mismatch then null;
  end;

  -- b2. pasang lagi CHECK constraint dengan nilai baru
  for r in select * from _con_fix loop
    execute format('alter table %s add constraint %I %s',
                   r.tbl, r.conname, replace(r.def, '''supervisor''', '''super_admin'''));
    n_con := n_con + 1;
  end loop;

  -- d1. ganti NAMA fungsi yang mengandung 'supervisor' (policy/trigger mengikuti otomatis, via OID)
  for r in
    select p.oid::regprocedure::text as sig, p.proname, p.prokind
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'monitoring_sablon' and p.prokind in ('f', 'p')
      and p.proname ilike '%supervisor%'
  loop
    kind := case r.prokind when 'p' then 'procedure' else 'function' end;
    execute format('alter %s %s rename to %I', kind, r.sig,
                   regexp_replace(r.proname, 'supervisor', 'super_admin', 'gi'));
    n_ren := n_ren + 1;
  end loop;

  -- d2. ISI fungsi (dan nama parameter)
  for r in
    select p.oid, p.prokind, p.oid::regprocedure::text as sig,
           pg_get_function_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'monitoring_sablon' and p.prokind in ('f', 'p')
      and case when p.prokind in ('f', 'p') then pg_get_functiondef(p.oid) end ilike '%supervisor%'
  loop
    kind := case r.prokind when 'p' then 'procedure' else 'function' end;
    def := pg_get_functiondef(r.oid);
    newdef := replace(def, '''supervisor''', '''super_admin''');
    newdef := replace(newdef, 'p_is_supervisor', 'p_is_super_admin');
    newdef := replace(newdef, 'is_admin_or_supervisor', 'is_admin_or_super_admin');
    newdef := regexp_replace(newdef, '(?<![A-Za-z0-9_])[Ss]upervisor(?![A-Za-z0-9_])', 'Super Admin', 'g');
    continue when newdef = def;

    if r.args ilike '%supervisor%' then
      -- nama parameter berubah → DROP + CREATE; simpan lalu pulihkan izin EXECUTE
      select p.proacl is not null into has_acl from pg_proc p where p.oid = r.oid;
      select coalesce(array_agg(case when a.grantee = 0 then 'public'
                                     else quote_ident(pg_get_userbyid(a.grantee)) end), '{}')
        into grantees
      from pg_proc p, aclexplode(p.proacl) a
      where p.oid = r.oid and a.privilege_type = 'EXECUTE';

      execute format('drop %s %s', kind, r.sig);
      execute newdef;

      if has_acl then
        execute format('revoke all on %s %s from public', kind, r.sig);
        foreach role_name in array array['anon', 'authenticated', 'service_role'] loop
          if exists (select 1 from pg_roles where rolname = role_name) then
            execute format('revoke all on %s %s from %I', kind, r.sig, role_name);
          end if;
        end loop;
        foreach g in array grantees loop
          execute format('grant execute on %s %s to %s', kind, r.sig, g);
        end loop;
      end if;
      n_re := n_re + 1;
    else
      execute newdef;
      n_fn := n_fn + 1;
    end if;
  end loop;

  -- e. policy RLS ---------------------------------------------------------------------
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'monitoring_sablon'
      and (coalesce(qual, '') like '%''supervisor''%' or coalesce(with_check, '') like '%''supervisor''%')
  loop
    using_sql := case when r.qual is null then '' else
      format(' using (%s)', replace(r.qual, '''supervisor''', '''super_admin''')) end;
    check_sql := case when r.with_check is null then '' else
      format(' with check (%s)', replace(r.with_check, '''supervisor''', '''super_admin''')) end;
    execute format('alter policy %I on %I.%I%s%s',
                   r.policyname, r.schemaname, r.tablename, using_sql, check_sql);
    n_pol := n_pol + 1;
  end loop;

  -- f. NAMA policy yang mengandung 'supervisor' (hanya label; isi sudah diperbarui di langkah e)
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'monitoring_sablon' and policyname ilike '%supervisor%'
  loop
    execute format('alter policy %I on %I.%I rename to %I',
                   r.policyname, r.schemaname, r.tablename,
                   regexp_replace(r.policyname, 'supervisor', 'Super Admin', 'gi'));
    n_pname := n_pname + 1;
  end loop;

  -- sisa yang perlu ditinjau manual ----------------------------------------------------
  select string_agg(p.proname, ', ') into left_fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'monitoring_sablon' and p.prokind in ('f', 'p')
    and case when p.prokind in ('f', 'p') then pg_get_functiondef(p.oid) end ilike '%supervisor%';
  select string_agg(table_name || '.' || column_name, ', ') into left_col
  from information_schema.columns
  where table_schema = 'monitoring_sablon' and column_name ilike '%supervisor%';

  raise notice 'Selesai: enum=%, constraint=%, baris user=%, fungsi di-rename=%, fungsi diperbarui=%, fungsi dibuat ulang (parameter)=%, policy diperbarui=%, nama policy diganti=%',
               n_enum, n_con, n_user, n_ren, n_fn, n_re, n_pol, n_pname;
  raise notice 'Fungsi yang MASIH menyebut supervisor: %', coalesce(left_fn, '(tidak ada)');
  raise notice 'Kolom yang MASIH bernama supervisor: %', coalesce(left_col, '(tidak ada)');
end $$;

-- Muat ulang cache schema PostgREST supaya rpc() memakai nama fungsi/parameter yang baru.
notify pgrst, 'reload schema';

-- Pemeriksaan akhir: tidak boleh ada lagi role 'supervisor'.
select role::text as role, count(*) as jumlah
from monitoring_sablon.users group by 1 order by 1;

commit;
