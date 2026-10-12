// GET /api/finance/expenses/:id/proof -> signed URL (60 detik) untuk membuka bukti di bucket private
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFinance, finFail, bad, isUuid, PROOF_BUCKET } from '@/lib/finance/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireFinance(req, 'view');
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!isUuid(id)) return bad('Pengeluaran tidak valid');

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from('finance_expenses').select('proof_path').eq('id', id).maybeSingle();
  if (error) return finFail(error);
  if (!data) return bad('Pengeluaran tidak ditemukan', 404);
  if (!data.proof_path) return bad('Tidak ada bukti untuk pengeluaran ini', 404);

  const signed = await admin.storage.from(PROOF_BUCKET).createSignedUrl(data.proof_path, 60);
  if (signed.error) return finFail(signed.error, 'Gagal membuka bukti');
  return NextResponse.json({ url: signed.data.signedUrl });
}
