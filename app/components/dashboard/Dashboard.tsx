"use client";

import { useMemo, type ReactNode } from "react";
import { Shirt, Package } from "lucide-react";
import { Order } from "@/types";

// Hooks
import { useDashboard } from "@/hooks/useDashboard";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";

// Components
import AnnouncementBanner from "@/app/components/ui/AnnouncementBanner";
import UpdateBanner from "@/app/components/dashboard/UpdateBanner";
import HeroSection from "@/app/components/dashboard/HeroSection";
import ChartBar, { BarSeries } from "@/app/components/dashboard/ChartBar";
import ChartPie from "@/app/components/dashboard/ChartPie";
import ActionList from "@/app/components/dashboard/ActionList";

// Palet Kaos (Manual / DTF / dst.) — sama dengan sebelumnya
const KAOS_COLORS = ["#49BFB4", "#ff6437", "#e4e596"];
// Palet Merchandise — satu warna per produk (Lanyard, Totebag, Gantungan Kunci, ...)
// Warna produk SAMA di grafik tren & donut karena urutannya sama.
const MERCH_COLORS = [
  "#6366f1",
  "#f59e0b",
  "#ec4899",
  "#10b981",
  "#8b5cf6",
  "#06b6d4",
];

interface DashboardProps {
  role: string;
  orders: Order[];
  /** true selama data pesanan belum selesai dimuat (tampilkan kerangka, bukan angka 0). */
  loading?: boolean;
  onSelectOrder: (id: string) => void;
}

export default function Dashboard({
  role,
  orders,
  loading = false,
  onSelectOrder,
}: DashboardProps) {
  const {
    stats,
    actionItems,
    kaosMonthlyData,
    kaosTypeData,
    kaosSummary,
    merchMonthlyData,
    merchTypeData,
    merchSeries,
    merchSummary,
  } = useDashboard(orders);

  const { hasUpdate, updateInfo, applyUpdate, dismissUpdate } = useUpdateCheck({
    enableServiceWorker: false,
    enablePolling: true,
    versionUrl: "/api/version",
    pollInterval: 5 * 1000,
  });

  // Seri bertumpuk untuk grafik merchandise (warna per produk)
  const merchBarSeries = useMemo<BarSeries[]>(
    () =>
      merchSeries.map((s, i) => ({
        dataKey: s.dataKey,
        label: s.label,
        color: MERCH_COLORS[i % MERCH_COLORS.length],
      })),
    [merchSeries],
  );

  return (
    <div className="space-y-6 pb-10">
      {/* Announcement dari admin */}
      <AnnouncementBanner />

      {/* Notifikasi update versi baru — tampil hanya jika ada update */}
      {hasUpdate && updateInfo && (
        <UpdateBanner
          updateInfo={updateInfo}
          onUpdate={applyUpdate}
          onDismiss={dismissUpdate}
        />
      )}

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* Hero stats */}
          <HeroSection stats={stats} />

          {/* ── Kaos ─────────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <SectionHeader
              icon={<Shirt className="w-4 h-4" strokeWidth={2} />}
              title="Kaos"
              subtitle="Pesanan sablon / DTF / manual"
              summary={kaosSummary}
            />
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-6">
              <div className="lg:col-span-3">
                <ChartBar
                  monthlyData={kaosMonthlyData}
                  title="Tren Volume Kaos"
                  subtitle="Jumlah pcs masuk · 6 bulan terakhir"
                  color={KAOS_COLORS[0]}
                />
              </div>
              <div className="lg:col-span-2">
                <ChartPie
                  productionTypeData={kaosTypeData}
                  title="Jenis Produksi Kaos"
                  subtitle="Distribusi tipe order kaos"
                  totalLabel="Total order"
                  colors={KAOS_COLORS}
                />
              </div>
            </div>
          </section>

          {/* ── Merchandise ──────────────────────────────────────────────── */}
          <section className="space-y-3">
            <SectionHeader
              icon={<Package className="w-4 h-4" strokeWidth={2} />}
              title="Merchandise"
              subtitle="Lanyard, totebag, gantungan kunci, dst."
              summary={merchSummary}
            />
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-6">
              <div className="lg:col-span-3">
                <ChartBar
                  monthlyData={merchMonthlyData}
                  title="Tren Volume Merchandise"
                  subtitle="Jumlah pcs masuk per produk · 6 bulan terakhir"
                  color={MERCH_COLORS[0]}
                  series={merchBarSeries}
                />
              </div>
              <div className="lg:col-span-2">
                <ChartPie
                  productionTypeData={merchTypeData}
                  title="Jenis Merchandise"
                  subtitle="Distribusi pesanan per produk"
                  totalLabel="Total order"
                  colors={MERCH_COLORS}
                />
              </div>
            </div>
          </section>

          {/* Action items */}
          <ActionList actionItems={actionItems} onSelectOrder={onSelectOrder} />
        </>
      )}
    </div>
  );
}

/** Judul satu kelompok (Kaos / Merchandise) + ringkasan jumlah pesanan & pcs. */
function SectionHeader({
  icon,
  title,
  subtitle,
  summary,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  summary: { orders: number; pcs: number };
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 px-1">
      <div className="flex items-center gap-2.5">
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300">
          {icon}
        </span>
        <div>
          <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 leading-tight">
            {title}
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 font-mono tabular-nums text-[11px]">
        <span className="px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300">
          {summary.orders.toLocaleString("id-ID")} pesanan
        </span>
        <span className="px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300">
          {summary.pcs.toLocaleString("id-ID")} pcs
        </span>
      </div>
    </div>
  );
}

/** Kerangka dashboard selama data dimuat: lebih jujur daripada menampilkan angka 0. */
function DashboardSkeleton() {
  const block = "rounded-md bg-zinc-200 dark:bg-zinc-800";
  return (
    <div
      className="space-y-6 animate-pulse"
      role="status"
      aria-busy="true"
      aria-label="Memuat data"
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${block} h-16`} />
        ))}
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-6">
          <div className={`${block} h-64 lg:col-span-3`} />
          <div className={`${block} h-64 lg:col-span-2`} />
        </div>
      ))}
      <div className={`${block} h-40`} />
    </div>
  );
}
