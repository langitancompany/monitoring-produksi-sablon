// app/p/[kode]/route.ts — link pendek gambar proofing: https://<aplikasi>/p/abc12345 → gambar proofing.
// Publik (tanpa login), sama seperti link gambar asli di storage. Kode acak 8 karakter, tidak berurutan.

import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ kode: string }> }) {
  const { kode } = await params;
  if (!/^[a-z0-9]{6,16}$/.test(kode)) return new NextResponse('Link tidak valid', { status: 404 });

  const { data } = await getSupabaseAdmin()
    .from('wa_proofing_requests')
    .select('file_url')
    .eq('short_code', kode)
    .maybeSingle();

  if (!data?.file_url) return new NextResponse('Link tidak ditemukan', { status: 404 });
  return NextResponse.redirect(data.file_url, 302);
}
