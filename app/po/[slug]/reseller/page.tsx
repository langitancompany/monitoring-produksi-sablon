"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { loginReseller, getPOSettingBySlug } from "@/lib/po/supabase";
import { POSetting } from "@/types/po";
import { Package, Eye, EyeOff, MessageCircle } from "lucide-react";
import PixelTrail from "@/app/components/po/PixelTrail";

// Tinggi header (px) & seberapa "tertinggal" teks hero saat scroll (0 = ikut scroll normal)
const HEADER_H = 58;
const HERO_TEXT_LAG = 0.5;
const WIDE_BREAKPOINT = 768; // sama dengan breakpoint `md` Tailwind

export default function ResellerLoginPage() {
  const router = useRouter();
  // Slug dari path: /po/[slug]/reseller
  const params = useParams();
  const slug = params?.slug as string;

  const katalogHref = `/po/${slug}`;

  const [kode, setKode] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);

  // Logo & nama dari Pengaturan PO (sama seperti header katalog)
  const [setting, setSetting] = useState<POSetting | null>(null);
  const [settingReady, setSettingReady] = useState(!slug);
  const brandName = setting?.title?.trim() || "Portal Reseller";

  // Judul & ikon tab diatur di server: app/po/[slug]/reseller/layout.tsx
  // (+ app/po/[slug]/layout.tsx), jadi tidak perlu diatur lagi di sini.

  // Link WhatsApp admin (08xx → 628xx), sama seperti footer katalog
  const waDigits = (setting?.wa_admin_phone || "").replace(/\D/g, "");
  const waNumber = waDigits.startsWith("0")
    ? `62${waDigits.slice(1)}`
    : waDigits;
  const waLink = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`Halo admin ${brandName}, saya reseller dan butuh bantuan untuk masuk ke Portal Reseller (lupa username/PIN/sandi).`)}`
    : "";

  // Header transparan menyatu dengan hero; berubah putih setelah hero terlewati
  const [headerSolid, setHeaderSolid] = useState(false);
  const heroRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  // Efek parallax hero: blok teks bergeser LEBIH LAMBAT dari scroll halaman (seperti
  // di katalog). Header transparan di atas hero, jadi putih setelah hero terlewati.
  // Transform ditulis langsung ke elemen (tanpa setState) supaya scroll tetap mulus.
  useEffect(() => {
    const hero = heroRef.current;
    const stage = stageRef.current;
    if (!hero || !stage) return;
    let raf = 0;

    const update = () => {
      raf = 0;
      const y = window.scrollY;
      // Layar lebar (tablet/desktop): hero jadi panel kiri yang diam → tanpa parallax
      if (window.innerWidth >= WIDE_BREAKPOINT) {
        setHeaderSolid(false);
        stage.style.transform = "";
        return;
      }
      const hh = hero.offsetHeight || 1;
      setHeaderSolid(y > hh - HEADER_H - 1);
      stage.style.transform = `translate3d(0, ${(Math.min(y, hh) * HERO_TEXT_LAG).toFixed(1)}px, 0)`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    getPOSettingBySlug(slug)
      .then((set) => {
        if (!cancelled) setSetting(set);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSettingReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function handleLogin() {
    if (!kode || !pin) {
      setError("Kode dan PIN wajib diisi.");
      return;
    }
    setLoading(true);
    setError("");

    const result = await loginReseller(kode.trim().toUpperCase(), pin.trim());

    if (!result.sukses) {
      setError(result.pesan || "Login gagal.");
      setLoading(false);
      return;
    }

    sessionStorage.setItem("po_reseller", JSON.stringify(result.reseller));
    if (slug) {
      sessionStorage.setItem("po_slug", slug);
    }
    router.push(`/po/${slug}/reseller/portal`);
  }

  // Logo PO: ikon unggahan dari Pengaturan PO; kalau belum ada → ikon paket (seperti katalog).
  // Sebelum data siap, tempatnya dikosongkan agar tidak berkedip.
  const renderLogo = (size: number, imgClass: string) =>
    !settingReady ? (
      <span style={{ width: size, height: size }} className="shrink-0" />
    ) : setting?.icon_image_url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={setting.icon_image_url}
        alt=""
        className={`${imgClass} object-cover shrink-0`}
      />
    ) : (
      <Package size={size - 8} className="shrink-0" />
    );

  return (
    // HP: header + hero di atas, form di bawah.
    // Tablet/desktop (md ke atas): dua kolom — kiri panel hero, kanan form login.
    <div className="min-h-screen bg-[#f5f5f4] text-[#0e0e0e] font-sans flex flex-col md:grid md:grid-cols-2 md:bg-white">
      {/* ── Header (khusus HP): transparan di atas hero, putih setelah hero terlewati ── */}
      <header
        className={`md:hidden fixed top-0 inset-x-0 z-50 px-4 h-[58px] flex items-center justify-between border-b transition-[background-color,border-color,backdrop-filter] duration-300 ${
          headerSolid
            ? "bg-white/90 backdrop-blur-md border-[#e5e7eb]"
            : "bg-transparent border-transparent"
        }`}
      >
        <div
          className={`text-[15px] font-extrabold tracking-tight flex items-center gap-2 transition-colors duration-300 ${
            headerSolid ? "text-[#0e0e0e]" : "text-white"
          }`}
        >
          {renderLogo(28, "w-7 h-7 rounded-md")}
          <span>{brandName}</span>
        </div>
      </header>

      {/* ── Kiri: hero. HP = blok di atas; md ke atas = panel setinggi layar ── */}
      <div className="md:p-3 md:h-screen md:sticky md:top-0">
        <div
          ref={heroRef}
          className="bg-[#0e0e0e] text-white px-4 pt-[58px] min-h-[300px] flex items-center relative overflow-hidden md:h-full md:min-h-0 md:rounded-2xl md:p-10 md:flex-col md:items-stretch md:justify-between"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_30%,#1f2937_0%,transparent_52%),radial-gradient(circle_at_20%_80%,#111827_0%,transparent_45%)] opacity-80 pointer-events-none"></div>
          <PixelTrail water={false} ambientAlpha={0.2} />

          {/* Merek (khusus md ke atas, karena header HP disembunyikan) */}
          <div className="hidden md:flex items-center gap-3 relative z-10">
            {renderLogo(32, "w-8 h-8 rounded-lg")}
            <span className="text-xl font-semibold tracking-tight">
              {brandName}
            </span>
          </div>

          <div className="w-full relative z-10 py-8 md:py-0 md:my-auto">
            <div
              ref={stageRef}
              className="max-w-[600px] mx-auto text-center will-change-transform"
            >
              <div className="inline-flex items-center justify-center gap-[7px] text-[11px] font-bold tracking-widest uppercase text-white/55 mb-3">
                <div className="w-1.5 h-1.5 rounded-full bg-[#4ade80]"></div>
                Akses Khusus Reseller
              </div>
              <h1 className="text-[26px] md:text-3xl lg:text-4xl font-extrabold tracking-tight leading-[1.1] mb-3">
                Selamat datang,{" "}
                <em className="not-italic text-zinc-500">Reseller</em>
              </h1>
              <p className="text-[13.6px] md:text-sm text-white/60 max-w-md mx-auto leading-relaxed">
                Masuk dengan Username dan PIN/sandi reseller Anda untuk mulai
                input pesanan.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Kanan: form login ── */}
      <main className="flex-1 flex flex-col md:justify-center md:items-center md:px-12 md:py-12">
        <div className="max-w-[420px] w-full mx-auto mt-9 px-4 pb-20 md:mt-0 md:px-0 md:pb-0 md:max-w-sm">
          {/* Judul form (khusus md ke atas) */}
          <div className="hidden md:block mb-8">
            <h2 className="text-3xl font-semibold tracking-tight text-[#0e0e0e]">
              Masuk
            </h2>
            <p className="mt-2 text-sm text-[#6b7280]">
              Pakai akun reseller yang sudah didaftarkan admin.
            </p>
          </div>

          <div className="bg-white border border-[#e5e7eb] rounded-xl overflow-hidden md:border-0 md:rounded-none md:overflow-visible">
            <div className="p-4 md:p-0">
              <div className="md:hidden text-[11px] font-bold tracking-widest uppercase text-[#9ca3af] mb-3.5 flex items-center gap-1.5">
                Login Reseller
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-[#fef2f2] text-[#b91c1c] border border-[#fecaca] p-3 rounded-lg text-[13px] font-semibold mb-3.5">
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-3.5 md:space-y-5">
                <div>
                  <label className="block text-[12.5px] md:text-sm font-bold md:font-medium text-[#0e0e0e] mb-1.5">
                    Username
                  </label>
                  <input
                    type="text"
                    value={kode}
                    onChange={(e) => setKode(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      document.getElementById("pin-input")?.focus()
                    }
                    placeholder="Username Anda"
                    className="w-full px-3 py-2.5 md:py-3 border border-[#e5e7eb] rounded-lg text-[14px] text-[#0e0e0e] outline-none focus:border-[#0e0e0e] focus:shadow-[0_0_0_3px_rgba(14,14,14,0.07)] transition-all bg-white uppercase"
                  />
                </div>
                <div>
                  <label className="block text-[12.5px] md:text-sm font-bold md:font-medium text-[#0e0e0e] mb-1.5">
                    PIN/Sandi
                  </label>
                  <div className="relative">
                    <input
                      id="pin-input"
                      type={showPin ? "text" : "password"}
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                      placeholder="Masukkan PIN/Sandi Anda"
                      className="w-full pl-3 pr-11 py-2.5 md:py-3 border border-[#e5e7eb] rounded-lg text-[14px] text-[#0e0e0e] outline-none focus:border-[#0e0e0e] focus:shadow-[0_0_0_3px_rgba(14,14,14,0.07)] transition-all bg-white tracking-widest"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin((v) => !v)}
                      aria-label={
                        showPin ? "Sembunyikan PIN/Sandi" : "Lihat PIN/Sandi"
                      }
                      aria-pressed={showPin}
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-[#9ca3af] hover:text-[#0e0e0e] focus-visible:text-[#0e0e0e] focus-visible:outline-none transition-colors"
                    >
                      {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleLogin}
                  disabled={loading}
                  className="w-full bg-[#0e0e0e] text-white py-2.5 md:py-3 rounded-lg text-[14px] font-bold flex items-center justify-center gap-2 hover:opacity-80 transition-opacity disabled:opacity-40 mt-1"
                >
                  {loading ? "Memeriksa..." : "Masuk"}
                </button>
              </div>

              <div className="h-px bg-[#e5e7eb] my-3.5 md:my-6"></div>

              <p className="text-[12px] md:text-[13px] text-[#9ca3af] text-center">
                Belum punya akun atau lupa sandi? Hubungi admin.
              </p>
              {waLink && (
                <div className="mt-4 flex justify-center">
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-zinc-950 text-white px-5 py-2.5 rounded-full font-extrabold text-xs hover:opacity-90 hover:-translate-y-px transition-all"
                  >
                    <MessageCircle size={15} />
                    Hubungi Admin
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
