// GET /api/finance/report?from=YYYY-MM-DD&to=YYYY-MM-DD
// Laporan laba rugi bertingkat (basis tagihan: Pendapatan − HPP = Laba Kotor − Biaya Operasional = Laba Bersih)
// dan arus kas (basis uang), per bulan, per kategori, dan per order.
// Biaya di laba rugi memakai accrual_date (tanggal beban; gaji = bulan periodenya), sedangkan
// kas keluar memakai spent_at (tanggal uang keluar). Sebelum migration 020, keduanya spent_at.
// Data sensitif manajemen -> hanya yang berhak menyetujui (izin Approver keuangan) atau Super Admin.
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFinance, finFail, bad, isDate, todayWib } from '@/lib/finance/server';
import type { ReportData, ReportMonth, ReportOrder } from '@/lib/finance/types';

export const dynamic = 'force-dynamic';

const ROW_LIMIT = 5000;
const MAX_MONTHS = 60;

/** Daftar "YYYY-MM" dari bulan `from` sampai bulan `to` (inklusif). */
function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const ey = Number(to.slice(0, 4));
  const em = Number(to.slice(5, 7));
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export async function GET(req: NextRequest) {
  const guard = await requireFinance(req, 'approver');
  if (!guard.ok) return guard.response;

  const today = todayWib();
  const sp = req.nextUrl.searchParams;
  const from = sp.get('from') ?? `${today.slice(0, 4)}-01-01`;
  const to = sp.get('to') ?? today;
  if (!isDate(from) || !isDate(to) || from > to) return bad('Rentang tanggal tidak valid');

  const monthKeys = monthsBetween(from, to);
  if (monthKeys.length > MAX_MONTHS) return bad(`Rentang maksimal ${MAX_MONTHS} bulan`);

  const admin = getSupabaseAdmin();

  // Kolom baru muncul setelah migration: accrual_date (020) dan cost_type (019). Bila belum dijalankan,
  // laporan tetap jalan dengan perilaku lama (tanggal beban = tanggal uang keluar; HPP hanya dari biaya order).
  let costTypeSupported = true;
  let accrualSupported = true;
  const expQuery = () => {
    const dateCol = accrualSupported ? 'accrual_date' : 'spent_at';
    const cols =
      `amount, spent_at, ${accrualSupported ? 'accrual_date, ' : ''}order_id, category_id, ` +
      `finance_categories(${costTypeSupported ? 'name, cost_type' : 'name'})`;
    return admin
      .from('finance_expenses')
      .select(cols)
      .eq('status', 'approved')
      .gte(dateCol, from)
      .lte(dateCol, to)
      .limit(ROW_LIMIT);
  };
  let exp = await expQuery();
  for (let attempt = 0; exp.error && attempt < 2; attempt++) {
    const msg = exp.error.message ?? '';
    if (accrualSupported && /accrual_date/i.test(msg)) accrualSupported = false;
    else if (costTypeSupported && /cost_type/i.test(msg)) costTypeSupported = false;
    else break;
    exp = await expQuery();
  }

  const [inv, pay, linked, cashOut] = await Promise.all([
    admin
      .from('v_order_finance')
      .select('order_id, kode_produksi, nama_pemesan, tanggal_masuk, total, paid_verified')
      .not('invoice_id', 'is', null)
      .gte('tanggal_masuk', from)
      .lte('tanggal_masuk', to)
      .limit(ROW_LIMIT),
    admin
      .from('order_payments')
      .select('amount, kind, paid_at')
      .eq('status', 'verified')
      .gte('paid_at', from)
      .lte('paid_at', to)
      .limit(ROW_LIMIT),
    admin
      .from('finance_expenses')
      .select('amount, order_id')
      .eq('status', 'approved')
      .not('order_id', 'is', null)
      .limit(ROW_LIMIT),
    // Kas keluar mengikuti tanggal uang benar-benar keluar, terpisah dari tanggal beban di laba rugi.
    admin
      .from('finance_expenses')
      .select('amount, spent_at')
      .eq('status', 'approved')
      .gte('spent_at', from)
      .lte('spent_at', to)
      .limit(ROW_LIMIT),
  ]);
  const err = inv.error || pay.error || exp.error || linked.error || cashOut.error;
  if (err) return finFail(err);

  type InvRow = {
    order_id: string; kode_produksi: string; nama_pemesan: string;
    tanggal_masuk: string | null; total: number; paid_verified: number;
  };
  type PayRow = { amount: number; kind: string; paid_at: string };
  type ExpRow = {
    amount: number; spent_at: string; accrual_date?: string | null; order_id: string | null; category_id: string | null;
    finance_categories: { name: string; cost_type?: 'hpp' | 'operasional' } | null;
  };
  const invRows = (inv.data ?? []) as InvRow[];
  const payRows = (pay.data ?? []) as PayRow[];
  const expRows = (exp.data ?? []) as unknown as ExpRow[];
  const linkedRows = (linked.data ?? []) as { amount: number; order_id: string }[];
  const cashOutRows = (cashOut.data ?? []) as { amount: number; spent_at: string }[];

  const truncated = [invRows, payRows, expRows, linkedRows, cashOutRows].some((r) => r.length >= ROW_LIMIT);

  const idx = new Map(monthKeys.map((k, i) => [k, i]));
  const months: ReportMonth[] = monthKeys.map((month) => ({
    month, revenue: 0, expenses: 0, hpp: 0, opex: 0, gross_profit: 0, profit: 0, cash_in: 0, cash_out: 0, cash_net: 0,
  }));
  const at = (d: string | null) => (d ? idx.get(d.slice(0, 7)) : undefined);

  for (const r of invRows) {
    const i = at(r.tanggal_masuk);
    if (i !== undefined) months[i].revenue += r.total;
  }
  for (const r of payRows) {
    const i = at(r.paid_at);
    if (i !== undefined) months[i].cash_in += r.kind === 'refund' ? -r.amount : r.amount;
  }
  // Klasifikasi: HPP bila dikaitkan ke order ATAU kategorinya bertipe 'hpp'; selain itu operasional.
  const isHpp = (r: ExpRow) => r.order_id != null || r.finance_categories?.cost_type === 'hpp';

  const byCat = new Map<string, { id: string | null; name: string; cost_type: 'hpp' | 'operasional' | null; amount: number }>();
  let expensesLinked = 0;
  for (const r of expRows) {
    // Laba rugi: bulan beban (gaji Oktober yang dibayar 3 November tetap Oktober).
    const i = at(r.accrual_date ?? r.spent_at);
    if (i !== undefined) {
      if (isHpp(r)) months[i].hpp += r.amount;
      else months[i].opex += r.amount;
      months[i].expenses += r.amount;
    }
    const name = r.finance_categories?.name ?? 'Tanpa kategori';
    const key = r.category_id ?? name;
    const cur = byCat.get(key) ?? {
      id: r.category_id,
      name,
      cost_type: costTypeSupported ? (r.finance_categories?.cost_type ?? 'operasional') : null,
      amount: 0,
    };
    cur.amount += r.amount;
    byCat.set(key, cur);
    if (r.order_id) expensesLinked += r.amount;
  }
  // Arus kas: bulan uang keluar.
  for (const r of cashOutRows) {
    const i = at(r.spent_at);
    if (i !== undefined) months[i].cash_out += r.amount;
  }
  for (const m of months) {
    m.gross_profit = m.revenue - m.hpp;
    m.profit = m.revenue - m.expenses;
    m.cash_net = m.cash_in - m.cash_out;
  }

  const sum = (k: keyof ReportMonth) => months.reduce((n, m) => n + (m[k] as number), 0);
  const totalExpenses = sum('expenses');

  const directCost = new Map<string, number>();
  for (const r of linkedRows) directCost.set(r.order_id, (directCost.get(r.order_id) ?? 0) + r.amount);

  const orders: ReportOrder[] = invRows
    .map((r) => {
      const direct = directCost.get(r.order_id) ?? 0;
      return {
        order_id: r.order_id,
        kode_produksi: r.kode_produksi,
        nama_pemesan: r.nama_pemesan,
        tanggal_masuk: r.tanggal_masuk,
        total: r.total,
        paid: r.paid_verified,
        direct_cost: direct,
        gross: r.total - direct,
      };
    })
    .sort((a, b) => (b.tanggal_masuk ?? '').localeCompare(a.tanggal_masuk ?? ''));

  const out: ReportData = {
    period: { from, to },
    truncated,
    totals: {
      revenue: sum('revenue'),
      expenses: totalExpenses,
      hpp: sum('hpp'),
      opex: sum('opex'),
      gross_profit: sum('gross_profit'),
      profit: sum('revenue') - totalExpenses,
      orders_without_hpp: orders.filter((o) => o.direct_cost === 0).length,
      cash_in: sum('cash_in'),
      cash_out: sum('cash_out'),
      cash_net: sum('cash_net'),
      unpaid_billed: invRows.reduce((n, r) => n + Math.max(r.total - r.paid_verified, 0), 0),
      expenses_linked: expensesLinked,
      expenses_unlinked: totalExpenses - expensesLinked,
    },
    months,
    by_category: [...byCat.values()].sort((a, b) => b.amount - a.amount),
    cost_type_supported: costTypeSupported,
    accrual_supported: accrualSupported,
    orders: orders.slice(0, 300),
    orders_total: orders.length,
  };
  return NextResponse.json(out);
}
