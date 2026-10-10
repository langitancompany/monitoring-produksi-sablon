// GET /api/finance/payments/:id/proof -> signed URL (60 detik) untuk membuka bukti di bucket private
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFinance, finFail, bad, isUuid, PROOF_BUCKET } from '@/lib/finance/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireFinance(req, 'view');
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!isUuid(id)) return bad('Transaksi tidak valid');

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from('order_payments').select('proof_path, proof_legacy').eq('id', id).maybeSingle();
  if (error) return finFail(error);
  if (!data) return bad('Transaksi tidak ditemukan', 404);

  let url: string | null = null;
  if (data.proof_path) {
    const signed = await admin.storage.from(PROOF_BUCKET).createSignedUrl(data.proof_path, 60);
    if (signed.error) return finFail(signed.error, 'Gagal membuka bukti');
    url = signed.data.signedUrl;
  }
  // Bukti lama (data migrasi) masih berupa URL publik di bucket lama.
  const legacy: string[] = Array.isArray(data.proof_legacy)
    ? data.proof_legacy.map((b: { url?: unknown }) => b?.url).filter((u: unknown): u is string => typeof u === 'string' && u.startsWith('https://'))
    : [];
  if (!url && legacy.length === 0) return bad('Tidak ada bukti untuk transaksi ini', 404);
  return NextResponse.json({ url, legacy });
}