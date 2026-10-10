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

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// ✅ IMPORT THEME PROVIDER (BARU)
import { ThemeProvider } from "next-themes";

// ✅ 1. IMPORT KOMPONEN FCM MANAGER DI SINI
import FCMManager from "@/app/components/misc/FCMManager";
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

          <DialogProvider>{children}</DialogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
