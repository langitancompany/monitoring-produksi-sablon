// GET /api/finance/meta  -> akun kas/bank aktif, pengaturan, jumlah transaksi menunggu verifikasi
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFinance, finFail, loadSettings } from '@/lib/finance/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireFinance(req, 'view');
  if (!guard.ok) return guard.response;

  const admin = getSupabaseAdmin();
  const [acc, pend, settings] = await Promise.all([
    admin.from('finance_accounts').select('id, code, name, type').eq('is_active', true).order('sort_order'),
    admin.from('order_payments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    loadSettings(),
  ]);
  if (acc.error) return finFail(acc.error);

  return NextResponse.json({ accounts: acc.data ?? [], settings, pending_count: pend.count ?? 0 });
}