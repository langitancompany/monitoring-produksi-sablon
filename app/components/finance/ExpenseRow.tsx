"use client";

import React from "react";
import { Paperclip, Check, X, Ban } from "lucide-react";
import type { ExpenseRow as Row } from "@/lib/finance/types";
import type { FinCaps } from "@/lib/finance/caps";
import { ExpenseStatusBadge } from "./StatusBadge";
import { formatDateShort, formatDateTime, formatRupiah } from "./utils";
import type { useExpenseActions } from "./ExpenseActions";

type Actions = ReturnType<typeof useExpenseActions>;

/** Satu baris pengeluaran. */
export function ExpenseRow({ x, caps, actions }: { x: Row; caps: FinCaps; actions: Actions }) {
  const busy = actions.busyId === x.id;
  const dim = x.status === "void" || x.status === "rejected";

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
            {x.description}
          </p>
          <p
            className={`text-sm font-semibold font-mono tabular-nums mt-0.5 ${dim ? "line-through text-zinc-400" : "text-zinc-900 dark:text-zinc-100"}`}
          >
            {formatRupiah(x.amount)}
          </p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            {x.category_name ?? "-"}
            {x.vendor_name ? ` · ${x.vendor_name}` : ""}
            {x.account_name ? ` · ${x.account_name}` : ""} · {formatDateShort(x.spent_at)}
          </p>
        </div>
        <ExpenseStatusBadge status={x.status} />
      </div>

      <div className="mt-2 text-[10px] text-zinc-400 space-y-0.5">
        {x.order_kode && (
          <p>
            Biaya order:{" "}
            <span className="font-mono">{x.order_kode}</span>
            {x.order_nama ? ` · ${x.order_nama}` : ""}
          </p>
        )}
        <p>
          {x.expense_no ? <span className="font-mono">{x.expense_no} · </span> : null}
          Dicatat {x.recorded_by_name ?? "-"} · {formatDateTime(x.recorded_at)}
        </p>
        {x.approved_at && x.status === "approved" && (
          <p>
            Disetujui {x.approved_by_name ?? "-"} · {formatDateTime(x.approved_at)}
          </p>
        )}
        {x.note && <p>Catatan: {x.note}</p>}
        {x.source !== "manual" && <p className="italic">Sumber: {x.source}</p>}
        {x.status === "rejected" && x.reject_reason && (
          <p className="text-red-600 dark:text-red-400">Ditolak: {x.reject_reason}</p>
        )}
        {x.status === "void" && (
          <p className="text-zinc-500">
            Dibatalkan {x.void_by_name ?? "-"} · {x.void_reason}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {x.has_proof && (
          <button
            onClick={() => actions.openProof(x)}
            disabled={busy}
            className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150 disabled:opacity-50"
          >
            <Paperclip className="w-3 h-3" /> Lihat bukti
          </button>
        )}
        {x.status === "pending" && caps.approver && (
          <>
            <button
              onClick={() => actions.approve(x)}
              disabled={busy}
              className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors duration-150 disabled:opacity-50"
            >
              <Check className="w-3 h-3" /> Setujui
            </button>
            <button
              onClick={() => actions.reject(x)}
              disabled={busy}
              className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-md border border-red-200 text-red-600 dark:text-red-400 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-900/20 transition-colors duration-150 disabled:opacity-50"
            >
              <X className="w-3 h-3" /> Tolak
            </button>
          </>
        )}
        {(x.status === "pending" || x.status === "approved") && caps.delete && (
          <button
            onClick={() => actions.voidExpense(x)}
            disabled={busy}
            className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-md text-zinc-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors duration-150 disabled:opacity-50 ml-auto"
          >
            <Ban className="w-3 h-3" /> Void
          </button>
        )}
      </div>
    </div>
  );
}
