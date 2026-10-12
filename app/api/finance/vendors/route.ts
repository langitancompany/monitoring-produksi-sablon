// POST /api/finance/vendors   body: { name: string, phone?: string }  -> tambah vendor/pemasok
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFinance, finFail, bad } from '@/lib/finance/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const guard = await requireFinance(req, 'create');
  if (!guard.ok) return guard.response;
  const { actor } = guard;

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
  const phone = typeof body?.phone === 'string' ? body.phone.trim().slice(0, 30) : '';
  if (name.length < 2 || name.length > 80) return bad('Nama vendor 2–80 karakter');

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('finance_vendors')
    .insert({ name, phone: phone || null })
    .select('id, name, phone')
    .single();

  if (error) {
    if (error.code === '23505') return bad('Vendor dengan nama itu sudah ada', 422);
    return finFail(error);
  }

  await admin.rpc('fin_audit', {
    p_actor: actor.userId,
    p_actor_name: actor.name,
    p_action: 'vendor.create',
    p_entity: 'vendor',
    p_entity_id: data.id,
    p_order: null,
    p_before: null,
    p_after: { name },
    p_reason: null,
  });
  return NextResponse.json({ vendor: data });
}
