import React from "react";

interface SummaryCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}

export function SummaryCard({ label, value, icon, color }: SummaryCardProps) {
  return (
    <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 flex items-center gap-3">
      <div
        className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${color}`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] truncate">
          {label}
        </p>
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 font-mono tabular-nums truncate mt-0.5">
          {value}
        </p>
      </div>
    </div>
  );
}
