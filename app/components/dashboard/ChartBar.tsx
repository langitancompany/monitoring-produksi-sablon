import { memo, useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import { MonthlyDataPoint } from "@/hooks/useDashboard";

/** Satu seri untuk mode bertumpuk (mis. satu produk merchandise). */
export interface BarSeries {
  dataKey: string;
  label: string;
  color: string;
}

const DEFAULT_COLOR = "#49BFB4";

// ─── Custom Tooltip (Responsif terhadap Tema Terang & Gelap) ─────────────────
interface TooltipEntry {
  value?: number;
  dataKey?: string | number;
  color?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  series?: BarSeries[];
}

const CustomTooltip = ({
  active,
  payload,
  label,
  series,
}: CustomTooltipProps) => {
  if (!active || !payload || payload.length === 0) return null;

  // Mode bertumpuk: tampilkan rincian per produk + total
  if (series && series.length > 0) {
    const rows = series
      .map((s) => ({
        ...s,
        value: Number(payload.find((p) => p.dataKey === s.dataKey)?.value ?? 0),
      }))
      .filter((r) => r.value > 0);
    const total = rows.reduce((a, r) => a + r.value, 0);

    return (
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5 shadow-xl transition-colors min-w-[140px]">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
          {label}
        </p>
        {rows.length === 0 ? (
          <p className="text-xs text-zinc-400">Belum ada pesanan</p>
        ) : (
          <>
            <ul className="space-y-1">
              {rows.map((r) => (
                <li key={r.dataKey} className="flex items-center gap-2 text-xs">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: r.color }}
                  />
                  <span className="flex-1 text-zinc-600 dark:text-zinc-300">
                    {r.label}
                  </span>
                  <span className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                    {r.value.toLocaleString("id-ID")}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800 mt-1.5 pt-1.5 text-xs">
              <span className="text-zinc-500 dark:text-zinc-400">Total</span>
              <span className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                {total.toLocaleString("id-ID")} pcs
              </span>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5 shadow-xl transition-colors">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-0.5">
        {label}
      </p>
      <p className="font-mono tabular-nums text-xs font-semibold text-zinc-900 dark:text-zinc-100">
        {`${Number(payload[0].value ?? 0).toLocaleString("id-ID")} pcs`}
      </p>
    </div>
  );
};

// ─── Component Main ──────────────────────────────────────────────────────────
interface ChartBarProps {
  monthlyData: MonthlyDataPoint[];
  title?: string;
  subtitle?: string;
  /** Warna batang untuk mode satu seri. */
  color?: string;
  /** Bila diisi → batang bertumpuk per seri (dipakai untuk merchandise). */
  series?: BarSeries[];
}

const ChartBar = memo(function ChartBar({
  monthlyData,
  title = "Tren Volume",
  subtitle = "Jumlah item masuk · 6 bulan terakhir",
  color = DEFAULT_COLOR,
  series,
}: ChartBarProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const stacked = !!series && series.length > 0;
  const isEmpty = monthlyData.every((m) => m.pcs === 0);

  return (
    <div className="bg-white dark:bg-zinc-950 p-5 md:p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 h-full">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-base tracking-tight">
            {title}
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            {subtitle}
          </p>
        </div>

        {/* Legend produk (hanya mode bertumpuk) */}
        {stacked && (
          <ul className="flex flex-wrap justify-end gap-x-3 gap-y-1 max-w-[55%]">
            {series!.map((s) => (
              <li
                key={s.dataKey}
                className="flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-300"
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                {s.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="h-[220px] md:h-[280px] w-full relative">
        {mounted && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={monthlyData}
              margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              barCategoryGap="28%"
            >
              <CartesianGrid
                vertical={false}
                className="stroke-zinc-200 dark:stroke-zinc-800/80"
              />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{
                  fill: "#94a3b8",
                  fontSize: 10,
                  fontFamily: "ui-monospace, monospace",
                }}
                dy={8}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={40}
                allowDecimals={false}
                tick={{
                  fill: "#94a3b8",
                  fontSize: 10,
                  fontFamily: "ui-monospace, monospace",
                }}
              />
              <RechartsTooltip
                cursor={{ fill: color, opacity: 0.08 }}
                content={
                  <CustomTooltip series={stacked ? series : undefined} />
                }
              />
              {stacked ? (
                series!.map((s, i) => (
                  <Bar
                    key={s.dataKey}
                    dataKey={s.dataKey}
                    stackId="merch"
                    fill={s.color}
                    maxBarSize={32}
                    // hanya segmen paling atas yang membulat
                    radius={i === series!.length - 1 ? [2, 2, 0, 0] : 0}
                  />
                ))
              ) : (
                <Bar
                  dataKey="pcs"
                  fill={color}
                  radius={[2, 2, 0, 0]}
                  maxBarSize={32}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        )}

        {mounted && isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              Belum ada pesanan dalam 6 bulan terakhir
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

export default ChartBar;
