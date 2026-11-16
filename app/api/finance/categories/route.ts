// PATCH /api/finance/categories   body: { id: uuid, cost_type: 'hpp' | 'operasional' }
// Mengubah tipe biaya sebuah kategori (dipakai Laporan untuk memisahkan HPP dan biaya operasional).
// Hanya Approver/Super Admin. Tidak mengubah transaksi; hanya cara laporan mengelompokkannya.
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFinance, finFail, bad, isUuid } from '@/lib/finance/server';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest) {
  const guard = await requireFinance(req, 'approver');
  if (!guard.ok) return guard.response;
  const { actor } = guard;

  const body = await req.json().catch(() => null);
  if (!isUuid(body?.id)) return bad('Kategori tidak valid');
  if (body.cost_type !== 'hpp' && body.cost_type !== 'operasional') return bad('Tipe biaya tidak valid');

  const admin = getSupabaseAdmin();
  const { data: before, error: bErr } = await admin
    .from('finance_categories')
    .select('id, name, cost_type')
    .eq('id', body.id)
    .maybeSingle();
  if (bErr) {
    if (/cost_type/i.test(bErr.message ?? '')) return bad('Jalankan migration 019 terlebih dahulu', 422);
    return finFail(bErr);
  }
  if (!before) return bad('Kategori tidak ditemukan', 404);
  if (before.cost_type === body.cost_type) return NextResponse.json({ category: before });

  const { data, error } = await admin
    .from('finance_categories')
    .update({ cost_type: body.cost_type })
    .eq('id', body.id)
    .select('id, name, cost_type')
    .single();
  if (error) return finFail(error);

  await admin.rpc('fin_audit', {
    p_actor: actor.userId,
    p_actor_name: actor.name,
    p_action: 'category.cost_type',
    p_entity: 'category',
    p_entity_id: data.id,
    p_order: null,
    p_before: { name: before.name, cost_type: before.cost_type },
    p_after: { name: data.name, cost_type: data.cost_type },
    p_reason: null,
  });
  return NextResponse.json({ category: data });
}
