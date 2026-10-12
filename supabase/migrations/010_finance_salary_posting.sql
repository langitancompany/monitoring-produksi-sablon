-- =====================================================================
-- 010_finance_salary_posting.sql
-- Menghubungkan menu GAJI -> PENGELUARAN. Jalankan setelah 008 dan 009.
--
-- Saat gaji ditandai "Sudah Dibayar", aplikasi memanggil fin_post_salary():
--   * 1 baris pengeluaran per order (biaya langsung) untuk gaji borongan, tim QC, dan bonus closing
--   * 1 baris biaya umum (tanpa order) untuk gaji tetap dan bonus manual
--   * kategori "Gaji & upah", sumber 'salary', status PENDING (masuk antrean persetujuan)
-- Saat dibatalkan, fin_unpost_salary() mem-void semua barisnya (tidak dihapus).
--
-- Aman dijalankan berulang. Semua dalam satu transaksi: tidak ada pencatatan setengah jadi.
-- Anti-dobel: source_ref unik per baris (indeks finance_expenses_source_uq dari 001) + kunci
-- advisory per (jenis, periode, karyawan), jadi klik ganda / dua orang bersamaan aman.
-- =====================================================================
begin;
set local search_path to monitoring_sablon, public;

-- Akun kas/bank tempat gaji dibayar (kode akun di finance_accounts). Ubah dengan:
--   update monitoring_sablon.finance_settings set value = '"BANK"'::jsonb where key = 'salary_default_account_code';
insert into finance_settings (key, value) values ('salary_default_account_code', '"KAS"')
on conflict (key) do nothing;

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
begin
  if p_kind not in ('manual', 'qc', 'tetap') then raise exception 'FIN: Jenis gaji tidak valid'; end if;
  if p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'FIN: Periode gaji tidak valid'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'FIN: Tidak ada rincian gaji untuk dicatat';
  end if;
  if p_total is null or p_total <= 0 then raise exception 'FIN: Total gaji harus lebih dari 0'; end if;
  if p_paid_at is null or p_paid_at > current_date + 1 then raise exception 'FIN: Tanggal pembayaran tidak valid'; end if;
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
        description, amount, spent_at, note, status, recorded_by, recorded_by_name
      ) values (
        v_no, v_cat, p_account, v_order, 'salary',
        v_prefix || v_idx::text || ':' || coalesce(v_order::text, 'umum'),
        left(coalesce(nullif(btrim(v_line ->> 'label'), ''), 'Gaji ' || p_user_name), 200),
        v_amount, p_paid_at,
        'Otomatis dari menu Gaji (' || p_user_name || ', ' || p_period || ')',
        'pending', p_actor, p_actor_name
      ) returning id into v_id;

      perform fin_audit(p_actor, p_actor_name, 'expense.record', 'expense', v_id, v_order, null,
        jsonb_build_object('expense_no', v_no, 'amount', v_amount, 'status', 'pending', 'source', 'salary',
                           'kind', p_kind, 'period', p_period, 'user', p_user_name), null);

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

  return jsonb_build_object('created', v_n, 'already', false, 'total', v_sum);
end $$;

create or replace function fin_unpost_salary(
  p_actor uuid, p_actor_name text,
  p_kind text, p_user uuid, p_period text, p_reason text
) returns int
language plpgsql security definer set search_path = monitoring_sablon, public as $$
declare
  v_prefix text;
  v_n int := 0;
  r record;
begin
  if p_kind not in ('manual', 'qc', 'tetap') then raise exception 'FIN: Jenis gaji tidak valid'; end if;
  if p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'FIN: Periode gaji tidak valid'; end if;

  v_prefix := 'gaji:' || p_kind || ':' || p_period || ':' || p_user::text || ':';
  perform pg_advisory_xact_lock(hashtext(v_prefix));

  for r in
    select id, order_id, status, amount from finance_expenses
     where source = 'salary' and source_ref like v_prefix || '%' and status in ('pending', 'approved')
       for update
  loop
    update finance_expenses
       set status = 'void', void_by = p_actor, void_by_name = p_actor_name, void_at = now(),
           void_reason = coalesce(nullif(btrim(p_reason), ''), 'Status gaji dibatalkan di menu Gaji')
     where id = r.id;

    perform fin_audit(p_actor, p_actor_name, 'expense.void', 'expense', r.id, r.order_id,
      jsonb_build_object('status', r.status, 'amount', r.amount), jsonb_build_object('status', 'void'),
      'Gaji dibatalkan dari menu Gaji');
    v_n := v_n + 1;
  end loop;

  return v_n;
end $$;

-- Hanya server (service_role) yang boleh memanggil.
revoke all on function fin_post_salary(uuid, text, text, uuid, text, text, date, uuid, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function fin_post_salary(uuid, text, text, uuid, text, text, date, uuid, bigint, jsonb)
  to service_role;
revoke all on function fin_unpost_salary(uuid, text, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function fin_unpost_salary(uuid, text, text, uuid, text, text)
  to service_role;

commit;
