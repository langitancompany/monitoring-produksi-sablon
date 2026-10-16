// app/api/cron/close-expired-po/route.ts
//
// Menonaktifkan otomatis semua PO yang periode_selesai-nya sudah lewat.
// Jadwalkan 1x sehari (mis. 00:05 WIB) di Coolify / Vercel Cron.
// Wajib header: Authorization: Bearer <CRON_SECRET>

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireCronSecret } from '@/lib/apiAuth';
import { todayWIB } from '@/lib/po/order-validation';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const admin = getSupabaseAdmin();
  const today = todayWIB();

  // Aktif + tanggal selesai lebih awal dari hari ini (WIB) → tutup.
  const { data, error } = await admin
    .from('po_setting')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('is_active', true)
    .not('periode_selesai', 'is', null)
    .lt('periode_selesai', today)
    .select('id, title, periode_selesai');

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    closed: data?.length ?? 0,
    po: data ?? [],
  });
}
