// POST /api/finance/expenses/:id/decide   body: { action: 'approve' | 'reject', reason?: string }
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFinance, finFail, bad, isUuid } from '@/lib/finance/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireFinance(req, 'approver');
  if (!guard.ok) return guard.response;
  const { actor } = guard;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!isUuid(id) || !body || !['approve', 'reject'].includes(body.action)) return bad('Permintaan tidak valid');

  const { data, error } = await getSupabaseAdmin().rpc('fin_decide_expense', {
    p_expense: id,
    p_actor: actor.userId,
    p_actor_name: actor.name,
    p_is_super_admin: actor.caps.isSuperAdmin,
    p_approve: body.action === 'approve',
    p_reason: typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : null,
  });
  if (error) return finFail(error);
  return NextResponse.json({ status: data });
}
