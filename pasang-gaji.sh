#!/usr/bin/env bash
# =====================================================================
# pasang-gaji.sh  -  menghubungkan menu GAJI ke menu PENGELUARAN (Keuangan).
#
# CARA PAKAI (dari ROOT proyek, folder yang berisi package.json):
#     bash pasang-gaji.sh
#
# SEBELUMNYA (wajib, di Supabase SQL Editor): jalankan 010_finance_salary_posting.sql
# (skrip ini juga menaruh salinannya di supabase/migrations/). Prasyarat: SQL 008 dan 009
# sudah dijalankan dan kode Pengeluaran sudah terpasang.
#
# - 4 file baru ditulis; SalaryView.tsx dan FixedSalaryView.tsx DI-PATCH pada titik tertentu
#   (bukan ditimpa). Bila satu titik tidak cocok, file itu TIDAK diubah sama sekali.
# - File yang diubah dicadangkan ke .backup-gaji-<waktu>/. Aman dijalankan berulang.
# =====================================================================
set -e
if [ ! -f package.json ] || [ ! -d app ]; then
  echo "Jalankan dari ROOT proyek (folder yang berisi package.json dan folder app)."; exit 1
fi
if ! command -v node >/dev/null 2>&1; then echo "Node.js tidak ditemukan (dibutuhkan untuk patch)."; exit 1; fi
if [ ! -f app/api/finance/expenses/route.ts ] || [ ! -f lib/finance/expenses.ts ]; then
  echo "Kode Pengeluaran belum terpasang. Jalankan dulu: bash pasang-pengeluaran.sh"; exit 1
fi
if [ ! -f app/components/apps/SalaryView.tsx ] || [ ! -f app/components/apps/FixedSalaryView.tsx ]; then
  echo "File menu Gaji tidak ditemukan di app/components/apps/."; exit 1
fi
BK=".backup-gaji-$(date +%Y%m%d-%H%M%S)"
backup() { for f in "$@"; do if [ -f "$f" ]; then mkdir -p "$BK/$(dirname "$f")"; cp "$f" "$BK/$f"; fi; done; }
COUNT=0
write_file() {
  f="$1"; mkdir -p "$(dirname "$f")"
  if [ -f "$f" ]; then backup "$f"; echo "  timpa  $f"; else echo "  baru   $f"; fi
  cat > "$f"; COUNT=$((COUNT+1))
}
echo "Menghubungkan menu Gaji ke Keuangan..."
write_file 'lib/finance/salaryGuard.ts' <<'__GAJI_EOF__'
// lib/finance/salaryGuard.ts  (SERVER ONLY)
// Akses untuk memposting gaji ke Keuangan. Yang boleh: supervisor, atau pengguna yang memang
// punya akses menu Gaji & Upah (permission `salary`). Mereka sudah bisa menandai gaji "dibayar"
// di menu Gaji, jadi tidak diminta punya izin `keuangan` terpisah. Pengeluaran yang dibuat selalu
// berstatus PENDING sehingga tetap perlu disetujui pemegang izin `keuangan.edit`.

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export interface SalaryActor {
  userId: string;
  name: string;
  isSupervisor: boolean;
  /** boleh membatalkan (void) pengeluaran yang SUDAH disetujui: supervisor atau keuangan.delete */
  canVoidApproved: boolean;
}

type Result = { ok: true; actor: SalaryActor } | { ok: false; response: NextResponse };

export async function requireSalaryAccess(req: NextRequest): Promise<Result> {
  const auth = await requireUser(req);
  if (!auth.ok) return auth;

  const { data: row, error } = await getSupabaseAdmin()
    .from('users')
    .select('name, role, roles, permissions')
    .eq('id', auth.userId)
    .maybeSingle();
  if (error || !row) {
    return { ok: false, response: NextResponse.json({ error: 'Pengguna tidak ditemukan' }, { status: 403 }) };
  }

  const isSupervisor =
    row.role === 'supervisor' || (Array.isArray(row.roles) && row.roles.includes('supervisor'));
  const p = row.permissions?.salary;
  const allowed = isSupervisor || p?.view === true || p?.edit === true || p?.create === true;
  if (!allowed) {
    return { ok: false, response: NextResponse.json({ error: 'Anda tidak memiliki akses ke menu Gaji' }, { status: 403 }) };
  }
  const canVoidApproved = isSupervisor || row.permissions?.keuangan?.delete === true;
  return { ok: true, actor: { userId: auth.userId, name: row.name || 'User', isSupervisor, canVoidApproved } };
}
__GAJI_EOF__
write_file 'lib/finance/salaryClient.ts' <<'__GAJI_EOF__'
// lib/finance/salaryClient.ts  (aman dipakai di browser)
// Jembatan menu Gaji -> Keuangan: pembulatan rincian per order dan pemanggil API.

export type SalaryKind = 'manual' | 'qc' | 'tetap';

export interface SalaryLine {
  /** null = biaya umum (tanpa order), mis. gaji tetap */
  order_id: string | null;
  /** rupiah bulat, > 0 */
  amount: number;
  label: string;
  role?: string;
}

/** "2026-10" dari tahun dan indeks bulan 0-11 (selectedMonth di menu Gaji berbasis 0). */
export const salaryPeriodKey = (year: number, monthIndex0: number) =>
  `${year}-${String(monthIndex0 + 1).padStart(2, '0')}`;

/**
 * Membulatkan daftar nominal desimal ke rupiah bulat TANPA mengubah jumlahnya:
 * total = pembulatan dari jumlah nominal asli, lalu selisih pembulatan dibagikan ke
 * baris dengan sisa pecahan terbesar (metode "largest remainder").
 * Hasil: sum(amounts) === total, setiap nominal berbeda paling banyak Rp 1 dari aslinya.
 */
export function allocateRounded(exact: number[]): { amounts: number[]; total: number } {
  const safe = exact.map((n) => (Number.isFinite(n) && n > 0 ? n : 0));
  const total = Math.round(safe.reduce((a, b) => a + b, 0));
  const floors = safe.map((n) => Math.floor(n));
  let diff = total - floors.reduce((a, b) => a + b, 0);
  const order = safe
    .map((n, i) => ({ i, frac: n - Math.floor(n) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const amounts = [...floors];
  for (let k = 0; k < order.length && diff > 0; k++, diff--) amounts[order[k].i] += 1;
  return { amounts, total };
}

async function call<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? `Permintaan gagal (${res.status})`);
  return json as T;
}

/** Mencatat gaji ke Keuangan (pengeluaran berstatus menunggu persetujuan). Idempoten. */
export const postSalaryToFinance = (a: {
  kind: SalaryKind;
  userId: string;
  period: string;
  total: number;
  lines: SalaryLine[];
}) =>
  call<{ created: number; already: boolean }>('/api/finance/salary/post', {
    kind: a.kind,
    user_id: a.userId,
    period: a.period,
    total: a.total,
    lines: a.lines,
  });

/** Membatalkan (void) pengeluaran gaji yang tercatat. Idempoten: 0 baris bila belum pernah dicatat. */
export const unpostSalaryFromFinance = (a: { kind: SalaryKind; userId: string; period: string }) =>
  call<{ voided: number }>('/api/finance/salary/unpost', {
    kind: a.kind,
    user_id: a.userId,
    period: a.period,
  });
__GAJI_EOF__
write_file 'app/api/finance/salary/post/route.ts' <<'__GAJI_EOF__'
// POST /api/finance/salary/post
//   body: { kind: 'manual'|'qc'|'tetap', user_id, period: 'YYYY-MM', total, lines: [{ order_id|null, amount, label, role? }] }
// Dipanggil menu Gaji saat gaji ditandai "Sudah Dibayar". Mencatat 1 baris pengeluaran per rincian
// (biaya langsung bila ada order), berstatus PENDING, dalam satu transaksi database. Idempoten.
//
// Catatan kepercayaan: aturan hitung gaji (gesut lama/baru, tarif per tanggal) ada di menu Gaji,
// sehingga nominal dasar berasal dari sana. Yang DIVALIDASI di sini: akses, karyawan & order ada,
// nominal bulat > 0, jumlah rincian = total, periode tidak di masa depan.
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { finFail, bad, isUuid, isMoney, todayWib } from '@/lib/finance/server';
import { requireSalaryAccess } from '@/lib/finance/salaryGuard';

export const dynamic = 'force-dynamic';

const KINDS = ['manual', 'qc', 'tetap'];
const MAX_LINES = 300;

export async function POST(req: NextRequest) {
  const guard = await requireSalaryAccess(req);
  if (!guard.ok) return guard.response;
  const { actor } = guard;

  const body = await req.json().catch(() => null);
  if (!body || !KINDS.includes(body.kind)) return bad('Jenis gaji tidak valid');
  if (!isUuid(body.user_id)) return bad('Karyawan tidak valid');
  if (typeof body.period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.period)) return bad('Periode tidak valid');
  if (body.period > todayWib().slice(0, 7)) return bad('Periode gaji tidak boleh di masa depan');
  if (!isMoney(body.total) || body.total <= 0) return bad('Total gaji tidak valid');
  if (!Array.isArray(body.lines) || body.lines.length === 0 || body.lines.length > MAX_LINES) {
    return bad(`Rincian gaji harus berisi 1–${MAX_LINES} baris`);
  }

  type Line = { order_id: string | null; amount: number; label: string; role: string };
  const lines: Line[] = [];
  let sum = 0;
  for (const l of body.lines) {
    if (!l || !isMoney(l.amount) || l.amount <= 0) return bad('Nominal rincian tidak valid');
    if (l.order_id != null && !isUuid(l.order_id)) return bad('Order pada rincian tidak valid');
    lines.push({
      order_id: l.order_id ?? null,
      amount: l.amount,
      label: typeof l.label === 'string' ? l.label.trim().slice(0, 200) : '',
      role: typeof l.role === 'string' ? l.role.slice(0, 20) : '',
    });
    sum += l.amount;
  }
  if (sum !== body.total) return bad(`Jumlah rincian (${sum}) tidak sama dengan total (${body.total})`);

  const admin = getSupabaseAdmin();

  const { data: emp, error: eErr } = await admin.from('users').select('id, name').eq('id', body.user_id).maybeSingle();
  if (eErr) return finFail(eErr);
  if (!emp) return bad('Karyawan tidak ditemukan', 404);

  // Semua order pada rincian harus ada (dicek per potongan 80 id agar URL tidak terlalu panjang).
  const orderIds = [...new Set(lines.map((l) => l.order_id).filter((x): x is string => !!x))];
  let found = 0;
  for (let i = 0; i < orderIds.length; i += 80) {
    const { data, error } = await admin.from('orders').select('id').in('id', orderIds.slice(i, i + 80));
    if (error) return finFail(error);
    found += (data ?? []).length;
  }
  if (found !== orderIds.length) return bad('Sebagian order pada rincian tidak ditemukan', 422);

  // Akun kas/bank default untuk gaji (finance_settings.salary_default_account_code, bawaan KAS).
  const { data: s } = await admin.from('finance_settings').select('value').eq('key', 'salary_default_account_code').maybeSingle();
  const code = typeof s?.value === 'string' && s.value ? s.value : 'KAS';
  const { data: acc, error: aErr } = await admin
    .from('finance_accounts').select('id').eq('code', code).eq('is_active', true).maybeSingle();
  if (aErr) return finFail(aErr);
  if (!acc) {
    return bad(`Akun default gaji "${code}" tidak ditemukan atau nonaktif. Atur salary_default_account_code di finance_settings.`, 422);
  }

  const { data, error } = await admin.rpc('fin_post_salary', {
    p_actor: actor.userId,
    p_actor_name: actor.name,
    p_kind: body.kind,
    p_user: emp.id,
    p_user_name: emp.name || 'Karyawan',
    p_period: body.period,
    p_paid_at: todayWib(),
    p_account: acc.id,
    p_total: body.total,
    p_lines: lines,
  });
  if (error) return finFail(error);
  return NextResponse.json({ created: data?.created ?? 0, already: Boolean(data?.already) });
}
__GAJI_EOF__
write_file 'app/api/finance/salary/unpost/route.ts' <<'__GAJI_EOF__'
// POST /api/finance/salary/unpost   body: { kind, user_id, period }
// Dipanggil menu Gaji saat status "Sudah Dibayar" dibatalkan: pengeluaran gaji terkait di-void
// (tidak dihapus, tercatat di audit). Idempoten: 0 baris bila belum pernah dicatat.
// Baris yang sudah DISETUJUI hanya boleh dibatalkan supervisor / pemegang keuangan.delete.
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { finFail, bad, isUuid } from '@/lib/finance/server';
import { requireSalaryAccess } from '@/lib/finance/salaryGuard';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const guard = await requireSalaryAccess(req);
  if (!guard.ok) return guard.response;
  const { actor } = guard;

  const body = await req.json().catch(() => null);
  if (!body || !['manual', 'qc', 'tetap'].includes(body.kind)) return bad('Jenis gaji tidak valid');
  if (!isUuid(body.user_id)) return bad('Karyawan tidak valid');
  if (typeof body.period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.period)) return bad('Periode tidak valid');

  const admin = getSupabaseAdmin();

  // Pengeluaran gaji yang SUDAH DISETUJUI Keuangan tidak boleh dibatalkan hanya dari menu Gaji:
  // butuh supervisor atau pemegang hak Void di Keuangan. (Yang masih menunggu persetujuan bebas.)
  if (!actor.canVoidApproved) {
    const prefix = `gaji:${body.kind}:${body.period}:${body.user_id}:`;
    const { count, error: cErr } = await admin
      .from('finance_expenses')
      .select('id', { count: 'exact', head: true })
      .eq('source', 'salary')
      .eq('status', 'approved')
      .like('source_ref', `${prefix}%`);
    if (cErr) return finFail(cErr);
    if ((count ?? 0) > 0) {
      return bad(
        'Pengeluaran gaji ini sudah disetujui oleh Keuangan. Pembatalan harus dilakukan supervisor atau pemegang hak Void di menu Keuangan.',
        403,
      );
    }
  }

  const { data, error } = await admin.rpc('fin_unpost_salary', {
    p_actor: actor.userId,
    p_actor_name: actor.name,
    p_kind: body.kind,
    p_user: body.user_id,
    p_period: body.period,
    p_reason: null,
  });
  if (error) return finFail(error);
  return NextResponse.json({ voided: typeof data === 'number' ? data : 0 });
}
__GAJI_EOF__
write_file 'supabase/migrations/010_finance_salary_posting.sql' <<'__GAJI_EOF__'
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
__GAJI_EOF__

backup app/components/apps/SalaryView.tsx app/components/apps/FixedSalaryView.tsx
PATCHJS="$(mktemp -t patchgaji.XXXXXX)"
cat > "$PATCHJS" <<'__PATCH_EOF__'

const fs = require("fs");
const edits = {"app/components/apps/SalaryView.tsx": [["import CustomAlert, { AlertState } from \"../ui/CustomAlert\";", "import CustomAlert, { AlertState } from \"../ui/CustomAlert\";\nimport {\n  allocateRounded,\n  postSalaryToFinance,\n  unpostSalaryFromFinance,\n  salaryPeriodKey,\n  type SalaryLine,\n} from \"@/lib/finance/salaryClient\";"], ["  const doMarkPaid = async (\n    userId: string,\n    kategori: \"manual\" | \"qc\",\n    amount: number,\n  ) => {\n    const key = paymentKey(userId, kategori);\n    setMarkingPaidKey(key);\n    const { data, error } = await supabase\n", "  // Rincian gaji untuk dicatat ke Keuangan sebagai biaya langsung per order:\n  //  - manual : satu baris per order (peran PJ/Helper) dari daftar order karyawan\n  //  - qc     : satu baris per order = qty × (tarif finishing + packing) ÷ jumlah anggota tim\n  // Nominal pecahan dibulatkan (metode sisa terbesar) sehingga jumlah baris = total gaji.\n  const buildSalaryLines = (\n    userId: string,\n    kategori: \"manual\" | \"qc\",\n  ): { lines: SalaryLine[]; total: number } => {\n    const name = users.find((u) => u.id === userId)?.name || \"Karyawan\";\n    const items: { order: Order; exact: number; label: string; role?: string }[] =\n      kategori === \"manual\"\n        ? (userProductionStats[userId]?.orders ?? []).map((r) => ({\n            order: r.data,\n            exact: r.earnings,\n            role: r.role,\n            label: `Gaji borongan (${r.role}) ${name} · ${r.data.kode_produksi}`,\n          }))\n        : finishingOrders.map((o) => {\n            const d = dateOf(o);\n            const team = Math.max(dtfTeam.length, 1);\n            return {\n              order: o,\n              exact:\n                ((o.jumlah || 0) *\n                  (getRateAt(\"dtf_finishing\", d) + getRateAt(\"dtf_packing\", d))) /\n                team,\n              label: `Gaji tim finishing ${name} · ${o.kode_produksi}`,\n            };\n          });\n    const alloc = allocateRounded(items.map((i) => i.exact));\n    const lines: SalaryLine[] = items\n      .map((i, idx) => ({\n        order_id: i.order.id,\n        amount: alloc.amounts[idx],\n        label: i.label,\n        role: i.role,\n      }))\n      .filter((l) => l.amount > 0);\n    return { lines, total: alloc.total };\n  };\n\n  const doMarkPaid = async (\n    userId: string,\n    kategori: \"manual\" | \"qc\",\n    amount: number,\n  ) => {\n    const key = paymentKey(userId, kategori);\n    setMarkingPaidKey(key);\n    // Catat dulu ke Keuangan (pengeluaran masuk antrean persetujuan). Gagal = jangan tandai\n    // lunas, supaya status \"lunas\" selalu berarti sudah tercatat di Keuangan.\n    const { lines, total: postTotal } = buildSalaryLines(userId, kategori);\n    let posted = false;\n    if (postTotal > 0) {\n      try {\n        await postSalaryToFinance({\n          kind: kategori,\n          userId,\n          period: salaryPeriodKey(selectedYear, selectedMonth),\n          total: postTotal,\n          lines,\n        });\n        posted = true;\n      } catch (e) {\n        setMarkingPaidKey(null);\n        showError(\n          \"Gagal Mencatat ke Keuangan\",\n          e instanceof Error ? e.message : \"Terjadi kesalahan tak terduga.\",\n        );\n        return;\n      }\n    }\n    const { data, error } = await supabase\n"], ["    setMarkingPaidKey(null);\n    if (error || !data) {\n      showError(\n        \"Gagal Menandai Lunas\",\n", "    setMarkingPaidKey(null);\n    if (error || !data) {\n      // Pencatatan ke Keuangan sudah terjadi: batalkan agar tidak ada biaya \"menggantung\".\n      if (posted) {\n        await unpostSalaryFromFinance({\n          kind: kategori,\n          userId,\n          period: salaryPeriodKey(selectedYear, selectedMonth),\n        }).catch(() => {});\n      }\n      showError(\n        \"Gagal Menandai Lunas\",\n"], ["    const key = paymentKey(userId, kategori);\n    setMarkingPaidKey(key);\n    const { error } = await supabase.from(\"salary_payments\").delete().match({\n", "    const key = paymentKey(userId, kategori);\n    setMarkingPaidKey(key);\n    // Void pengeluaran gaji di Keuangan lebih dulu. Gagal (mis. periode sudah ditutup) = batal.\n    try {\n      await unpostSalaryFromFinance({\n        kind: kategori,\n        userId,\n        period: salaryPeriodKey(selectedYear, selectedMonth),\n      });\n    } catch (e) {\n      setMarkingPaidKey(null);\n      showError(\n        \"Gagal Membatalkan di Keuangan\",\n        e instanceof Error ? e.message : \"Terjadi kesalahan tak terduga.\",\n      );\n      return;\n    }\n    const { error } = await supabase.from(\"salary_payments\").delete().match({\n"]], "app/components/apps/FixedSalaryView.tsx": [["import { getUserRoles, hasRole, roleLabel } from \"@/lib/roles\";", "import { getUserRoles, hasRole, roleLabel } from \"@/lib/roles\";\nimport {\n  allocateRounded,\n  postSalaryToFinance,\n  unpostSalaryFromFinance,\n  salaryPeriodKey,\n  type SalaryLine,\n} from \"@/lib/finance/salaryClient\";"], ["      async () => {\n        const { error } = await supabase.from(\"salary_fixed_payments\").upsert(\n", "      async () => {\n        // Catat dulu ke Keuangan (antrean persetujuan). Gaji tetap & bonus manual = biaya umum;\n        // bonus closing terikat order = biaya langsung per order. Gagal = jangan tandai lunas.\n        const s = summary(u);\n        const items: { order_id: string | null; exact: number; label: string }[] = [\n          { order_id: null, exact: s.fixed, label: `Gaji tetap ${u.name} · ${periodLabel}` },\n          { order_id: null, exact: s.manualTotal, label: `Bonus manual ${u.name} · ${periodLabel}` },\n          ...s.closings\n            .filter((c) => c.order && c.bonus > 0)\n            .map((c) => ({\n              order_id: c.order!.id as string,\n              exact: c.bonus,\n              label: `Bonus closing ${u.name} · ${c.order!.kode_produksi}`,\n            })),\n        ];\n        const alloc = allocateRounded(items.map((i) => i.exact));\n        const lines: SalaryLine[] = items\n          .map((i, idx) => ({\n            order_id: i.order_id,\n            amount: alloc.amounts[idx],\n            label: i.label,\n          }))\n          .filter((l) => l.amount > 0);\n        let posted = false;\n        if (alloc.total > 0) {\n          try {\n            await postSalaryToFinance({\n              kind: \"tetap\",\n              userId: u.id,\n              period: salaryPeriodKey(selectedYear, selectedMonth),\n              total: alloc.total,\n              lines,\n            });\n            posted = true;\n          } catch (e) {\n            return fail(\n              \"Gagal Mencatat ke Keuangan\",\n              e instanceof Error ? e.message : \"Terjadi kesalahan tak terduga.\",\n            );\n          }\n        }\n        const { error } = await supabase.from(\"salary_fixed_payments\").upsert(\n"], ["        if (error) return fail(\"Gagal Menandai Lunas\", error.message);\n", "        if (error) {\n          // Pencatatan ke Keuangan sudah terjadi: batalkan agar tidak ada biaya \"menggantung\".\n          if (posted) {\n            await unpostSalaryFromFinance({\n              kind: \"tetap\",\n              userId: u.id,\n              period: salaryPeriodKey(selectedYear, selectedMonth),\n            }).catch(() => {});\n          }\n          return fail(\"Gagal Menandai Lunas\", error.message);\n        }\n"], ["      async () => {\n        const { error } = await supabase\n          .from(\"salary_fixed_payments\")\n          .delete()\n", "      async () => {\n        // Void pengeluaran gaji di Keuangan lebih dulu. Gagal (mis. periode ditutup) = batal.\n        try {\n          await unpostSalaryFromFinance({\n            kind: \"tetap\",\n            userId: u.id,\n            period: salaryPeriodKey(selectedYear, selectedMonth),\n          });\n        } catch (e) {\n          return fail(\n            \"Gagal Membatalkan di Keuangan\",\n            e instanceof Error ? e.message : \"Terjadi kesalahan tak terduga.\",\n          );\n        }\n        const { error } = await supabase\n          .from(\"salary_fixed_payments\")\n          .delete()\n"]]};
let problems = 0;
for (const file of Object.keys(edits)) {
  if (!fs.existsSync(file)) { console.log("  ! " + file + " tidak ditemukan."); problems++; continue; }
  let s = fs.readFileSync(file, "utf8");
  if (s.includes("@/lib/finance/salaryClient")) { console.log("  = " + file + " sudah terhubung ke Keuangan (dilewati)"); continue; }
  const missing = edits[file].filter(([a]) => s.split(a).length !== 2).map(([a]) => a.replace(/\s+/g, " ").trim().slice(0, 80));
  if (missing.length) {
    problems++;
    console.log("  ! " + file + " TIDAK diubah: file Anda berbeda dari yang saya duga pada bagian:");
    missing.forEach((m) => console.log("      - " + m));
    continue;
  }
  for (const [a, b] of edits[file]) s = s.replace(a, () => b);
  fs.writeFileSync(file, s);
  console.log("  ~ " + file + " di-patch (" + edits[file].length + " titik)");
}
process.exit(problems ? 2 : 0);
__PATCH_EOF__
set +e
node "$PATCHJS"; RC=$?
rm -f "$PATCHJS"
set -e
echo
if [ "$RC" -eq 0 ]; then
  echo "Selesai: $COUNT file baru + patch. Cadangan: $BK/"
  echo
  echo "LANGKAH BERIKUTNYA:"
  echo "  1. Supabase SQL Editor: jalankan supabase/migrations/010_finance_salary_posting.sql"
  echo "  2. (opsional) ganti akun default gaji, bawaan KAS:"
  echo "       update monitoring_sablon.finance_settings set value = '\"BANK\"'::jsonb where key = 'salary_default_account_code';"
  echo "  3. rm -rf .next && npm run dev"
  echo "  Uji: Gaji -> pilih karyawan -> Tandai Sudah Dibayar -> cek Keuangan > Pengeluaran (status Menunggu persetujuan)."
else
  echo "File baru sudah ditulis, tetapi patch otomatis tidak lengkap (lihat tanda ! di atas)."
  echo "File yang gagal di-patch TIDAK diubah. Kirimkan pesan di atas agar bisa disesuaikan."
  exit 2
fi
