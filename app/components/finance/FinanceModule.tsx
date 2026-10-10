"use client";

// Menu Keuangan v2. Fase 1 = UANG MASUK (tagihan, pembayaran, verifikasi).
// Tab "Pengeluaran" disiapkan di navigasi; skema database & fungsinya sudah ada (lihat docs/keuangan).

import React, { useCallback, useMemo, useState } from "react";
import {
  LayoutDashboard,
  FileText,
  ArrowDownToLine,
  ShieldCheck,
  ArrowUpFromLine,
} from "lucide-react";
import type { UserData } from "@/types";
import { getFinanceCaps } from "@/lib/finance/caps";
import { useFinanceMeta } from "@/hooks/useFinanceApi";
import OverviewTab from "./tabs/OverviewTab";
import InvoicesTab from "./tabs/InvoicesTab";
import PaymentsTab from "./tabs/PaymentsTab";

type TabId = "overview" | "invoices" | "payments" | "verify" | "expenses";

export default function FinanceModule({
  currentUser,
}: {
  currentUser: UserData;
}) {
  const caps = useMemo(() => getFinanceCaps(currentUser), [currentUser]);
  const [tab, setTab] = useState<TabId>("overview");
  const [version, setVersion] = useState(0);
  const { meta, reload } = useFinanceMeta();

  // Setiap perubahan data: muat ulang tab aktif + badge antrean verifikasi.
  const changed = useCallback(() => {
    setVersion((v) => v + 1);
    void reload();
  }, [reload]);

  if (!caps.view) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400 p-6">
        Anda tidak memiliki akses ke menu Keuangan.
      </p>
    );
  }

  const pending = meta?.pending_count ?? 0;
  const tabs: {
    id: TabId;
    label: string;
    icon: React.ReactNode;
    show: boolean;
    badge?: number;
    soon?: boolean;
  }[] = [
    {
      id: "overview",
      label: "Ringkasan",
      icon: <LayoutDashboard size={14} className="shrink-0" />,
      show: true,
    },
    {
      id: "invoices",
      label: "Tagihan",
      icon: <FileText size={14} className="shrink-0" />,
      show: true,
    },
    {
      id: "payments",
      label: "Transaksi",
      icon: <ArrowDownToLine size={14} className="shrink-0" />,
      show: true,
    },
    {
      id: "verify",
      label: "Verifikasi",
      icon: <ShieldCheck size={14} className="shrink-0" />,
      show: caps.edit,
      badge: pending,
    },
    {
      id: "expenses",
      label: "Pengeluaran",
      icon: <ArrowUpFromLine size={14} className="shrink-0" />,
      show: true,
      soon: true,
    },
  ];

  const visibleTabs = tabs.filter((t) => t.show);

  // Panah kiri/kanan untuk pindah tab (aksesibilitas), melewati tab "segera".
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const usable = visibleTabs.filter((t) => !t.soon);
    const i = usable.findIndex((t) => t.id === tab);
    const next =
      e.key === "ArrowRight"
        ? usable[(i + 1) % usable.length]
        : usable[(i - 1 + usable.length) % usable.length];
    setTab(next.id);
  };

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
          Keuangan
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
          Tagihan, pembayaran masuk, dan verifikasi. Semua perubahan tercatat di
          log audit.
        </p>
      </div>

      {/* ── Tab navigasi (gaya sama dengan Pengaturan & PO Management) ── */}
      <div
        role="tablist"
        aria-label="Menu keuangan"
        onKeyDown={onKeyDown}
        className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-1.5 flex gap-1 overflow-x-auto no-scrollbar [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {visibleTabs.map((t) => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              id={`fin-tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls={`fin-panel-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              disabled={t.soon}
              onClick={() => setTab(t.id)}
              title={t.soon ? "Segera hadir" : undefined}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold rounded-md whitespace-nowrap shrink-0 transition-colors duration-150 ${
                isActive
                  ? "bg-[#124540] text-white"
                  : t.soon
                    ? "text-zinc-300 dark:text-zinc-600 cursor-not-allowed"
                    : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:text-zinc-700 dark:hover:text-zinc-200"
              }`}
            >
              {t.icon}
              {t.label}
              {t.soon && (
                <span className="text-[9px] font-semibold uppercase tracking-[0.08em] bg-zinc-100 dark:bg-zinc-900 text-zinc-400 rounded px-1.5 py-0.5">
                  Segera
                </span>
              )}
              {!!t.badge && (
                <span
                  className={`text-[10px] font-semibold rounded-full px-1.5 min-w-[18px] text-center ${
                    isActive
                      ? "bg-white text-[#124540]"
                      : "bg-amber-500 text-white"
                  }`}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`fin-panel-${tab}`}
        aria-labelledby={`fin-tab-${tab}`}
      >
        {tab === "overview" && (
          <OverviewTab
            version={version}
            canVerify={caps.edit}
            onGoVerify={() => setTab("verify")}
          />
        )}
        {tab === "invoices" && (
          <InvoicesTab caps={caps} version={version} onChanged={changed} />
        )}
        {tab === "payments" && (
          <PaymentsTab
            key="all"
            mode="all"
            caps={caps}
            version={version}
            onChanged={changed}
          />
        )}
        {tab === "verify" && caps.edit && (
          <PaymentsTab
            key="pending"
            mode="pending"
            caps={caps}
            version={version}
            onChanged={changed}
          />
        )}
      </div>
    </div>
  );
}
