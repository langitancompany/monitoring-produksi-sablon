// lib/supabase/client.ts

import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: 'monitoring_sablon' },
      // Samakan scope cookie dengan client di app/page.tsx (login lintas subdomain
      // .langitan.co). Tanpa ini, client tambahan seperti UnitSwitcher bisa menulis
      // ulang cookie sesi sebagai cookie host-only saat token diperbarui.
      // Saat development (localhost) dimatikan supaya browser tidak menolak cookie.
      cookieOptions:
        process.env.NODE_ENV === 'production'
          ? { domain: '.langitan.co', path: '/', sameSite: 'lax', secure: true }
          : undefined,
    }
  )
}
