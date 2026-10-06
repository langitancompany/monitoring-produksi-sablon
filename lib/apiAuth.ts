// lib/apiAuth.ts
//
// Helper proteksi API route.
//  - requireUser      : wajib login (session cookie Supabase), opsional cek role
//  - requireCronSecret: wajib header "Authorization: Bearer <CRON_SECRET>"

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export type AuthResult =
  | { ok: true; userId: string; role: string | null }
  | { ok: false; response: NextResponse };

export async function requireUser(
  request: NextRequest,
  allowedRoles?: string[]
): Promise<AuthResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Server belum dikonfigurasi' }, { status: 500 }),
    };
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // Read-only: refresh cookie sudah ditangani proxy.ts
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();
  const user = data?.user;

  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  let role: string | null = null;

  if (allowedRoles && allowedRoles.length > 0) {
    const { data: row } = await getSupabaseAdmin()
      .from('users')
      .select('role, roles')
      .eq('id', user.id)
      .single();

    role = row?.role ?? null;

    // Role ganda: lolos kalau role utama ATAU salah satu isi `roles` diizinkan.
    const owned: string[] = [
      ...(role ? [role] : []),
      ...(Array.isArray(row?.roles) ? row.roles : []),
    ];

    if (!owned.some((r) => allowedRoles.includes(r))) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      };
    }
  }

  return { ok: true, userId: user.id, role };
}

// Return null kalau lolos, atau NextResponse (401/500) kalau ditolak.
export function requireCronSecret(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET belum diset di server' },
      { status: 500 }
    );
  }

  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}