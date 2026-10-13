"use client";

import { useEffect, useState } from "react";
import { getPOStats, getPOSettingAdmin } from "@/lib/po/admin";
import { formatRupiah } from "@/lib/po/pricing";
import { POSetting } from "@/types/po";
import {
  CheckCircle2,
  XCircle,
  Link as LinkIcon,
  ShoppingBag,
  Users,
  Globe,
  Banknote,
  Copy,
  ExternalLink,
  CalendarDays,
  Package,
  UserPlus,
  UserCog,
} from "lucide-react";

// 1. Tambahkan interface untuk props
interface POOverviewProps {
  poId: string;
}

// 2. Terima props poId di dalam komponen
export default function POOverview({ poId }: POOverviewProps) {
  const [stats, setStats] = useState({
    totalOrders: 0,
    totalPublic: 0,
    totalReseller: 0,
    totalAmount: 0,
    totalProducts: 0,
  });
  const [setting, setSetting] = useState<POSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      // 3. Teruskan poId ke dalam fungsi admin
      // Pastikan fungsi getPOStats di lib/po/admin.ts juga sudah diperbarui untuk menerima parameter (poId?: string)
      const [s, st] = await Promise.all([
        getPOSettingAdmin(poId),
        getPOStats(poId),
      ]);
      setSetting(s);
      setStats(st);
      setLoading(false);
    }
    load();
  }, [poId]); // Tambahkan poId sebagai dependency

  const currentSlug = setting?.url_slug || "katalog";
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const links = [
    {
      key: "katalog",
      label: "Katalog PO (Publik)",
      url: `${origin}/po/${currentSlug}`,
      href: `/po/${currentSlug}`,
      icon: Globe,
    },
    {
      key: "reseller",
      label: "Portal Reseller",
      url: `${origin}/po/${currentSlug}/reseller`,
      href: `/po/${currentSlug}/reseller`,
      icon: Users,
    },
    {
      key: "daftar-reseller",
      label: "Form Pendaftaran Reseller",
      url: `${origin}/po/${currentSlug}/daftar-reseller`,
      href: `/po/${currentSlug}/daftar-reseller`,
      icon: UserPlus,
    },
  ];

  const handleCopy = async (key: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (err) {
      console.error("Gagal menyalin link:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-[#49bfb4] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Action Links ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <div
              key={link.key}
              className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl flex flex-col justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#49bfb4]/10 text-[#49bfb4] border border-[#49bfb4]/20 flex items-center justify-center shrink-0">
                  <Icon size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-zinc-800 dark:text-zinc-200">
                    {link.label}
                  </h3>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Klik salin untuk membagikan
                  </p>
                </div>
              </div>

              <code className="block w-full p-2.5 bg-zinc-50 dark:bg-zinc-900 rounded-md text-[11px] text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 truncate select-all">
                {link.url}
              </code>
              <div className="flex gap-2 w-full md:w-auto">
                <button
                  onClick={() => handleCopy(link.key, link.url)}
                  className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 text-xs font-semibold border px-4 py-2.5 rounded-md transition-colors duration-150 whitespace-nowrap
                    ${
                      copiedKey === link.key
                        ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400"
                        : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-[#49bfb4]/50 hover:text-[#49bfb4] hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    }`}
                >
                  <Copy size={13} />
                  {copiedKey === link.key ? "Tersalin!" : "Salin"}
                </button>
                <a
                  href={link.href}
                  target="_blank"
                  className="flex-1 md:flex-none flex items-center justify-center gap-1.5 text-xs font-semibold border border-zinc-200 dark:border-zinc-800 px-4 py-2.5 rounded-md bg-white dark:bg-zinc-950 hover:border-[#49bfb4]/50 hover:text-[#49bfb4] hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-300 transition-colors duration-150"
                >
                  <ExternalLink size={13} />
                  Buka
                </a>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Status & Settings Summary ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Status PO */}
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-5 rounded-xl flex items-start gap-4">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
              setting?.is_active
                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400"
                : "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
            }`}
          >
            {setting?.is_active ? (
              <CheckCircle2 size={24} />
            ) : (
              <XCircle size={24} />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-zinc-800 dark:text-zinc-200 mb-1">
              Status Pre-Order
            </h3>
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide ${
                  setting?.is_active
                    ? "bg-emerald-600 text-white"
                    : "bg-red-600 text-white"
                }`}
              >
                {setting?.is_active ? "AKTIF" : "DITUTUP"}
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              {setting?.is_active
                ? "Sistem sedang menerima pesanan dari publik maupun reseller."
                : "Pre-order sedang ditutup. Pelanggan tidak dapat membuat pesanan baru."}
            </p>
          </div>
        </div>

        {/* Info Periode */}
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-5 rounded-xl flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shrink-0">
            <CalendarDays size={24} />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-zinc-800 dark:text-zinc-200 mb-3">
              Periode Pre-Order
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-1">
                  Mulai
                </p>
                <p className="font-mono tabular-nums text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  {setting?.periode_mulai
                    ? new Date(setting.periode_mulai).toLocaleDateString(
                        "id-ID",
                        {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        },
                      )
                    : "-"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-1">
                  Selesai
                </p>
                <p className="font-mono tabular-nums text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  {setting?.periode_selesai
                    ? new Date(setting.periode_selesai).toLocaleDateString(
                        "id-ID",
                        {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        },
                      )
                    : "-"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Key Metrics ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl flex flex-col items-center text-center justify-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center">
            <ShoppingBag size={20} />
          </div>
          <div>
            <p className="text-[10px] md:text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] mb-1">
              Total Pesanan
            </p>
            <p className="font-mono tabular-nums text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              {stats.totalOrders.toLocaleString("id-ID")}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl flex flex-col items-center text-center justify-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center">
            <Banknote size={20} />
          </div>
          <div>
            <p className="text-[10px] md:text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] mb-1">
              Omset Sementara
            </p>
            <p className="font-mono tabular-nums text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {formatRupiah(stats.totalAmount)}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl flex flex-col items-center text-center justify-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center">
            <Package size={20} />
          </div>
          <div>
            <p className="text-[10px] md:text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] mb-1">
              Katalog Produk
            </p>
            <p className="font-mono tabular-nums text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              {stats.totalProducts.toLocaleString("id-ID")}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl flex flex-col items-center text-center justify-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center">
            <UserCog size={20} />
          </div>
          <div>
            <p className="text-[10px] md:text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] mb-1">
              Pesanan Reseller
            </p>
            <p className="font-mono tabular-nums text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              {stats.totalReseller.toLocaleString("id-ID")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
