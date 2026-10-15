// app/(auth)/login/page.tsx (atau lokasi file LoginScreen Anda)
"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  ClipboardList,
  Clock,
  Eye,
  EyeOff,
  LayoutDashboard,
  Loader2,
  Lock,
  Mail,
  Palette,
  Printer,
  Shirt,
} from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import ThemedLogo from "@/app/components/ui/ThemedLogo";

// ─────────────────────────────────────────────────────────────────────
// Tampilan dashboard di panel kiri dibangun dari JSX (bukan gambar) supaya
// tajam di semua layar dan otomatis ikut mode terang/gelap halaman.
// Kalau nanti mau pakai screenshot asli aplikasi, cukup ganti isi
// <DashboardMock /> dengan <img src="/dashboard.png" ... />; posisi
// kartu melayang di sekitarnya tidak perlu diubah.
// ─────────────────────────────────────────────────────────────────────

const NAV = [
  { label: "Dashboard", icon: LayoutDashboard, active: true },
  { label: "Order", icon: ClipboardList },
  { label: "Desain", icon: Palette },
  { label: "Produksi", icon: Printer },
  { label: "Laporan", icon: BarChart3 },
];

const BARS = [
  { day: "Sen", value: 46 },
  { day: "Sel", value: 68 },
  { day: "Rab", value: 55 },
  { day: "Kam", value: 92 },
  { day: "Jum", value: 78 },
  { day: "Sab", value: 38 },
];

const ORDERS = [
  {
    po: "PO-2417",
    item: "Kaos angkatan",
    qty: "120 pcs",
    status: "Cetak",
    tone: "amber",
  },
  {
    po: "PO-2416",
    item: "Kaos komunitas",
    qty: "60 pcs",
    status: "Desain",
    tone: "sky",
  },
  {
    po: "PO-2415",
    item: "Kaos event",
    qty: "200 pcs",
    status: "Selesai",
    tone: "teal",
  },
] as const;

const BADGE_TONE = {
  amber: "bg-amber-100 text-amber-700",
  sky: "bg-sky-100 text-sky-700",
  teal: "bg-[#49bfb4]/20 text-[#124540]",
} as const;

function DashboardMock() {
  return (
    <div
      aria-hidden
      className="flex w-full select-none overflow-hidden rounded-xl bg-white text-zinc-800 shadow-2xl shadow-black/30 ring-1 ring-black/5"
    >
      {/* Sidebar */}
      <div className="flex w-[92px] shrink-0 flex-col gap-0.5 border-r border-zinc-100 bg-zinc-50 p-2.5">
        <div className="mb-2 flex items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Logo Langitan.co"
            className="h-[18px] w-[18px] shrink-0 object-contain"
          />
          <span className="text-[10px] font-semibold">Langitan</span>
        </div>
        {NAV.map(({ label, icon: Icon, active }) => (
          <div
            key={label}
            className={`flex items-center gap-1.5 rounded px-1.5 py-1 text-[8.5px] font-medium ${
              active ? "bg-[#124540] text-white" : "text-zinc-500"
            }`}
          >
            <Icon className="h-2.5 w-2.5" />
            {label}
          </div>
        ))}
      </div>

      {/* Konten */}
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold">Dashboard</p>
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[8px] text-zinc-500">
            Minggu ini
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-zinc-100 p-2">
            <p className="text-[8px] text-zinc-500">Order aktif</p>
            <p className="mt-1.5 text-[15px] font-semibold leading-none">42</p>
          </div>
          <div className="rounded-lg border border-zinc-100 p-2">
            <p className="text-[8px] text-zinc-500">Selesai</p>
            <p className="mt-1.5 text-[15px] font-semibold leading-none">18</p>
          </div>
          <div className="rounded-lg border border-zinc-100 p-2">
            <p className="text-[8px] text-zinc-500">Terlambat</p>
            <p className="mt-1.5 text-[15px] font-semibold leading-none text-[#e5604d]">
              3
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-100 p-2">
          <p className="mb-1.5 text-[9px] font-semibold">
            Order selesai per hari
          </p>
          <div className="flex h-[60px] items-end gap-1.5">
            {BARS.map((b, i) => (
              <div
                key={b.day}
                className="flex h-full flex-1 flex-col justify-end"
              >
                <div
                  className={`lco-bar w-full rounded-t-sm ${
                    b.value === 92 ? "bg-[#49bfb4]" : "bg-[#124540]/15"
                  }`}
                  style={{
                    height: `${b.value}%`,
                    animationDelay: `${300 + i * 70}ms, ${1200 + i * 350}ms`,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1.5">
            {BARS.map((b) => (
              <span
                key={b.day}
                className="flex-1 text-center text-[7px] text-zinc-400"
              >
                {b.day}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-zinc-100 px-2 py-1.5">
          <p className="mb-0.5 text-[9px] font-semibold">Order terbaru</p>
          {ORDERS.map((o) => (
            <div
              key={o.po}
              className="flex items-center justify-between gap-2 border-t border-zinc-100 py-1 first:border-t-0"
            >
              <p className="min-w-0 truncate text-[8px]">
                <span className="font-semibold">{o.po}</span>{" "}
                <span className="text-zinc-500">{o.item}</span>
              </p>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="text-[7.5px] text-zinc-400">{o.qty}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[7.5px] font-medium ${BADGE_TONE[o.tone]}`}
                >
                  {o.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Screenshot asli aplikasi. Taruh file PNG di folder `public` proyek
// (public/dashboard.png). Kalau file tidak ditemukan, otomatis jatuh ke
// tampilan tiruan (<DashboardMock />) di bawah.
const DASHBOARD_IMAGE = "/dashboard.png";

// Logo Langitan.co (file ada di folder public).
const LOGO_SRC = "/icon-bedge.png";

const MOCK_WIDTH = 520;

// Tampilan tiruan dirancang pada lebar tetap 520px, lalu diperbesar/dikecilkan
// mengikuti lebar panel, jadi otomatis besar di layar lebar.
function ScaledMock() {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const update = () => {
      const k = Math.min(Math.max(outer.clientWidth / MOCK_WIDTH, 0.5), 2);
      setScale(k);
      setHeight(inner.offsetHeight * k);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(outer);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outerRef} className="w-full" style={{ height }}>
      <div
        ref={innerRef}
        style={{
          width: MOCK_WIDTH,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <DashboardMock />
      </div>
    </div>
  );
}

function DashboardVisual() {
  const imgRef = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);

  // Kalau gambar gagal dimuat sebelum React sempat memasang onError
  // (bisa terjadi di SSR), cek manual saat komponen terpasang.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) return <ScaledMock />;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={DASHBOARD_IMAGE}
      alt="Tampilan dashboard sistem produksi sablon Langitan.co"
      onError={() => setFailed(true)}
      className="block w-full rounded-xl shadow-2xl shadow-black/30 ring-1 ring-black/10"
    />
  );
}

const inputClass =
  "w-full h-11 rounded-md border border-transparent bg-zinc-100 dark:bg-zinc-800 " +
  "text-sm font-medium text-zinc-900 dark:text-zinc-100 " +
  "placeholder:font-normal placeholder:text-zinc-400 dark:placeholder:text-zinc-500 " +
  "hover:border-zinc-300 dark:hover:border-zinc-600 " +
  "focus:outline-none focus:bg-white dark:focus:bg-zinc-900 " +
  "focus:border-[#49bfb4] focus:ring-2 focus:ring-[#49bfb4]/30 " +
  "transition-colors duration-150";

export default function LoginScreen() {
  // PERBAIKAN: dibuat SEKALI saja lewat lazy initializer useState,
  // bukan setiap render. Sebelumnya client dibuat ulang di setiap
  // ketikan huruf (karena re-render), yang memicu request berulang
  // ke Supabase dan menghabiskan rate limit.
  const [supabase] = useState(() =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    ),
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (loginError) {
        throw loginError;
      }

      window.location.reload();
    } catch (err) {
      setError("Login gagal. Cek email dan password kamu, lalu coba lagi.");
      console.error("Login Error:", err instanceof Error ? err.message : err);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white dark:bg-zinc-900 transition-colors duration-150">
      {/* Animasi: kartu melayang, titik berdenyut, dan batang grafik. */}
      <style>{`
        @keyframes lcoFloatA { 0%,100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(calc(var(--lco-amp, 1) * -22px)) rotate(1deg); } }
        @keyframes lcoFloatB { 0%,100% { transform: translate(0,0); } 50% { transform: translate(calc(var(--lco-amp, 1) * -18px), calc(var(--lco-amp, 1) * 16px)); } }
        @keyframes lcoFloatC { 0%,100% { transform: translateY(0) rotate(2.5deg); } 50% { transform: translateY(calc(var(--lco-amp, 1) * 20px)) rotate(-1deg); } }
        @keyframes lcoGrow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        @keyframes lcoBreathe { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(0.78); } }
        @keyframes lcoPing { 0% { transform: scale(1); opacity: .7; } 75%, 100% { transform: scale(2.2); opacity: 0; } }
        .lco-float-a { animation: lcoFloatA 4.2s ease-in-out infinite; }
        .lco-float-b { animation: lcoFloatB 5.4s ease-in-out infinite; }
        .lco-float-c { animation: lcoFloatC 6.2s ease-in-out infinite; }
        .lco-bar { transform-origin: bottom; animation: lcoGrow 800ms cubic-bezier(.2,.7,.2,1) both, lcoBreathe 3.2s ease-in-out infinite; }
        .lco-ping { animation: lcoPing 1.6s cubic-bezier(0,0,.2,1) infinite; }
        /* Kalau perangkat memakai "Reduce motion", gerak tidak dimatikan,
           hanya diperkecil supaya tetap nyaman. */
        @media (prefers-reduced-motion: reduce) {
          .lco-float-a, .lco-float-b, .lco-float-c { --lco-amp: 0.6; }
        }
      `}</style>

      <div className="grid w-full min-h-screen md:grid-cols-2">
        {/* ── Kiri: kartu dashboard (hanya layar md ke atas) ── */}
        <aside className="hidden md:block p-3">
          <div className="flex h-full flex-col justify-between gap-8 overflow-hidden rounded-2xl bg-[#124540] p-8 text-white lg:p-10">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={LOGO_SRC}
                alt="Logo Langitan.co"
                className="h-[28px] w-[28px] object-contain"
              />
              <span className="text-xl font-semibold tracking-tight">
                Langitan.co
              </span>
            </div>

            <div className="relative w-full">
              <DashboardVisual />

              {/* Kartu kecil yang melayang di sekitar dashboard */}
              <div className="lco-float-a absolute -left-5 -top-7 z-10 w-[158px] rounded-lg bg-white p-2.5 text-zinc-800 shadow-xl shadow-black/25">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#49bfb4]/20">
                    <Printer className="h-3 w-3 text-[#124540]" />
                  </div>
                  <div className="leading-tight">
                    <p className="text-[10px] font-semibold">Antrean cetak</p>
                    <p className="text-[9px] text-zinc-500">
                      Tercetak 240 dari 300 pcs
                    </p>
                  </div>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-100">
                  <div className="h-full w-[80%] rounded-full bg-[#49bfb4]" />
                </div>
              </div>

              <div className="lco-float-b absolute -top-4 right-3 z-10 flex items-center gap-2 rounded-full bg-[#0d332f] px-3 py-1.5 text-[10px] font-medium text-white ring-1 ring-white/15 shadow-lg shadow-black/20">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-[#49bfb4] opacity-70 lco-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#49bfb4]" />
                </span>
                PO baru masuk
              </div>

              <div
                className="lco-float-c absolute -left-6 top-[46%] z-10 flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-lg shadow-black/20"
                style={{ animationDelay: "-2.5s" }}
              >
                <Shirt className="h-4 w-4 text-[#124540]" />
              </div>
              <div
                className="lco-float-a absolute -right-6 top-[34%] z-10 flex h-9 w-9 items-center justify-center rounded-xl bg-[#49bfb4] shadow-lg shadow-black/20"
                style={{ animationDelay: "-1.6s" }}
              >
                <Palette className="h-4 w-4 text-[#0a2724]" />
              </div>

              <div className="lco-float-c absolute -bottom-6 -right-4 z-10 flex items-center gap-2 rounded-lg bg-white p-2.5 pr-3.5 text-zinc-800 shadow-xl shadow-black/25">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-100">
                  <Clock className="h-3 w-3 text-amber-700" />
                </div>
                <div className="leading-tight">
                  <p className="text-[9px] text-zinc-500">Estimasi selesai</p>
                  <p className="text-[10px] font-semibold">Kamis, PO-2417</p>
                </div>
              </div>
            </div>

            <div className="text-center">
              <h1 className="text-2xl font-semibold tracking-tight lg:text-3xl">
                Produksi sablon, terpantau dalam satu layar.
              </h1>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-white/70">
                Lihat progres tiap order dari desain sampai cetak selesai, tanpa
                perlu tanya satu per satu.
              </p>
            </div>
          </div>
        </aside>

        {/* ── Kanan: form login ── */}
        <main className="flex flex-col p-8 sm:p-12">
          {/* Wordmark untuk layar sempit, karena panel kiri disembunyikan. */}
          <div className="mb-10 flex items-center gap-3 md:hidden">
            <ThemedLogo alt="" className="h-[35px] w-[35px] shrink-0 object-contain" />
            <div className="leading-tight">
              <p className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                Langitan.co
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Sistem produksi sablon
              </p>
            </div>
          </div>

          <div className="my-auto w-full max-w-sm self-center">
            <h2 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Masuk
            </h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Pakai akun yang sudah didaftarkan admin.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Email
                </label>
                <div className="relative">
                  <Mail
                    aria-hidden
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
                  />
                  <input
                    id="email"
                    type="email"
                    autoCapitalize="none"
                    autoComplete="username"
                    required
                    className={`${inputClass} pl-10 pr-3`}
                    placeholder="nama@langitan.co"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock
                    aria-hidden
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
                  />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    className={`${inputClass} pl-10 pr-11`}
                    placeholder="Masukkan password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={
                      showPassword ? "Sembunyikan password" : "Lihat password"
                    }
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-zinc-400 transition-colors duration-150 hover:text-zinc-700 focus-visible:text-[#124540] focus-visible:outline-none dark:text-zinc-500 dark:hover:text-zinc-200 dark:focus-visible:text-[#49bfb4]"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <p
                  role="alert"
                  className="border-l-2 border-red-500 bg-red-50 py-2.5 pl-3 pr-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#124540] text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#0d332f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#49bfb4] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#49bfb4] dark:text-[#0a2724] dark:hover:bg-[#5fd0c5] dark:focus-visible:ring-offset-zinc-900"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? "Memproses..." : "Masuk"}
              </button>
            </form>

            <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-400">
              Belum punya akun? Minta admin mendaftarkan email kamu.
            </p>
          </div>

          <div className="mt-10 flex items-center justify-between text-xs text-zinc-400 dark:text-zinc-500">
            <span>Sistem produksi sablon Langitan.co</span>
            <span>© {new Date().getFullYear()}</span>
          </div>
        </main>
      </div>
    </div>
  );
}
