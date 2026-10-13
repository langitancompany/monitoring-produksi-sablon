// lib/po/tabInfo.ts
//
// Ambil nama PO + ikon PO (dari Pengaturan PO) berdasarkan slug, untuk dipakai
// di generateMetadata (server). Dibungkus cache() supaya layout katalog dan
// layout reseller yang dirender bersamaan hanya memanggil Supabase SEKALI.

import { cache } from "react";
import { createClient } from "@supabase/supabase-js";

export const getPOTabInfo = cache(async (slug: string) => {
  let name = "Katalog PO";
  let iconUrl: string | null = null;

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { db: { schema: "monitoring_sablon" } },
    );
    const { data } = await supabase
      .from("po_setting")
      .select("title, icon_image_url")
      .eq("url_slug", slug)
      .maybeSingle();

    if (data?.title?.trim()) name = data.title.trim();
    iconUrl = data?.icon_image_url?.trim() || null;
  } catch {
    // gagal ambil data → pakai default
  }

  return { name, iconUrl };
});
