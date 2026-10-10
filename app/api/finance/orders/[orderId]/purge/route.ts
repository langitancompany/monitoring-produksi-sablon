// Simpan sebagai: app/api/finance/orders/[orderId]/purge/route.ts   (ganti nama file menjadi route.ts)
//
// GET  -> ringkasan data keuangan yang akan ikut terhapus + apakah user boleh menghapusnya
// POST -> hapus PERMANEN data keuangan order (tagihan, pembayaran, file bukti).
//         Hanya untuk order yang sudah di Sampah. Butuh izin Keuangan -> Hapus (atau supervisor),
//         kecuali order tidak punya data keuangan sama sekali (tidak ada yang dihapus).
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFinance, finFail, bad, isUuid, PROOF_BUCKET } from '@/lib/finance/server';

export const dynamic = 'force-dynamic';

async function countFinance(orderId: string) {
  const admin = getSupabaseAdmin();
  const [inv, pay] = await Promise.all([
    admin.from('order_invoices').select('id', { count: 'exact', head: true }).eq('order_id', orderId),
    admin.from('order_payments').select('id', { count: 'exact', head: true }).eq('order_id', orderId),
  ]);
  const error = inv.error || pay.error;
  return { error, invoices: inv.count ?? 0, payments: pay.count ?? 0 };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ orderId: string }> }) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const { orderId } = await ctx.params;
  if (!isUuid(orderId)) return bad('Order tidak valid');

  const c = await countFinance(orderId);
  if (c.error) return finFail(c.error);

  let canPurge = true;
  if (c.invoices + c.payments > 0) {
    const guard = await requireFinance(req, 'delete');
    canPurge = guard.ok;
  }
  return NextResponse.json({ invoices: c.invoices, payments: c.payments, can_purge: canPurge });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ orderId: string }> }) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const { orderId } = await ctx.params;
  if (!isUuid(orderId)) return bad('Order tidak valid');

  const c = await countFinance(orderId);
  if (c.error) return finFail(c.error);
  if (c.invoices + c.payments === 0) return NextResponse.json({ invoices: 0, payments: 0 });

  const guard = await requireFinance(req, 'delete');
  if (!guard.ok) {
    return bad(
      'Order ini punya data keuangan. Hanya supervisor atau user dengan izin Keuangan → Void yang boleh menghapusnya permanen.',
      403,
    );
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc('fin_purge_order', {
    p_order: orderId,
    p_actor: guard.actor.userId,
    p_actor_name: guard.actor.name,
  });
  if (error) return finFail(error);

  // File bukti di storage dihapus setelah database berhasil (gagal hapus file tidak membatalkan).
  const proofs = ((data as { proof_paths?: string[] } | null)?.proof_paths ?? []).filter(Boolean);
  if (proofs.length > 0) {
    const rm = await admin.storage.from(PROOF_BUCKET).remove(proofs);
    if (rm.error) console.error('[finance] gagal menghapus file bukti', rm.error);
  }

  const out = data as { invoices: number; payments: number };
  return NextResponse.json({ invoices: out.invoices, payments: out.payments });
}