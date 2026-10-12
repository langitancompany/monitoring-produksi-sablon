// GET /api/finance/expense-meta -> kategori, vendor, akun kas/bank, dan pengaturan untuk form pengeluaran
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFinance, finFail, loadSettings } from '@/lib/finance/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireFinance(req, 'view');
  if (!guard.ok) return guard.response;

  const admin = getSupabaseAdmin();
  const [cat, ven, acc, s] = await Promise.all([
    admin.from('finance_categories').select('id, code, name').eq('kind', 'expense').eq('is_active', true).order('sort_order'),
    admin.from('finance_vendors').select('id, name, phone').eq('is_active', true).order('name'),
    admin.from('finance_accounts').select('id, code, name, type').eq('is_active', true).order('sort_order'),
    loadSettings(),
  ]);
  const err = cat.error || ven.error || acc.error;
  if (err) return finFail(err);

  return NextResponse.json({
    categories: cat.data ?? [],
    vendors: ven.data ?? [],
    accounts: acc.data ?? [],
    settings: {
      auto_approve_own_expense: s.auto_approve_own_expense,
      require_separate_verifier: s.require_separate_verifier,
      expense_proof_required_above: s.expense_proof_required_above,
    },
  });
}
