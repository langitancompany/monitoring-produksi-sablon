// app/tv/layout.tsx
//
// Font khusus halaman TV. Plus Jakarta Sans: bentuk hurufnya terbuka dan
// angkanya jelas, enak dibaca dari jarak jauh. File font di-host sendiri oleh
// Next.js saat build, jadi TV tidak perlu akses ke Google Fonts.

import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

const font = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Antrian Produksi",
};

export default function TVLayout({ children }: { children: React.ReactNode }) {
  return <div className={font.className}>{children}</div>;
}
