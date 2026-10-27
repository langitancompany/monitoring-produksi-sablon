// app/components/misc/InstallPrompt.tsx
"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, Share, PlusSquare, X, MoreHorizontal } from "lucide-react";

// Event ini belum ada di tipe TypeScript bawaan.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISS_KEY = "pwa_install_dismissed_at";
const INSTALLED_KEY = "pwa_installed";
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // tanya lagi setelah 7 hari
const SHOW_DELAY_MS = 3000; // jangan langsung muncul saat halaman baru dibuka

// Halaman yang tidak perlu ajakan install (layar TV, dsb.)
const EXCLUDED_PREFIXES = ["/tv"];

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    // iOS Safari
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// Mode petunjuk manual untuk browser yang tidak punya prompt install otomatis.
type ManualMode = "ios-safari" | "ios-other" | "mac-safari";

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOS;
}

// Versi iOS dari user agent (iPadOS mode desktop tidak menyertakannya → null).
function iosVersion(): [number, number] | null {
  const m = navigator.userAgent.match(/OS (\d+)_(\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

function detectManualMode(): ManualMode | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;

  if (isIOS()) {
    // Safari iOS: selalu bisa "Tambah ke Layar Utama".
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA/.test(ua);
    if (isSafari) return "ios-safari";

    // Chrome & Edge di iOS: bisa sejak iOS/iPadOS 16.4.
    if (/CriOS|EdgiOS/.test(ua)) {
      const v = iosVersion();
      // versi tidak terbaca (iPad mode desktop) → tetap tampilkan petunjuk
      if (!v || v[0] > 16 || (v[0] === 16 && v[1] >= 4)) return "ios-other";
    }
    return null; // Firefox/Opera/dll di iOS: tidak ditangani
  }

  // Safari di Mac (Sonoma 14 / Safari 17 ke atas): File → Add to Dock.
  const isMac = /Macintosh/.test(ua) && navigator.maxTouchPoints === 0;
  const isSafariMac =
    isMac &&
    /Safari/.test(ua) &&
    !/Chrome|Chromium|Edg|OPR|Firefox|FxiOS/.test(ua);
  if (isSafariMac) {
    const m = ua.match(/Version\/(\d+)/);
    if (m && Number(m[1]) >= 17) return "mac-safari";
  }
  return null;
}

function recentlyDismissed(): boolean {
  try {
    const t = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return t > 0 && Date.now() - t < COOLDOWN_MS;
  } catch {
    return false;
  }
}

export default function InstallPrompt() {
  const pathname = usePathname();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [manualMode, setManualMode] = useState<ManualMode | null>(null);

  const excluded = EXCLUDED_PREFIXES.some((p) => pathname?.startsWith(p));

  useEffect(() => {
    if (excluded) return;
    if (isStandalone()) return; // sudah terpasang & dibuka sebagai aplikasi

    let installed = false;
    try {
      installed = localStorage.getItem(INSTALLED_KEY) === "1";
    } catch {}

    // Service worker yang sama dengan FCM (scope "/"). Mendaftarkan file yang
    // sama berulang kali aman; ini memastikan installability di browser lama
    // walaupun user belum login / belum mengizinkan notifikasi.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/firebase-messaging-sw.js", { scope: "/" })
        .catch(() => {});
    }

    let timer: ReturnType<typeof setTimeout> | undefined;

    const scheduleShow = () => {
      if (recentlyDismissed()) return;
      timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    };

    // ── Chrome / Edge / Samsung Internet / Opera (Android & desktop) ──────────
    // Event ini HANYA terpicu kalau app belum terpasang, jadi otomatis
    // "jika belum ditambahkan".
    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // tahan mini-infobar bawaan, kita tampilkan UI sendiri
      setDeferred(e as BeforeInstallPromptEvent);
      if (!installed) scheduleShow();
    };

    const onInstalled = () => {
      try {
        localStorage.setItem(INSTALLED_KEY, "1");
      } catch {}
      setVisible(false);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // ── iOS (Safari/Chrome/Edge) & Safari Mac: tidak ada event install,
    //    hanya bisa memberi petunjuk manual ─────────────────────────────────
    const manual = detectManualMode();
    if (manual && !installed) {
      setManualMode(manual);
      scheduleShow();
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, [excluded]);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) return;
    // prompt() wajib dipanggil dari klik user — browser tidak mengizinkan
    // install senyap tanpa persetujuan.
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null); // event hanya bisa dipakai sekali
    if (outcome === "accepted") {
      try {
        localStorage.setItem(INSTALLED_KEY, "1");
      } catch {}
      setVisible(false);
    } else {
      dismiss();
    }
  };

  if (excluded || !visible || (!deferred && !manualMode)) return null;

  return (
    <div
      role="dialog"
      aria-label="Pasang aplikasi"
      className="fixed inset-x-0 bottom-0 z-[9999] p-3 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-sm sm:p-0"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-192.png"
            alt=""
            width={44}
            height={44}
            className="h-11 w-11 shrink-0 rounded-xl"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              Pasang Sabmoon di perangkat Anda
            </p>
            <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
              Buka lebih cepat dari layar utama, tampil layar penuh, dan notifikasi
              lebih andal.
            </p>
          </div>
          <button
            onClick={dismiss}
            aria-label="Tutup"
            className="-mr-1 -mt-1 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {deferred ? (
          <div className="mt-3 flex gap-2">
            <button
              onClick={install}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
            >
              <Download className="h-4 w-4" />
              Pasang
            </button>
            <button
              onClick={dismiss}
              className="rounded-xl px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              Nanti
            </button>
          </div>
        ) : (
          <ol className="mt-3 space-y-2 text-xs text-gray-700 dark:text-gray-300">
            {manualMode === "mac-safari" ? (
              <li className="flex items-center gap-2">
                <PlusSquare className="h-4 w-4 shrink-0" />
                <span>
                  Di menu Safari pilih <b>File → Add to Dock…</b>, lalu klik{" "}
                  <b>Add</b>
                </span>
              </li>
            ) : (
              <>
                <li className="flex items-center gap-2">
                  {manualMode === "ios-other" ? (
                    <MoreHorizontal className="h-4 w-4 shrink-0" />
                  ) : (
                    <Share className="h-4 w-4 shrink-0" />
                  )}
                  <span>
                    {manualMode === "ios-other" ? (
                      <>
                        Ketuk ikon <b>Bagikan</b> (kotak dengan panah ke atas) di
                        bilah alamat, atau buka menu <b>⋯</b> browser
                      </>
                    ) : (
                      <>
                        Ketuk tombol <b>Bagikan</b> di Safari
                      </>
                    )}
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <PlusSquare className="h-4 w-4 shrink-0" />
                  <span>
                    Pilih <b>Tambah ke Layar Utama</b>, lalu <b>Tambah</b>
                  </span>
                </li>
              </>
            )}
          </ol>
        )}
      </div>
    </div>
  );
}
