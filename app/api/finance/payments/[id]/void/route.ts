// POST /api/finance/payments/:id/void   body: { reason: string }  (koreksi; tidak menghapus data)
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFinance, finFail, bad, isUuid } from '@/lib/finance/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireFinance(req, 'delete');
  if (!guard.ok) return guard.response;
  const { actor } = guard;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!isUuid(id) || !body || typeof body.reason !== 'string') return bad('Permintaan tidak valid');

  const { error } = await getSupabaseAdmin().rpc('fin_void_payment', {
    p_payment: id,
    p_actor: actor.userId,
    p_actor_name: actor.name,
    p_reason: body.reason.trim().slice(0, 500),
  });
  if (error) return finFail(error);
  return NextResponse.json({ ok: true });
}