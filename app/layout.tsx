/*
 * Copyright 2026 [abdllahmajid]
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// app/layout.tsx

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// ✅ IMPORT THEME PROVIDER (BARU)
import { ThemeProvider } from "next-themes";

// ✅ 1. IMPORT KOMPONEN FCM MANAGER DI SINI
import FCMManager from "@/app/components/misc/FCMManager";
import InstallPrompt from "@/app/components/misc/InstallPrompt";
import { DialogProvider } from "@/app/components/ui/DialogProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sabmoon",
  description: "Aplikasi Sablon Monitoring LCO.",
  applicationName: "Sabmoon",
  // iOS: ikon layar utama & mode aplikasi penuh
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    // "?v=2" memaksa iPhone mengunduh ulang ikon (iOS menyimpan cache ikon).
    // Naikkan angkanya kalau suatu saat file apple-touch-icon.png diganti.
    apple: [
      {
        url: "/icons/apple-touch-icon.png?v=2",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "Sabmoon",
    // "black" = status bar iPhone solid hitam & konten mulai DI BAWAH-nya.
    // Jangan pakai "black-translucent": konten jadi tergambar sampai ke bawah
    // jam/baterai (header & judul tertimpa) kecuali semua halaman diberi
    // padding env(safe-area-inset-top).
    statusBarStyle: "black",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // ✅ TAMBAHKAN suppressHydrationWarning (WAJIB UNTUK NEXT-THEMES)
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* ✅ BUNGKUS KONTEN DENGAN THEME PROVIDER */}
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {/* ✅ 2. PASANG KOMPONEN DI SINI AGAR BERJALAN OTOMATIS */}
          <FCMManager />

          {/* Ajakan "Pasang aplikasi" — hanya muncul jika belum terpasang */}
          <InstallPrompt />

          <DialogProvider>{children}</DialogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
