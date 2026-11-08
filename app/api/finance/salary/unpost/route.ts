// POST /api/finance/salary/unpost   body: { kind, user_id, period }
// Dipanggil menu Gaji saat status "Sudah Dibayar" dibatalkan: pengeluaran gaji terkait di-void
// (tidak dihapus, tercatat di audit). Idempoten: 0 baris bila belum pernah dicatat.
// Pengeluaran gaji disetujui otomatis saat dicatat, jadi pembatalan tidak menunggu izin Keuangan.
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { finFail, bad, isUuid } from '@/lib/finance/server';
import { requireSalaryAccess } from '@/lib/finance/salaryGuard';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const guard = await requireSalaryAccess(req);
  if (!guard.ok) return guard.response;
  const { actor } = guard;

  const body = await req.json().catch(() => null);
  if (!body || !['manual', 'qc', 'tetap'].includes(body.kind)) return bad('Jenis gaji tidak valid');
  if (!isUuid(body.user_id)) return bad('Karyawan tidak valid');
  if (typeof body.period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.period)) return bad('Periode tidak valid');

  const admin = getSupabaseAdmin();

  const { data, error } = await admin.rpc('fin_unpost_salary', {
    p_actor: actor.userId,
    p_actor_name: actor.name,
    p_kind: body.kind,
    p_user: body.user_id,
    p_period: body.period,
    p_reason: null,
  });
  if (error) return finFail(error);
  return NextResponse.json({ voided: typeof data === 'number' ? data : 0 });
}
