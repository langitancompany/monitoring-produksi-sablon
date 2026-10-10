"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useDialog } from "@/app/components/ui/DialogProvider";
import { finFetch, postJson, errMsg } from "@/hooks/useFinanceApi";
import type { FinCaps } from "@/lib/finance/caps";
import type { OrderFinanceRow, OrderPaymentStatus } from "@/lib/finance/types";
import { StatusBadge } from "../StatusBadge";
import OrderFinancePanel from "../OrderFinancePanel";
import RecordPaymentModal from "../RecordPaymentModal";
import { ModalShell, SearchInput, toolbarCls } from "../ui";
import { formatDateShort, formatRupiah } from "../utils";

const FILTERS: ("Semua" | OrderPaymentStatus)[] = [
  "Semua",
  "Belum Ditagih",
  "Belum Bayar",
  "DP",
  "Lunas",
  "Kelebihan Bayar",
];

export default function InvoicesTab({
  caps,
  version,
  onChanged,
}: {
  caps: FinCaps;
  version: number;
  onChanged: () => void;
}) {
  const { notify } = useDialog();
  const [rows, setRows] = useState<OrderFinanceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Semua");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [recordRow, setRecordRow] = useState<OrderFinanceRow | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(
        (await finFetch<{ rows: OrderFinanceRow[] }>("/api/finance/invoices"))
          .rows,
      );
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, version]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) =>
        (filter === "Semua" || r.payment_status === filter) &&
        (!s ||
          r.kode_produksi?.toLowerCase().includes(s) ||
          r.nama_pemesan?.toLowerCase().includes(s)),
    );
  }, [rows, q, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { Semua: (rows ?? []).length };
    for (const r of rows ?? [])
      c[r.payment_status] = (c[r.payment_status] ?? 0) + 1;
    for (const f of FILTERS) c[f] = c[f] ?? 0;
    return c;
  }, [rows]);

  const totals = useMemo(
    () => ({
      total: filtered.reduce((n, r) => n + r.total, 0),
      paid: filtered.reduce((n, r) => n + r.paid_verified, 0),
      balance: filtered.reduce((n, r) => n + r.balance, 0),
    }),
    [filtered],
  );

  const exportExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const data = filtered.map((r) => ({
        "Kode Produksi": r.kode_produksi,
        Pemesan: r.nama_pemesan,
        Qty: r.jumlah,
        "Tanggal Masuk": r.tanggal_masuk ?? "",
        "Jatuh Tempo": r.due_date ?? "",
        Tagihan: r.total,
        Terbayar: r.paid_verified,
        "Menunggu Verifikasi": r.paid_pending,
        Sisa: r.balance,
        Status: r.payment_status,
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Tagihan");
      XLSX.writeFile(
        wb,
        `tagihan-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
      // Catat siapa yang mengekspor (gagal mencatat tidak membatalkan ekspor).
      void postJson("/api/finance/export-log", {
        scope: `tagihan:${filter}`,
        row_count: data.length,
      }).catch(() => {});
    } catch (e) {
      notify(errMsg(e), { title: "Gagal ekspor" });
    }
  };

  return (
    <div className="space-y-4 md:space-y-5">
      <div className={`${toolbarCls} space-y-4`}>
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Cari kode produksi / pemesan…"
          />
          <button
            onClick={exportExcel}
            disabled={filtered.length === 0}
            className="flex items-center justify-center gap-2 h-10 text-sm font-semibold px-4 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150 disabled:opacity-50 shrink-0"
          >
            <Download className="w-4 h-4" /> Ekspor Excel
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border whitespace-nowrap transition-colors duration-150 ${
                filter === f
                  ? "bg-[#124540] text-white border-[#124540]"
                  : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600"
              }`}
            >
              {f}
              {counts[f] !== undefined && (
                <span className="ml-1.5 text-[10px] opacity-70 font-mono tabular-nums">
                  ({counts[f]})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      {!rows && !error && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Memuat…</p>
      )}

      {rows && (
        <>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-mono tabular-nums">{filtered.length}</span>{" "}
            order · tagihan{" "}
            <b className="text-zinc-900 dark:text-zinc-100 font-mono tabular-nums">
              {formatRupiah(totals.total)}
            </b>{" "}
            · terbayar{" "}
            <b className="text-emerald-600 dark:text-emerald-400">
              {formatRupiah(totals.paid)}
            </b>{" "}
            · sisa{" "}
            <b className="text-red-600 dark:text-red-400">
              {formatRupiah(totals.balance)}
            </b>
          </p>

          {filtered.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-12">
              Tidak ada data.
            </p>
          ) : (
            <ul className="space-y-2 md:space-y-3">
              {filtered.map((r) => (
                <li
                  key={r.order_id}
                  className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 sm:p-4 flex flex-col md:flex-row md:items-center gap-3"
                >
                  <div className="min-w-0 md:w-1/3">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {r.kode_produksi}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                      {r.nama_pemesan} · {r.jumlah} pcs
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      Masuk {formatDateShort(r.tanggal_masuk)}
                      {r.invoice_id && r.balance > 0
                        ? ` · jatuh tempo ${formatDateShort(r.due_date)}`
                        : ""}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-right md:flex-1">
                    {[
                      ["Tagihan", r.total, "text-zinc-900 dark:text-zinc-100"],
                      [
                        "Terbayar",
                        r.paid_verified,
                        "text-emerald-600 dark:text-emerald-400",
                      ],
                      [
                        "Sisa",
                        r.balance,
                        r.balance > 0
                          ? "text-red-600 dark:text-red-400"
                          : "text-zinc-400 dark:text-zinc-500",
                      ],
                    ].map(([l, v, c]) => (
                      <div key={l as string}>
                        <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em]">
                          {l}
                        </p>
                        <p
                          className={`text-xs font-semibold font-mono tabular-nums ${c}`}
                        >
                          {formatRupiah(v as number)}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 md:justify-end md:w-auto">
                    <StatusBadge status={r.payment_status} />
                    <button
                      onClick={() => setDetailId(r.order_id)}
                      className="text-[11px] font-semibold px-3 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150"
                    >
                      Rincian
                    </button>
                    {caps.create && r.invoice_id && r.balance > 0 && (
                      <button
                        onClick={() => setRecordRow(r)}
                        className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-[#124540] text-white hover:bg-[#0d332f] transition-colors duration-150"
                      >
                        Catat bayar
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {detailId && (
        <ModalShell
          title="Rincian keuangan order"
          onClose={() => setDetailId(null)}
          wide
        >
          <OrderFinancePanel
            orderId={detailId}
            caps={caps}
            version={version}
            onChanged={onChanged}
          />
        </ModalShell>
      )}
      {recordRow && (
        <RecordPaymentModal
          target={recordRow}
          canRefund={false}
          onClose={() => setRecordRow(null)}
          onDone={onChanged}
        />
      )}
    </div>
  );
}
