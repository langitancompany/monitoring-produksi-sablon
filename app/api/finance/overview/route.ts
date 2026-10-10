// GET /api/finance/overview?from=YYYY-MM-DD&to=YYYY-MM-DD
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFinance, finFail, bad, isDate, todayWib } from '@/lib/finance/server';
import type { OverviewData } from '@/lib/finance/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireFinance(req, 'view');
  if (!guard.ok) return guard.response;

  const today = todayWib();
  const sp = req.nextUrl.searchParams;
  const from = sp.get('from') ?? `${today.slice(0, 8)}01`;
  const to = sp.get('to') ?? today;
  if (!isDate(from) || !isDate(to) || from > to) return bad('Rentang tanggal tidak valid');

  const admin = getSupabaseAdmin();
  const [paid, invoiced, aging, pending] = await Promise.all([
    admin.from('order_payments').select('amount, kind').eq('status', 'verified').gte('paid_at', from).lte('paid_at', to).limit(5000),
    admin.from('v_order_finance').select('total').not('invoice_id', 'is', null).gte('tanggal_masuk', from).lte('tanggal_masuk', to).limit(5000),
    admin.from('v_receivable_aging').select('order_id, kode_produksi, nama_pemesan, balance, days_overdue, bucket').limit(5000),
    admin.from('order_payments').select('amount, kind').eq('status', 'pending').limit(5000),
  ]);
  const err = paid.error || invoiced.error || aging.error || pending.error;
  if (err) return finFail(err);

  type Amt = { amount: number; kind: string };
  const cashIn = (paid.data as Amt[]).reduce((n, r) => n + (r.kind === 'refund' ? -r.amount : r.amount), 0);
  const tagihan = (invoiced.data as { total: number }[]).reduce((n, r) => n + r.total, 0);

  type Age = { order_id: string; kode_produksi: string; nama_pemesan: string; balance: number; days_overdue: number; bucket: string };
  const ageRows = aging.data as Age[];
  const buckets = ['belum_jatuh_tempo', 'telat_1_7', 'telat_8_30', 'telat_30_plus'];
  const agingOut = buckets.map((bucket) => {
    const rows = ageRows.filter((r) => r.bucket === bucket);
    return { bucket, count: rows.length, amount: rows.reduce((n, r) => n + r.balance, 0) };
  });
  const pendingRows = (pending.data as Amt[]).filter((r) => r.kind !== 'refund');

  const out: OverviewData = {
    period: { from, to },
    cash_in: cashIn,
    tagihan_terbit: tagihan,
    piutang_total: ageRows.reduce((n, r) => n + r.balance, 0),
    piutang_count: ageRows.length,
    piutang_overdue: agingOut.filter((a) => a.bucket !== 'belum_jatuh_tempo').reduce((n, a) => n + a.amount, 0),
    pending_count: (pending.data as Amt[]).length,
    pending_amount: pendingRows.reduce((n, r) => n + r.amount, 0),
    aging: agingOut,
    top_debtors: [...ageRows].sort((a, b) => b.balance - a.balance).slice(0, 5),
  };
  return NextResponse.json(out);
}