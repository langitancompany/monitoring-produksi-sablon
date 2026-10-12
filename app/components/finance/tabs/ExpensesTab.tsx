"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpFromLine, Hourglass, Plus } from "lucide-react";
import { finFetch, errMsg } from "@/hooks/useFinanceApi";
import { useExpenseMeta } from "@/hooks/useExpenseMeta";
import type { FinCaps } from "@/lib/finance/caps";
import type { ExpenseRow as Row, ExpenseStatus } from "@/lib/finance/types";
import { ExpenseRow } from "../ExpenseRow";
import { useExpenseActions } from "../ExpenseActions";
import RecordExpenseModal from "../RecordExpenseModal";
import { SummaryCard } from "../SummaryCard";
import { FilterField, filterInputCls, toolbarCls, PrimaryButton } from "../ui";
import { formatRupiah, monthStartYmd, todayYmd } from "../utils";

/** Buku pengeluaran: catat, antrean persetujuan, filter periode/kategori/status. */
export default function ExpensesTab({
  caps,
  version,
  onChanged,
  initialStatus = "",
}: {
  caps: FinCaps;
  version: number;
  onChanged: () => void;
  initialStatus?: "" | ExpenseStatus;
}) {
  const { meta } = useExpenseMeta();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"" | ExpenseStatus>(initialStatus);
  const [categoryId, setCategoryId] = useState("");
  const [from, setFrom] = useState(monthStartYmd());
  const [to, setTo] = useState(todayYmd());
  const [showRecord, setShowRecord] = useState(false);

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (categoryId) p.set("category_id", categoryId);
    // Antrean persetujuan tidak dibatasi tanggal: yang menunggu harus selalu terlihat.
    if (status !== "pending") {
      if (from) p.set("from", from);
      if (to) p.set("to", to);
    }
    try {
      setRows((await finFetch<{ rows: Row[] }>(`/api/finance/expenses?${p}`)).rows);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [status, categoryId, from, to]);

  useEffect(() => {
    void load();
  }, [load, version]);

  const changed = useCallback(() => {
    void load();
    onChanged();
  }, [load, onChanged]);
  const actions = useExpenseActions(changed);

  const stats = useMemo(() => {
    const list = rows ?? [];
    const approved = list.filter((r) => r.status === "approved");
    const pending = list.filter((r) => r.status === "pending");
    const byCat = new Map<string, number>();
    for (const r of approved) {
      const k = r.category_name ?? "Tanpa kategori";
      byCat.set(k, (byCat.get(k) ?? 0) + r.amount);
    }
    return {
      approvedTotal: approved.reduce((n, r) => n + r.amount, 0),
      pendingCount: pending.length,
      pendingTotal: pending.reduce((n, r) => n + r.amount, 0),
      byCat: [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
    };
  }, [rows]);
  const maxCat = Math.max(1, ...stats.byCat.map(([, v]) => v));

  return (
    <div className="space-y-4 md:space-y-5">
      <div className={toolbarCls}>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-end gap-3 md:gap-4">
          <FilterField label="Status" className="col-span-2 sm:col-span-1">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "" | ExpenseStatus)}
              className={filterInputCls}
            >
              <option value="">Semua</option>
              <option value="pending">Menunggu persetujuan</option>
              <option value="approved">Disetujui</option>
              <option value="rejected">Ditolak</option>
              <option value="void">Dibatalkan</option>
            </select>
          </FilterField>
          <FilterField label="Kategori" className="col-span-2 sm:col-span-1">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={filterInputCls}>
              <option value="">Semua kategori</option>
              {meta?.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Dari">
            <input
              type="date"
              value={from}
              max={to}
              disabled={status === "pending"}
              onChange={(e) => setFrom(e.target.value)}
              className={filterInputCls}
            />
          </FilterField>
          <FilterField label="Sampai">
            <input
              type="date"
              value={to}
              min={from}
              disabled={status === "pending"}
              onChange={(e) => setTo(e.target.value)}
              className={filterInputCls}
            />
          </FilterField>
          {caps.create && (
            <div className="col-span-2 sm:col-span-1 sm:ml-auto">
              <PrimaryButton onClick={() => setShowRecord(true)} className="w-full sm:w-auto h-10">
                <Plus className="w-4 h-4" /> Catat pengeluaran
              </PrimaryButton>
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {!rows && !error && <p className="text-xs text-zinc-500 dark:text-zinc-400">Memuat…</p>}

      {rows && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            <SummaryCard
              label="Pengeluaran disetujui"
              value={formatRupiah(stats.approvedTotal)}
              icon={<ArrowUpFromLine className="w-5 h-5 text-red-600" />}
              color="bg-red-50 dark:bg-red-950/30"
            />
            <SummaryCard
              label={`Menunggu persetujuan (${stats.pendingCount})`}
              value={formatRupiah(stats.pendingTotal)}
              icon={<Hourglass className="w-5 h-5 text-amber-600" />}
              color="bg-amber-50 dark:bg-amber-950/30"
            />
            {stats.byCat.length > 0 && (
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 sm:col-span-2 lg:col-span-1">
                <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] mb-3">
                  Per kategori (disetujui)
                </p>
                <div className="space-y-2">
                  {stats.byCat.map(([name, v]) => (
                    <div key={name}>
                      <div className="flex justify-between text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
                        <span className="truncate pr-2">{name}</span>
                        <span className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                          {formatRupiah(v)}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
                        <div className="h-full bg-[#124540] dark:bg-[#49bfb4]" style={{ width: `${(v / maxCat) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-mono tabular-nums">{rows.length}</span> pengeluaran
          </p>
          {rows.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-12">
              {status === "pending"
                ? "Tidak ada pengeluaran yang menunggu persetujuan."
                : "Tidak ada pengeluaran pada filter ini."}
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
              {rows.map((x) => (
                <ExpenseRow key={x.id} x={x} caps={caps} actions={actions} />
              ))}
            </div>
          )}
        </>
      )}

      {actions.node}
      {showRecord && <RecordExpenseModal onClose={() => setShowRecord(false)} onDone={changed} />}
    </div>
  );
}
