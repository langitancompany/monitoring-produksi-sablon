// GET /api/finance/todo -> angka "perlu tindakan" untuk tab Panduan (antrean, piutang telat, order belum ditagih)
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFinance, finFail } from '@/lib/finance/server';
import type { TodoData } from '@/lib/finance/types';

export const dynamic = 'force-dynamic';

const DAY = 86_400_000;
const LIMIT = 5000;

/** Umur (hari) dari tanggal tertua; null bila tidak ada data. */
function oldestDays(rows: { recorded_at: string }[]): number | null {
  if (rows.length === 0) return null;
  const oldest = Math.min(...rows.map((r) => new Date(r.recorded_at).getTime()));
  return Math.max(0, Math.floor((Date.now() - oldest) / DAY));
}

export async function GET(req: NextRequest) {
  const guard = await requireFinance(req, 'view');
  if (!guard.ok) return guard.response;

  // 30 hari terakhir menurut tanggal WIB.
  const since = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(Date.now() - 30 * DAY));

  const admin = getSupabaseAdmin();
  const [pp, pe, od, ub] = await Promise.all([
    admin.from('order_payments').select('amount, recorded_at').eq('status', 'pending').neq('kind', 'refund').limit(LIMIT),
    admin.from('finance_expenses').select('amount, recorded_at').eq('status', 'pending').limit(LIMIT),
    admin.from('v_receivable_aging').select('balance').neq('bucket', 'belum_jatuh_tempo').limit(LIMIT),
    admin.from('v_order_finance').select('order_id', { count: 'exact', head: true }).is('invoice_id', null).gte('tanggal_masuk', since),
  ]);
  const err = pp.error || pe.error || od.error || ub.error;
  if (err) return finFail(err);

  type Row = { amount: number; recorded_at: string };
  const payRows = (pp.data ?? []) as Row[];
  const expRows = (pe.data ?? []) as Row[];
  const overdue = (od.data ?? []) as { balance: number }[];

  const out: TodoData = {
    pending_payments: { count: payRows.length, amount: payRows.reduce((n, r) => n + r.amount, 0), oldest_days: oldestDays(payRows) },
    pending_expenses: { count: expRows.length, amount: expRows.reduce((n, r) => n + r.amount, 0), oldest_days: oldestDays(expRows) },
    overdue: { count: overdue.length, amount: overdue.reduce((n, r) => n + r.balance, 0) },
    unbilled_recent: { count: ub.count ?? 0, since },
  };
  return NextResponse.json(out);
}
