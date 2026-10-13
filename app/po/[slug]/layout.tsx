// app/po/[slug]/layout.tsx
//
// Judul tab katalog PO: "(Nama PO) | Langitan.co".
// Dibuat di server supaya judulnya sudah benar sejak halaman dimuat
// (juga muncul di preview link WhatsApp), bukan baru berubah setelah data tampil.
// Ikon tab (favicon) juga diambil dari "Ikon PO" di pengaturan, jadi tiap PO bisa beda.

import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";

const BRAND = "Langitan.co";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  let name = "Katalog PO";
  let iconUrl: string | null = null;

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { db: { schema: "monitoring_sablon" } },
    );
    // Coba ambil judul + ikon. Kalau kolom icon_image_url belum dibuat (SQL belum
    // dijalankan) query ini error → ulangi hanya dengan judul agar judul tab tetap benar.
    const withIcon = await supabase
      .from("po_setting")
      .select("title, icon_image_url")
      .eq("url_slug", slug)
      .maybeSingle();

    if (!withIcon.error) {
      if (withIcon.data?.title?.trim()) name = withIcon.data.title.trim();
      iconUrl = withIcon.data?.icon_image_url?.trim() || null;
    } else {
      const titleOnly = await supabase
        .from("po_setting")
        .select("title")
        .eq("url_slug", slug)
        .maybeSingle();
      if (titleOnly.data?.title?.trim()) name = titleOnly.data.title.trim();
    }
  } catch {
    // gagal ambil data → pakai default
  }

  return {
    title: `${name} | ${BRAND}`,
    // Ikon tab per PO. Tanpa ikon → Next memakai app/favicon.ico bawaan.
    ...(iconUrl
      ? { icons: { icon: iconUrl, shortcut: iconUrl, apple: iconUrl } }
      : {}),
  };
}

export default function POSlugLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Buka koneksi ke Supabase Storage lebih awal → gambar mulai diunduh lebih cepat
  const storageOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return (
    <>
      {storageOrigin && (
        <link rel="preconnect" href={storageOrigin} crossOrigin="" />
      )}
      {children}
    </>
  );
}
