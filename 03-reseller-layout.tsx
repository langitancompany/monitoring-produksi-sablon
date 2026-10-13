// app/po/[slug]/reseller/layout.tsx
//
// Judul tab login & portal reseller: "(Nama PO) - Reseller | Langitan.co".
// Ikon tab TIDAK ditulis di sini → otomatis diwarisi dari app/po/[slug]/layout.tsx
// (Ikon PO di Pengaturan PO), sama seperti katalog.

import type { Metadata } from "next";
import { getPOTabInfo } from "@/lib/po/tabInfo";

const BRAND = "Langitan.co";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { name } = await getPOTabInfo(slug);
  return { title: `${name} - Reseller | ${BRAND}` };
}

export default function ResellerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
