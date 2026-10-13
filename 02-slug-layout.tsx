// app/po/[slug]/layout.tsx
//
// Judul tab katalog PO: "(Nama PO) | Langitan.co".
// Dibuat di server supaya judulnya sudah benar sejak halaman dimuat
// (juga muncul di preview link WhatsApp), bukan baru berubah setelah data tampil.
// Ikon tab (favicon) juga diambil dari "Ikon PO" di pengaturan, jadi tiap PO bisa beda.
// Layout ini juga membungkus halaman reseller (/po/[slug]/reseller/...), sehingga
// ikon tab ikut diwarisi ke sana.

import type { Metadata } from "next";
import { getPOTabInfo } from "@/lib/po/tabInfo";

const BRAND = "Langitan.co";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { name, iconUrl } = await getPOTabInfo(slug);

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
