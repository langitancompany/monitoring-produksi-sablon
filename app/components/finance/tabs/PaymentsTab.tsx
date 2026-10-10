"use client";

import React, { useCallback, useEffect, useState } from "react";
import { finFetch, errMsg } from "@/hooks/useFinanceApi";
import type { FinCaps } from "@/lib/finance/caps";
import type { PaymentRow as Row, PaymentStatus } from "@/lib/finance/types";
import { PaymentRow } from "../PaymentRow";
import { usePaymentActions } from "../PaymentActions";
import { FilterField, filterInputCls, toolbarCls } from "../ui";
import { formatRupiah, monthStartYmd, todayYmd } from "../utils";

/** mode "all" = buku transaksi (semua status, filter tanggal). mode "pending" = antrean verifikasi. */
export default function PaymentsTab({
  mode,
  caps,
  version,
  onChanged,
}: {
  mode: "all" | "pending";
  caps: FinCaps;
  version: number;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"" | PaymentStatus>("");
  const [from, setFrom] = useState(monthStartYmd());
  const [to, setTo] = useState(todayYmd());

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (mode === "pending") p.set("status", "pending");
    else {
      if (status) p.set("status", status);
      if (from) p.set("from", from);
      if (to) p.set("to", to);
    }
    try {
      setRows(
        (await finFetch<{ rows: Row[] }>(`/api/finance/payments?${p}`)).rows,
      );
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [mode, status, from, to]);

  useEffect(() => {
    void load();
  }, [load, version]);

  const changed = useCallback(() => {
    void load();
    onChanged();
  }, [load, onChanged]);
  const actions = usePaymentActions(changed);

  const sum = (rows ?? [])
    .filter((r) => r.status === "verified")
    .reduce((n, r) => n + (r.kind === "refund" ? -r.amount : r.amount), 0);

  return (
    <div className="space-y-4 md:space-y-5">
      {mode === "all" && (
        <div className={toolbarCls}>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-end gap-3 md:gap-4">
            <FilterField label="Status" className="col-span-2 sm:col-span-1">
              <select
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as "" | PaymentStatus)
                }
                className={filterInputCls}
              >
                <option value="">Semua</option>
                <option value="pending">Menunggu verifikasi</option>
                <option value="verified">Terverifikasi</option>
                <option value="rejected">Ditolak</option>
                <option value="void">Dibatalkan</option>
              </select>
            </FilterField>
            <FilterField label="Dari">
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className={filterInputCls}
              />
            </FilterField>
            <FilterField label="Sampai">
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className={filterInputCls}
              />
            </FilterField>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      {!rows && !error && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Memuat…</p>
      )}

      {rows && (
        <>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-mono tabular-nums">{rows.length}</span>{" "}
            transaksi
            {mode === "all" && (
              <>
                {" "}
                · kas masuk terverifikasi{" "}
                <b className="text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                  {formatRupiah(sum)}
                </b>
              </>
            )}
          </p>
          {rows.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-12">
              {mode === "pending"
                ? "Tidak ada pembayaran yang menunggu verifikasi."
                : "Tidak ada transaksi pada filter ini."}
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
              {rows.map((p) => (
                <PaymentRow
                  key={p.id}
                  p={p}
                  caps={caps}
                  actions={actions}
                  showOrder
                />
              ))}
            </div>
          )}
        </>
      )}
      {actions.node}
    </div>
  );
}
