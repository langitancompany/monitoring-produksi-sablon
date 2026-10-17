// app/components/misc/AboutView.tsx
"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { APP_INFO, CHANGELOG } from "@/lib/changelog";
import ThemedLogo from "@/app/components/ui/ThemedLogo";

// ─── Sosial Media ─────────────────────────────────────────────────────────────
// Tambah platform baru cukup dengan menambah satu item di array SOCIALS.
const InstagramIcon = ({ className = "" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const TikTokIcon = ({ className = "" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
  </svg>
);

const SOCIALS = [
  {
    name: "Instagram",
    handle: "@langitan.co",
    url: "https://www.instagram.com/langitan.co",
    Icon: InstagramIcon,
  },
  {
    name: "TikTok",
    handle: "@langitan.co",
    url: "https://www.tiktok.com/@langitan.co",
    Icon: TikTokIcon,
  },
];

export default function AboutView() {
  const [showChangelog, setShowChangelog] = useState(false);

  return (
    <div className="flex justify-center items-start min-h-full p-2 md:p-8">
      <div className="w-full max-w-2xl lg:max-w-6xl rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-100/80 dark:bg-zinc-900/90 shadow-sm p-5 md:p-8 space-y-6 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-10">
        {/* ═══ KOLOM KIRI (layar lebar) — Logo, Detail Aplikasi, Pengembang ═══ */}
        <div className="space-y-6">
          {/* Header Aplikasi */}
          <div className="text-center">
            {/* Logo sama dengan sidebar: otomatis ganti sesuai mode terang/gelap */}
            <div className="w-16 h-16 md:w-20 md:h-20 mx-auto mb-3 flex items-center justify-center overflow-hidden">
              <ThemedLogo
                alt="Logo Langitan.co"
                className="w-full h-full object-contain"
              />
            </div>
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {APP_INFO.name}
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400 text-xs md:text-sm mt-1">
              {APP_INFO.purpose}
            </p>
          </div>

          <div className="h-px bg-zinc-200 dark:bg-zinc-800" />

          {/* Detail Aplikasi */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold tracking-tight text-zinc-800 dark:text-zinc-200">
              Detail Aplikasi
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-2 md:gap-y-3 text-xs md:text-sm">
              <p className="text-zinc-500 dark:text-zinc-400">
                Versi Saat Ini:
              </p>
              <p className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                {APP_INFO.version} (Latest)
              </p>
              <p className="text-zinc-500 dark:text-zinc-400">Platform:</p>
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                Next.js & Supabase
              </p>
            </div>
          </div>

          <div className="h-px bg-zinc-200 dark:bg-zinc-800" />

          {/* Pengembang */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold tracking-tight text-zinc-800 dark:text-zinc-200">
              Pengembang
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-2 md:gap-y-3 text-xs md:text-sm">
              <p className="text-zinc-500 dark:text-zinc-400">Dibuat Oleh:</p>
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                {APP_INFO.creator}
              </p>
              <p className="text-zinc-500 dark:text-zinc-400">
                Tanggal Peluncuran:
              </p>
              <p className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                {APP_INFO.creationDate}
              </p>
            </div>
          </div>

          {/* Sosial Media — tampil di HP (setelah Pengembang) dan di kolom kiri layar lebar */}
          <div className="h-px bg-zinc-200 dark:bg-zinc-800" />
          <div className="space-y-3">
            <h3 className="text-sm font-semibold tracking-tight text-zinc-800 dark:text-zinc-200">
              Sosial Media
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {SOCIALS.map(({ name, handle, url, Icon }) => (
                <a
                  key={name}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-md bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:border-[#124540] dark:hover:border-[#49BFB4] transition-colors duration-150 group"
                >
                  <span className="w-9 h-9 shrink-0 rounded-full bg-[#124540] text-white flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {name}
                    </span>
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400 truncate">
                      {handle}
                    </span>
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>
        {/* ═══ AKHIR KOLOM KIRI ═══ */}

        {/* Pemisah — hanya tampil di HP (di layar lebar diganti garis vertikal) */}
        <div className="h-px bg-zinc-200 dark:bg-zinc-800 lg:hidden" />

        {/* ═══ KOLOM KANAN (layar lebar) — Changelog ═══ */}
        <div className="lg:border-l lg:border-zinc-200 lg:dark:border-zinc-800 lg:pl-10">
          {/* Judul statis — hanya di layar lebar (changelog selalu terbuka) */}
          <h3 className="hidden lg:block text-sm font-semibold tracking-tight text-zinc-800 dark:text-zinc-200 mb-4">
            Riwayat Pembaruan (Changelog)
          </h3>
          <button
            onClick={() => setShowChangelog(!showChangelog)}
            className="lg:hidden w-full flex items-center justify-between p-3 rounded-md bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150 group"
          >
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Riwayat Pembaruan (Changelog)
            </span>
            {showChangelog ? (
              <ChevronUp className="w-4 h-4 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-300" />
            ) : (
              <ChevronDown className="w-4 h-4 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-300" />
            )}
          </button>

          {/* HP: tampil sesuai toggle (tetap seperti semula). Layar lebar: selalu tampil. */}
          <div className={`${showChangelog ? "block" : "hidden"} lg:block`}>
            <div className="mt-4 lg:mt-0 space-y-3 max-h-[60vh] lg:max-h-[70vh] overflow-y-auto pr-2">
              {CHANGELOG.map((log, index) => (
                <div
                  key={index}
                  className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4"
                >
                  <div className="flex items-center justify-between mb-3 border-b border-zinc-200 dark:border-zinc-800 pb-2">
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                        Versi {log.version}
                      </span>
                      {index === 0 && (
                        <span className="font-mono tabular-nums text-[10px] px-2 py-0.5 rounded-full border border-zinc-300/70 dark:border-zinc-700 bg-white/80 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300">
                          Terbaru
                        </span>
                      )}
                    </span>
                    <span className="font-mono tabular-nums text-[10px] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900 px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-800">
                      {log.date}
                    </span>
                  </div>
                  <ul className="space-y-1.5 pl-1">
                    {log.changes.map((change, idx) => (
                      <li
                        key={idx}
                        className="text-xs md:text-sm text-zinc-600 dark:text-zinc-300 flex items-start gap-2"
                      >
                        <span className="block w-1 h-1 rounded-full bg-zinc-400 dark:bg-zinc-500 mt-1.5 flex-shrink-0" />
                        <span className="leading-relaxed">{change}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* ═══ AKHIR KOLOM KANAN ═══ */}
      </div>
    </div>
  );
}
