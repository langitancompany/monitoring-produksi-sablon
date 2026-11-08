-- =====================================================================
-- 016_finance_salary_auto_approve.sql
-- Gaji yang ditandai "Sudah Dibayar" di menu Gaji langsung berstatus DISETUJUI di Pengeluaran,
-- tanpa antrean verifikasi lagi. Jalankan setelah 010.
--
-- Hanya fin_post_salary() yang diganti. Setelah tiap baris pengeluaran dicatat, fungsi memanggil
-- fin_decide_expense() (fungsi yang sama dengan tombol Setujui di Keuangan) sebagai Super Admin,
-- jadi aturan Maker tidak boleh menyetujui sendiri tidak menghalangi, dan jejak audit tetap ada.
-- fin_unpost_salary() tidak berubah: ia sudah mem-void baris berstatus pending maupun approved.
--
-- Aman dijalankan berulang. Baris gaji lama yang masih PENDING tidak disentuh (lihat blok
-- opsional di bagian bawah bila ingin ikut disetujui).
-- =====================================================================
begin;
set local search_path to monitoring_sablon, public;

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

notify pgrst, 'reload schema';

-- ─── Opsional: setujui gaji lama yang masih menunggu ─────────────────────────
-- Tidak dijalankan otomatis karena mengubah catatan keuangan yang sudah ada. Cek dulu isinya:
--   select expense_no, description, amount, spent_at
--   from monitoring_sablon.finance_expenses
--   where source = 'salary' and status = 'pending' order by spent_at;
-- Bila semuanya memang sudah dibayar, setujui sekaligus (ganti UUID dengan id Super Admin):
--   do $$
--   declare r record;
--   begin
--     for r in select id from monitoring_sablon.finance_expenses where source = 'salary' and status = 'pending' loop
--       perform monitoring_sablon.fin_decide_expense(
--         p_expense => r.id, p_actor => '00000000-0000-0000-0000-000000000000'::uuid,
--         p_actor_name => 'Super Admin', p_is_super_admin => true, p_approve => true, p_reason => null);
--     end loop;
--   end $$;
