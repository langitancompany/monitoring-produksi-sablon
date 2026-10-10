// GET /api/finance/orders/:orderId -> posisi keuangan + riwayat tagihan + riwayat pembayaran satu order
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFinance, finFail, bad, isUuid } from '@/lib/finance/server';
import { PAYMENT_SELECT, toPaymentRow } from '@/lib/finance/payments';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ orderId: string }> }) {
  const guard = await requireFinance(req, 'view');
  if (!guard.ok) return guard.response;

  const { orderId } = await ctx.params;
  if (!isUuid(orderId)) return bad('Order tidak valid');

  const admin = getSupabaseAdmin();
  const [fin, order, inv, pay] = await Promise.all([
    admin.from('v_order_finance').select('*').eq('order_id', orderId).maybeSingle(),
    admin.from('orders').select('id, kode_produksi, nama_pemesan, jumlah, detail_ukuran').eq('id', orderId).maybeSingle(),
    admin.from('order_invoices')
      .select('id, order_id, version, status, harga_dasar, biaya_ukuran_besar, biaya_lengan_panjang, total_pcs, subtotal, discount, total, reason, due_date, is_legacy, issued_by_name, issued_at')
      .eq('order_id', orderId).order('version', { ascending: false }),
    admin.from('order_payments').select(PAYMENT_SELECT).eq('order_id', orderId).order('recorded_at', { ascending: false }),
  ]);
  const err = fin.error || order.error || inv.error || pay.error;
  if (err) return finFail(err);
  if (!fin.data || !order.data) return bad('Order tidak ditemukan', 404);

  return NextResponse.json({
    finance: fin.data,
    order: order.data,
    invoices: inv.data ?? [],
    payments: (pay.data ?? []).map(toPaymentRow),
  });
}