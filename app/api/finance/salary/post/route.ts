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
