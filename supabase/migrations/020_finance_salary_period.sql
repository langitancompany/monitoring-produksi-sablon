-- =====================================================================
-- 020_finance_salary_period.sql
-- Gaji masuk laporan laba rugi di BULAN PERIODENYA, bukan bulan uang dicairkan.
--   Contoh: gaji Oktober ditandai dibayar 3 November
--     Laba rugi : dihitung di Oktober   (kolom baru accrual_date = 31 Okt)
--     Arus kas  : tetap di November     (spent_at = 3 Nov, cocok dengan mutasi bank)
--
-- Isi migration:
--   1. Kolom finance_expenses.accrual_date ("tanggal beban"). Pengeluaran biasa: otomatis = spent_at
--      (trigger saat insert), jadi perilaku lama tidak berubah.
--   2. Isi ulang data lama: semua baris = spent_at; baris gaji otomatis (source = 'salary')
--      diambil dari periode di source_ref ("gaji:jenis:YYYY-MM:...") -> akhir bulan periode.
--   3. fin_post_salary() diganti: baris gaji baru diberi accrual_date akhir bulan periode.
--
-- Jalankan setelah 019, di database SABLON. Aman dijalankan ulang.
-- Kode aplikasi tetap jalan walau migration ini belum dijalankan (laporan kembali ke spent_at).
--
-- Cek hasil setelah dijalankan:
--   select expense_no, spent_at, accrual_date, source_ref from finance_expenses
--    where source = 'salary' order by spent_at desc limit 20;
--   select count(*) from finance_expenses where accrual_date is null;   -- harus 0
-- =====================================================================
begin;
set local search_path to monitoring_sablon, public;

alter table finance_expenses add column if not exists accrual_date date;

create or replace function fin_expenses_set_accrual() returns trigger
language plpgsql as $$
begin
  if new.accrual_date is null then
    new.accrual_date := new.spent_at;
  end if;
  return new;
end $$;

drop trigger if exists trg_fin_expenses_accrual on finance_expenses;
create trigger trg_fin_expenses_accrual
  before insert on finance_expenses
  for each row execute function fin_expenses_set_accrual();

-- Data lama: semua = tanggal uang keluar ...
update finance_expenses set accrual_date = spent_at where accrual_date is null;

-- ... kecuali gaji otomatis: pakai akhir bulan periode gaji.
update finance_expenses
   set accrual_date = (
         to_date(substring(source_ref from '^gaji:[a-z]+:([0-9]{4}-[0-9]{2}):'), 'YYYY-MM')
         + interval '1 month' - interval '1 day'
       )::date
 where source = 'salary'
   and source_ref ~ '^gaji:[a-z]+:[0-9]{4}-[0-9]{2}:';

create index if not exists finance_expenses_accrual_date_idx on finance_expenses (accrual_date);

create or replace function fin_post_salary(
  p_actor uuid, p_actor_name text,
  p_kind text,                 -- 'manual' | 'qc' | 'tetap'
  p_user uuid, p_user_name text,
  p_period text,               -- 'YYYY-MM'
  p_paid_at date,
  p_account uuid,
  p_total bigint,
  p_lines jsonb                -- [{ "order_id": uuid|null, "amount": bigint, "label": text, "role": text }]
) returns jsonb
language plpgsql security definer set search_path = monitoring_sablon, public as $$
declare
  v_cat    uuid;
  v_prefix text;
  v_sum    bigint := 0;
  v_n      int := 0;
  v_idx    int := 0;
  v_line   jsonb;
  v_amount bigint;
  v_order  uuid;
  v_id     uuid;
  v_no     text;
  v_accrual date;
begin
  if p_kind not in ('manual', 'qc', 'tetap') then raise exception 'FIN: Jenis gaji tidak valid'; end if;
  if p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'FIN: Periode gaji tidak valid'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'FIN: Tidak ada rincian gaji untuk dicatat';
  end if;
  if p_total is null or p_total <= 0 then raise exception 'FIN: Total gaji harus lebih dari 0'; end if;
  if p_paid_at is null or p_paid_at > current_date + 1 then raise exception 'FIN: Tanggal pembayaran tidak valid'; end if;
  -- Tanggal beban = hari terakhir bulan periode gaji (bukan tanggal uang dicairkan).
  v_accrual := (to_date(p_period, 'YYYY-MM') + interval '1 month' - interval '1 day')::date;

  if not exists (select 1 from finance_accounts where id = p_account and is_active) then
    raise exception 'FIN: Akun kas/bank untuk gaji tidak valid';
  end if;

  select id into v_cat from finance_categories where code = 'GAJI' and kind = 'expense' and is_active;
  if v_cat is null then raise exception 'FIN: Kategori "Gaji & upah" (GAJI) tidak ditemukan'; end if;

  v_prefix := 'gaji:' || p_kind || ':' || p_period || ':' || p_user::text || ':';
  perform pg_advisory_xact_lock(hashtext(v_prefix));

  -- Idempoten: bila gaji ini sudah tercatat dan masih aktif, tidak mencatat lagi.
  if exists (
    select 1 from finance_expenses
     where source = 'salary' and source_ref like v_prefix || '%' and status in ('pending', 'approved')
  ) then
    return jsonb_build_object('created', 0, 'already', true);
  end if;

  begin
    for v_line in select * from jsonb_array_elements(p_lines) loop
      v_idx := v_idx + 1;
      v_amount := (v_line ->> 'amount')::bigint;
      v_order  := nullif(v_line ->> 'order_id', '')::uuid;

      if v_amount is null or v_amount <= 0 then raise exception 'FIN: Nominal rincian gaji tidak valid'; end if;
      if v_order is not null and not exists (select 1 from orders where id = v_order) then
        raise exception 'FIN: Order pada rincian gaji tidak ditemukan';
      end if;

      v_no := 'EXP-' || to_char(p_paid_at, 'YYMM') || '-' || lpad(nextval('finance_expense_seq')::text, 5, '0');

      insert into finance_expenses (
        expense_no, category_id, account_id, order_id, source, source_ref,
        description, amount, spent_at, accrual_date, note, status, recorded_by, recorded_by_name
      ) values (
        v_no, v_cat, p_account, v_order, 'salary',
        v_prefix || v_idx::text || ':' || coalesce(v_order::text, 'umum'),
        left(coalesce(nullif(btrim(v_line ->> 'label'), ''), 'Gaji ' || p_user_name), 200),
        v_amount, p_paid_at, v_accrual,
        'Otomatis dari menu Gaji (' || p_user_name || ', ' || p_period || ')',
        'pending', p_actor, p_actor_name
      ) returning id into v_id;

      perform fin_audit(p_actor, p_actor_name, 'expense.record', 'expense', v_id, v_order, null,
        jsonb_build_object('expense_no', v_no, 'amount', v_amount, 'status', 'pending', 'source', 'salary',
                           'kind', p_kind, 'period', p_period, 'user', p_user_name), null);

      -- Gaji yang sudah dibayar tidak perlu diverifikasi lagi di Pengeluaran.
      perform fin_decide_expense(
        p_expense => v_id,
        p_actor => p_actor,
        p_actor_name => p_actor_name,
        p_is_super_admin => true,
        p_approve => true,
        p_reason => null
      );

      v_sum := v_sum + v_amount;
      v_n := v_n + 1;
    end loop;

    if v_sum <> p_total then
      raise exception 'FIN: Jumlah rincian (Rp %) tidak sama dengan total gaji (Rp %)', v_sum, p_total;
    end if;
  exception when unique_violation then
    -- Dua permintaan bersamaan untuk gaji yang sama: yang kalah dianggap sudah tercatat.
    return jsonb_build_object('created', 0, 'already', true);
  end;

  return jsonb_build_object('created', v_n, 'already', false, 'total', v_sum, 'approved', true);
end $$;

revoke all on function fin_post_salary(uuid, text, text, uuid, text, text, date, uuid, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function fin_post_salary(uuid, text, text, uuid, text, text, date, uuid, bigint, jsonb)
  to service_role;

commit;
