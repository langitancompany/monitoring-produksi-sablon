// proxy.ts  (pengganti middleware.ts di Next.js 16)
// HAPUS file middleware.ts — jangan ada dua-duanya.

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Batas waktu panggilan ke Supabase dari proxy. Tanpa ini, kalau Supabase
// lambat/tidak merespons, SEMUA request ikut menggantung sampai ~5 menit
// (default undici) lalu muncul "fetch failed / HeadersTimeoutError".
const SUPABASE_TIMEOUT_MS = 8000

function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const timeout = AbortSignal.timeout(SUPABASE_TIMEOUT_MS)
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout
  return fetch(input, { ...init, signal })
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return response

  const supabase = createServerClient(url, anonKey, {
    global: {
      fetch: fetchWithTimeout,
    },
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({
          request,
        })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  try {
    // Refresh session cookie
    await supabase.auth.getUser()
  } catch (err) {
    // Kalau Supabase sedang tidak bisa dijangkau, jangan sampai semua halaman ikut error
    console.error('[proxy] supabase.auth.getUser gagal:', err)
  }

  return response
}

export const config = {
  matcher: [
    // api/health & service worker dikecualikan supaya healthcheck Coolify
    // tidak memicu request ke Supabase tiap beberapa detik.
    // api/version juga dikecualikan: endpoint publik yang di-polling Dashboard
    // tiap 5 menit dan tidak butuh sesi login.
    '/((?!_next/static|_next/image|favicon.ico|api/health|api/version|firebase-messaging-sw\\.js|manifest\\.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}