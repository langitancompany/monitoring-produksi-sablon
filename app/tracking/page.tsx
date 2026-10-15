// app/tracking/page.tsx
"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Search, Loader2, AlertCircle, Package } from "lucide-react";
import TrackingTimeline from "./TrackingTimeline";
import ThemedLogo from "@/app/components/ui/ThemedLogo";

const smartFormat = (input: string): string => {
  const cleaned = input.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const match = cleaned.match(/^([A-Z]{3})(\d{2})(\d{2})(\d{4})$/);
  if (match) {
    const [, prefix, p1, p2, p3] = match;
    return `${prefix}-${p1}/${p2}-${p3}`;
  }
  return input.replace(/^#/, "").toUpperCase().trim();
};

// ─── Komponen inner (pakai useSearchParams di sini) ──────────────────────────

function TrackingPageInner() {
  const [searchCode, setSearchCode] = useState("");
  const [hp, setHp] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const didAutoSearch = useRef(false);

  const doSearch = async (code: string, hpValue: string) => {
    const kode = smartFormat(code.trim());
    if (!kode) return;

    if (!/^\d{4}$/.test(hpValue)) {
      setHasSearched(true);
      setResult(null);
      setErrorText("Isi 4 digit terakhir nomor HP yang dipakai saat memesan.");
      return;
    }

    setLoading(true);
    setHasSearched(true);
    setResult(null);
    setErrorText(null);

    // Data diambil lewat API server (/api/tracking), bukan langsung dari
    // Supabase, supaya tabel orders tidak perlu dibuka untuk publik.
    try {
      const res = await fetch(
        `/api/tracking?kode=${encodeURIComponent(kode)}&hp=${hpValue}`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const json = await res.json();
        setResult(json.order);
      } else if (res.status === 429) {
        setErrorText(
          "Terlalu banyak percobaan. Coba lagi beberapa menit lagi.",
        );
      } else if (res.status === 400) {
        setErrorText("Format kode atau 4 digit HP tidak valid.");
      } else {
        setErrorText(
          "Pesanan tidak ditemukan. Periksa kode produksi dan 4 digit terakhir nomor HP.",
        );
      }
    } catch {
      setErrorText("Gagal terhubung ke server. Coba lagi.");
    }

    setLoading(false);
  };

  useEffect(() => {
    const kodeFromUrl = searchParams.get("kode");
    const hpFromUrl = (searchParams.get("hp") ?? "")
      .replace(/\D/g, "")
      .slice(0, 4);
    if (kodeFromUrl && !didAutoSearch.current) {
      didAutoSearch.current = true;
      // searchParams.get() sudah otomatis decode, jadi langsung pakai saja
      setSearchCode(kodeFromUrl);
      setHp(hpFromUrl);
      if (hpFromUrl.length === 4) doSearch(kodeFromUrl, hpFromUrl);
    }
  }, [searchParams]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(searchCode, hp);
  };

  const formatted = searchCode ? smartFormat(searchCode) : "";
  const showPreview =
    searchCode.length >= 6 && formatted !== searchCode.toUpperCase().trim();

  const SearchForm = (
    <form onSubmit={handleSearch} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          Kode produksi
        </label>
        <input
          type="text"
          placeholder="lco04260001 atau LCO-04/26-0001"
          className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition uppercase"
          value={searchCode}
          onChange={(e) => setSearchCode(e.target.value)}
        />
        {showPreview && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            Akan dicari sebagai:{" "}
            <span className="font-mono font-medium text-blue-600 dark:text-blue-400">
              {formatted}
            </span>
          </p>
        )}
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          4 digit terakhir nomor HP
        </label>
        <input
          type="text"
          inputMode="numeric"
          maxLength={4}
          placeholder="contoh: 1234"
          className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
          value={hp}
          onChange={(e) => setHp(e.target.value.replace(/\D/g, "").slice(0, 4))}
        />
      </div>
      <button
        type="submit"
        disabled={loading || !searchCode.trim() || hp.length !== 4}
        className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 hover:bg-blue-700 transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Mencari...
          </>
        ) : (
          <>
            <Search className="w-4 h-4" /> Lacak pesanan
          </>
        )}
      </button>
    </form>
  );

  const ResultArea = (
    <>
      {loading && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Mencari pesanan...
          </p>
        </div>
      )}
      {!loading && hasSearched && errorText && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-red-500 dark:text-red-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {errorText}
            </p>
          </div>
        </div>
      )}
      {!hasSearched && !loading && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <Package className="w-6 h-6 text-slate-400 dark:text-slate-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Masukkan kode produksi
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Format bebas — sistem otomatis menyesuaikan
            </p>
          </div>
        </div>
      )}
      {!loading && result && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <TrackingTimeline result={result} />
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* ── MOBILE layout ── */}
      <div className="md:hidden flex flex-col items-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-6">
            <ThemedLogo alt="Langitan.co" className="h-8 w-auto object-contain" />
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-white leading-none">
                Langitan.co
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                Tracking pesanan
              </p>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 mb-4 shadow-sm">
            {SearchForm}
          </div>
          {ResultArea}
          <p className="text-center text-[11px] text-slate-300 dark:text-slate-700 mt-8">
            Langitan.co · Sistem Produksi
          </p>
        </div>
      </div>

      {/* ── DESKTOP layout ── */}
      <div className="hidden md:flex min-h-screen">
        <div className="w-80 lg:w-96 flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3 mb-6">
              <ThemedLogo alt="Langitan.co" className="h-8 w-auto object-contain" />
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-white leading-none">
                  Langitan.co
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  Tracking pesanan
                </p>
              </div>
            </div>
            {SearchForm}
          </div>
          <div className="p-6 flex-1">
            <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
              Petunjuk
            </p>
            <ul className="space-y-2.5">
              {[
                "Masukkan kode produksi Anda",
                "Isi 4 digit terakhir nomor HP yang dipakai saat memesan",
                "Contoh kode: lco04260001 atau LCO-04/26-0001",
              ].map((t, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400"
                >
                  <span className="w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="p-6 border-t border-slate-100 dark:border-slate-800">
            <p className="text-[11px] text-slate-300 dark:text-slate-700">
              Langitan.co · Sistem Produksi
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950">
          <div className="max-w-2xl mx-auto px-8 py-10">
            {(loading || !result || (hasSearched && errorText)) && (
              <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                  {loading && (
                    <>
                      <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-4" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Mencari pesanan...
                      </p>
                    </>
                  )}
                  {!loading && hasSearched && errorText && (
                    <>
                      <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-7 h-7 text-red-500 dark:text-red-400" />
                      </div>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {errorText}
                      </p>
                    </>
                  )}
                  {!hasSearched && !loading && (
                    <>
                      <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
                        <Package className="w-7 h-7 text-slate-400 dark:text-slate-600" />
                      </div>
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                        Masukkan kode produksi
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                        Hasil tracking akan muncul di sini
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}
            {!loading && result && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                <TrackingTimeline result={result} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Export default dibungkus Suspense ───────────────────────────────────────

export default function TrackingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <TrackingPageInner />
    </Suspense>
  );
}
