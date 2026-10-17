import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { Clock, Shirt, Package } from "lucide-react";
import { DashboardStats } from "@/hooks/useDashboard";

// ─── Stat Cell ────────────────────────────────────────────────────────────────

interface StatCellProps {
  label: string;
  value: number;
  hint?: string;
  emphasize?: boolean;
}

function StatCell({ label, value, hint, emphasize }: StatCellProps) {
  return (
    <div className="py-1 px-4 odd:pl-0 md:px-6 md:odd:pl-6 md:first:pl-0">
      <p className="text-[10px] md:text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-1.5">
        {label}
      </p>
      <p
        className={`font-mono tabular-nums text-2xl md:text-3xl lg:text-4xl font-semibold leading-none ${
          emphasize
            ? "text-zinc-900 dark:text-white"
            : "text-zinc-900 dark:text-white"
        }`}
      >
        {value.toLocaleString("id-ID")}
      </p>
      {hint && (
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5">
          {hint}
        </p>
      )}
    </div>
  );
}

// ─── Badge status yang bisa diklik → scroll ke "Perlu Tindakan Segera" ────────

const ACTION_SECTION_ID = "perlu-tindakan";

function scrollToActionList() {
  document
    .getElementById(ACTION_SECTION_ID)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

interface StatusBadgeProps {
  count: number;
  label: string;
  className: string; // warna latar badge
}

function StatusBadge({ count, label, className }: StatusBadgeProps) {
  return (
    <button
      type="button"
      onClick={scrollToActionList}
      aria-label={`${count} ${label}, klik untuk melihat daftar tindakan`}
      title="Lihat di Perlu Tindakan Segera"
      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full text-white cursor-pointer transition hover:brightness-110 hover:shadow-md active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-offset-zinc-900 ${className}`}
    >
      {count} {label}
    </button>
  );
}

// ─── Monthly Group (satu kelompok: Kaos / Merchandise) ───────────────────────

interface MonthlyGroupProps {
  icon: ReactNode;
  label: string;
  orders: number;
  pcs: number;
  className?: string;
}

function MonthlyGroup({
  icon,
  label,
  orders,
  pcs,
  className = "",
}: MonthlyGroupProps) {
  return (
    <div className={className}>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
        <span className="text-zinc-400">{icon}</span>
        {label}
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] md:text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-1.5">
            Pesanan Masuk
          </p>
          <p className="font-mono tabular-nums text-2xl md:text-3xl lg:text-4xl font-semibold leading-none text-zinc-900 dark:text-white">
            {orders.toLocaleString("id-ID")}
          </p>
        </div>
        <div>
          <p className="text-[10px] md:text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-1.5">
            PCS Terproduksi
          </p>
          <p className="font-mono tabular-nums text-2xl md:text-3xl lg:text-4xl font-semibold leading-none text-zinc-900 dark:text-white">
            {pcs.toLocaleString("id-ID")}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Hero Section ─────────────────────────────────────────────────────────────

interface HeroSectionProps {
  stats: DashboardStats;
}

const HeroSection = memo(function HeroSection({ stats }: HeroSectionProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const dateTimeLabel = useMemo(() => {
    const datePart = now.toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const timePart = now.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    return `${datePart} · ${timePart}`;
  }, [now]);

  const monthLabel = useMemo(
    () =>
      now.toLocaleDateString("id-ID", {
        month: "long",
        year: "numeric",
      }),
    [now],
  );

  return (
    <section className="rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-100/80 dark:bg-zinc-900/90 text-zinc-900 dark:text-white overflow-hidden transition-colors shadow-sm">
      <div className="p-5 md:p-7">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400 mb-2">
              Monitoring Produksi Sablon
            </p>
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">
              Dashboard Produksi
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
              Ringkasan performa dan analitik produksi
            </p>
          </div>

          {/* Status pills — solid, kecil, adaptif dengan latar belakang hero */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 font-mono tabular-nums text-[11px] px-2.5 py-1 rounded-full border border-zinc-300/70 dark:border-zinc-700 bg-white/80 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 shadow-xs">
              <Clock className="w-3 h-3 text-zinc-400" strokeWidth={2} />
              {dateTimeLabel}
            </span>
            {stats.trouble > 0 && (
              <StatusBadge
                count={stats.trouble}
                label="Kendala"
                className="bg-purple-600"
              />
            )}
            {stats.overdue > 0 && (
              <StatusBadge
                count={stats.overdue}
                label="Telat"
                className="bg-red-600"
              />
            )}
            {stats.warning > 0 && (
              <StatusBadge
                count={stats.warning}
                label="Urgent"
                className="bg-orange-600"
              />
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-5 md:my-6" />

        {/* Grup 1 — Sepanjang masa */}
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400 mb-3">
          Sepanjang masa
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 md:divide-x md:divide-zinc-200 dark:md:divide-zinc-800 gap-y-4">
          <StatCell label="Total Pesanan" value={stats.totalOrders} />
          <StatCell label="Total PCS" value={stats.totalPcs} />
          <StatCell
            label="On Process"
            value={stats.onProcess}
            hint="Sedang jalan"
          />
          <StatCell label="Selesai" value={stats.selesai} hint="Completed" />
        </div>

        <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-5" />

        {/* Grup 2 — Bulan ini, dipisah Kaos & Merchandise */}
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400 mb-3">
          Bulan ini · {monthLabel}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-0 md:divide-x md:divide-zinc-200 dark:md:divide-zinc-800">
          <MonthlyGroup
            icon={<Shirt className="w-3.5 h-3.5" strokeWidth={2} />}
            label="Kaos"
            orders={stats.kaosMonthlyOrders}
            pcs={stats.kaosMonthlyPcs}
            className="md:pr-6"
          />
          <MonthlyGroup
            icon={<Package className="w-3.5 h-3.5" strokeWidth={2} />}
            label="Merchandise"
            orders={stats.merchMonthlyOrders}
            pcs={stats.merchMonthlyPcs}
            className="md:pl-6"
          />
        </div>
      </div>
    </section>
  );
});

export default HeroSection;
