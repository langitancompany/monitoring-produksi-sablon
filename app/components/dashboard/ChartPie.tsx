import { memo, useState, useEffect, useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { ProductionTypeDataPoint } from "@/hooks/useDashboard";

// Palet bawaan (Sablon: teal, Bordir: oranye, DTF: kuning)
const DEFAULT_COLORS = ["#49BFB4", "#ff6437", "#e4e596"];

interface ChartPieProps {
  productionTypeData: ProductionTypeDataPoint[];
  title?: string;
  subtitle?: string;
  /** Label di tengah donut saat tidak ada yang di-hover. */
  totalLabel?: string;
  /** Warna per irisan, urut sesuai productionTypeData. */
  colors?: string[];
}

const ChartPie = memo(function ChartPie({
  productionTypeData,
  title = "Jenis Produksi",
  subtitle = "Distribusi tipe order keseluruhan",
  totalLabel = "Total order",
  colors = DEFAULT_COLORS,
}: ChartPieProps) {
  const [mounted, setMounted] = useState(false);
  // State hover dikelola sendiri supaya dua donut (Kaos & Merchandise)
  // tidak saling mempengaruhi.
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const total = useMemo(
    () => productionTypeData.reduce((sum, d) => sum + d.value, 0),
    [productionTypeData],
  );

  const activeData =
    activeIndex !== null ? productionTypeData[activeIndex] : null;

  const displayValue = activeData ? activeData.value : total;
  const displayLabel = activeData ? activeData.name : totalLabel;
  const displayColor =
    activeIndex !== null && activeData
      ? colors[activeIndex % colors.length]
      : undefined;

  return (
    <div className="bg-white dark:bg-zinc-950 p-5 md:p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 flex flex-col h-full">
      <div className="mb-4">
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-base tracking-tight">
          {title}
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          {subtitle}
        </p>
      </div>

      <div className="relative h-[190px] md:h-[220px]">
        {mounted && total > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={productionTypeData}
                cx="50%"
                cy="50%"
                innerRadius={62}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                onMouseEnter={(_, index) => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
                stroke="none"
              >
                {productionTypeData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={colors[index % colors.length]}
                    opacity={
                      activeIndex === null || activeIndex === index ? 1 : 0.35
                    }
                    className="transition-opacity duration-200 cursor-pointer"
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        )}

        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {total > 0 ? (
            <>
              <span
                className="font-mono tabular-nums text-2xl md:text-3xl font-semibold transition-colors duration-200 text-zinc-900 dark:text-white"
                style={displayColor ? { color: displayColor } : undefined}
              >
                {displayValue.toLocaleString("id-ID")}
              </span>
              <span className="text-[9px] md:text-[10px] uppercase tracking-[0.14em] text-zinc-400 font-semibold mt-1 transition-colors duration-200 text-center px-6">
                {displayLabel}
              </span>
            </>
          ) : (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              Belum ada pesanan
            </span>
          )}
        </div>
      </div>

      {/* Legend kustom */}
      {productionTypeData.length > 0 && (
        <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800/70 border-t border-zinc-100 dark:border-zinc-800/70">
          {productionTypeData.map((entry, index) => {
            const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0;
            const isActive = activeIndex === index;
            const itemColor = colors[index % colors.length];

            return (
              <li key={entry.name}>
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                  onFocus={() => setActiveIndex(index)}
                  onBlur={() => setActiveIndex(null)}
                  className={`w-full flex items-center gap-2.5 py-2 text-left transition-colors duration-150 ${
                    isActive ? "bg-zinc-50 dark:bg-zinc-900" : ""
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: itemColor }}
                  />
                  <span
                    className="text-xs flex-1 truncate transition-colors duration-150 text-zinc-600 dark:text-zinc-300"
                    style={isActive ? { color: itemColor } : undefined}
                  >
                    {entry.name}
                  </span>
                  <span
                    className="font-mono tabular-nums text-xs font-semibold transition-colors duration-150 text-zinc-900 dark:text-zinc-100"
                    style={isActive ? { color: itemColor } : undefined}
                  >
                    {entry.value.toLocaleString("id-ID")}
                  </span>
                  <span className="font-mono tabular-nums text-[10px] text-zinc-400 w-9 text-right">
                    {pct}%
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});

export default ChartPie;
