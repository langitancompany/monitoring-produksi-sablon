"use client";

import React from "react";
import { Paperclip, Check, X, Ban } from "lucide-react";
import {
  PAYMENT_KIND_LABEL,
  PAYMENT_METHOD_LABEL,
  type PaymentRow as Row,
} from "@/lib/finance/types";
import type { FinCaps } from "@/lib/finance/caps";
import { PaymentStatusBadge } from "./StatusBadge";
import { formatDateShort, formatDateTime, formatRupiah } from "./utils";
import type { usePaymentActions } from "./PaymentActions";

type Actions = ReturnType<typeof usePaymentActions>;

/** Satu baris transaksi pembayaran, dipakai di panel order, tab Transaksi, dan tab Verifikasi. */
export function PaymentRow({
  p,
  caps,
  actions,
  showOrder = false,
}: {
  p: Row;
  caps: FinCaps;
  actions: Actions;
  showOrder?: boolean;
}) {
  const busy = actions.busyId === p.id;
  const isOut = p.kind === "refund";
  const dim = p.status === "void" || p.status === "rejected";

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {showOrder && (
            <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              {p.orders?.kode_produksi ?? "-"}{" "}
              <span className="font-normal text-zinc-400">
                · {p.orders?.nama_pemesan ?? ""}
              </span>
            </p>
          )}
          <p
            className={`text-sm font-semibold font-mono tabular-nums ${dim ? "line-through text-zinc-400" : isOut ? "text-red-600 dark:text-red-400" : "text-zinc-900 dark:text-zinc-100"}`}
          >
            {isOut ? "−" : ""}
            {formatRupiah(p.amount)}
          </p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            {PAYMENT_KIND_LABEL[p.kind]} · {PAYMENT_METHOD_LABEL[p.method]}
            {p.account_name ? ` · ${p.account_name}` : ""} ·{" "}
            {formatDateShort(p.paid_at)}
          </p>
        </div>
        <PaymentStatusBadge status={p.status} />
      </div>

      <div className="mt-2 text-[10px] text-zinc-400 space-y-0.5">
        <p>
          Dicatat {p.recorded_by_name ?? "-"} · {formatDateTime(p.recorded_at)}
        </p>
        {p.verified_at && p.status === "verified" && (
          <p>
            Diverifikasi {p.verified_by_name ?? "-"} ·{" "}
            {formatDateTime(p.verified_at)}
          </p>
        )}
        {(p.reference_no || p.payer_name) && (
          <p>
            {p.reference_no ? `Ref: ${p.reference_no}` : ""}
            {p.reference_no && p.payer_name ? " · " : ""}
            {p.payer_name ? `Pengirim: ${p.payer_name}` : ""}
          </p>
        )}
        {p.note && <p>Catatan: {p.note}</p>}
        {p.is_legacy && (
          <p className="text-zinc-400 italic">Saldo awal dari data lama</p>
        )}
        {p.status === "rejected" && p.reject_reason && (
          <p className="text-red-600 dark:text-red-400">
            Ditolak: {p.reject_reason}
          </p>
        )}
        {p.status === "void" && (
          <p className="text-zinc-500">
            Dibatalkan {p.void_by_name ?? "-"} · {p.void_reason}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {p.has_proof && (
          <button
            onClick={() => actions.openProof(p)}
            disabled={busy}
            className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150 disabled:opacity-50"
          >
            <Paperclip className="w-3 h-3" /> Lihat bukti
          </button>
        )}
        {p.status === "pending" && caps.edit && (
          <>
            <button
              onClick={() => actions.verify(p)}
              disabled={busy}
              className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors duration-150 disabled:opacity-50"
            >
              <Check className="w-3 h-3" /> Verifikasi
            </button>
            <button
              onClick={() => actions.reject(p)}
              disabled={busy}
              className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-md border border-red-200 text-red-600 dark:text-red-400 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-900/20 transition-colors duration-150 disabled:opacity-50"
            >
              <X className="w-3 h-3" /> Tolak
            </button>
          </>
        )}
        {(p.status === "pending" || p.status === "verified") && caps.delete && (
          <button
            onClick={() => actions.voidPayment(p)}
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
