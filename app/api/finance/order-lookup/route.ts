// GET /api/finance/order-lookup?q=...  -> cari order (kode / pemesan) untuk mengaitkan biaya langsung ke order
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFinance, finFail } from '@/lib/finance/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireFinance(req, 'view');
  if (!guard.ok) return guard.response;

  // Buang karakter yang bermakna di filter PostgREST (, ( ) * % \) agar input tidak bisa menyisipkan filter.
  const q = (req.nextUrl.searchParams.get('q') ?? '').replace(/[,()*%\\]/g, ' ').trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json({ rows: [] });

  const { data, error } = await getSupabaseAdmin()
    .from('orders')
    .select('id, kode_produksi, nama_pemesan')
    .is('deleted_at', null)
    .or(`kode_produksi.ilike.%${q}%,nama_pemesan.ilike.%${q}%`)
    .order('created_at', { ascending: false })
    .limit(15);
  if (error) return finFail(error);
  return NextResponse.json({ rows: data ?? [] });
}
