// app/components/settings/settingsShared.ts
// Style & helper yang dipakai bersama oleh semua tab Pengaturan.

import { useMemo } from "react";
import { createBrowserClient } from "@supabase/ssr";

export const inputCls =
  "w-full border border-zinc-200 dark:border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600 transition-colors duration-150 placeholder-zinc-400 dark:placeholder-zinc-500";

export const labelCls =
  "block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] mb-1";

// Satu client Supabase (browser) per komponen, tidak dibuat ulang tiap render.
export function useSupabaseBrowser() {
  return useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ),
    [],
  );
}