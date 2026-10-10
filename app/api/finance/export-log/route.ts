// POST /api/finance/export-log  body: { scope: string, row_count: number }
// Mencatat siapa yang mengekspor data keuangan (ekspornya sendiri dibuat di browser).
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFinance, finFail, bad } from '@/lib/finance/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const guard = await requireFinance(req, 'view');
  if (!guard.ok) return guard.response;
  const { actor } = guard;

  const body = await req.json().catch(() => null);
  if (!body || typeof body.scope !== 'string') return bad('Permintaan tidak valid');

  const { error } = await getSupabaseAdmin().rpc('fin_audit', {
    p_actor: actor.userId,
    p_actor_name: actor.name,
    p_action: 'export.excel',
    p_entity: 'export',
    p_entity_id: null,
    p_order: null,
    p_before: null,
    p_after: { scope: body.scope.slice(0, 80), row_count: Number(body.row_count) || 0 },
    p_reason: null,
  });
  if (error) return finFail(error);
  return NextResponse.json({ ok: true });
}