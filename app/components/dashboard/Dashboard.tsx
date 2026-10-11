"use client";

import { useState } from "react";
import { Order } from "@/types";

// Hooks
import { useDashboard } from "@/hooks/useDashboard";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";

// Components
import AnnouncementBanner from "@/app/components/ui/AnnouncementBanner";
import UpdateBanner from "@/app/components/dashboard/UpdateBanner";
import HeroSection from "@/app/components/dashboard/HeroSection";
import ChartBar from "@/app/components/dashboard/ChartBar";
import ChartPie from "@/app/components/dashboard/ChartPie";
import ActionList from "@/app/components/dashboard/ActionList";

// Warna untuk Pie Chart (dipakai juga oleh ChartPie secara internal) —
// harus konsisten dengan palette chart pada THEME-GUIDE
const COLORS = ["#2589ff", "#f4435e", "#e4e596"];

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
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // ── Data & logika (tidak berubah) ─────────────────────────────────────────
  const { stats, monthlyData, productionTypeData, actionItems } =
    useDashboard(orders);

  const { hasUpdate, updateInfo, applyUpdate, dismissUpdate } = useUpdateCheck({
    enableServiceWorker: false,
    enablePolling: true,
    versionUrl: "/api/version",
    pollInterval: 5 * 1000,
  });

  // ── Derived state untuk Pie center label ──────────────────────────────────
  const activeItem =
    activeIndex !== null ? productionTypeData[activeIndex] : null;
  const centerValue = activeItem ? activeItem.value : stats.totalOrders;
  const centerLabel = activeItem ? activeItem.name : "Total order";
  const centerColor = activeItem
    ? COLORS[activeIndex! % COLORS.length]
    : undefined;

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

          {/* Charts — bar chart (deret data) dapat 3/5 kolom, pie 2/5 */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-6">
            <div className="lg:col-span-3">
              <ChartBar monthlyData={monthlyData} />
            </div>
            <div className="lg:col-span-2">
              <ChartPie
                productionTypeData={productionTypeData}
                activeIndex={activeIndex}
                setActiveIndex={setActiveIndex}
                centerValue={centerValue}
                centerLabel={centerLabel}
                centerColor={centerColor}
              />
            </div>
          </div>

          {/* Action items */}
          <ActionList actionItems={actionItems} onSelectOrder={onSelectOrder} />
        </>
      )}
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
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-6">
        <div className={`${block} h-64 lg:col-span-3`} />
        <div className={`${block} h-64 lg:col-span-2`} />
      </div>
      <div className={`${block} h-40`} />
    </div>
  );
}
