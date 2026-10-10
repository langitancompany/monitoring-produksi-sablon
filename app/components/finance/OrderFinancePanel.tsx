"use client";

import React, { useCallback, useEffect, useState } from "react";
import { FileText, Plus, History } from "lucide-react";
import { finFetch, errMsg } from "@/hooks/useFinanceApi";
import type { FinCaps } from "@/lib/finance/caps";
import type { OrderFinanceDetail } from "@/lib/finance/types";
import { StatusBadge } from "./StatusBadge";
import { PaymentRow } from "./PaymentRow";
import { usePaymentActions } from "./PaymentActions";
import RecordPaymentModal from "./RecordPaymentModal";
import InvoiceModal from "./InvoiceModal";
import { formatDateShort, formatDateTime, formatRupiah } from "./utils";

/**
 * Posisi keuangan satu order: tagihan, terbayar, sisa, riwayat pembayaran.
 * Dipakai di Order Detail (menggantikan form Harga & Pembayaran lama) dan di tab Tagihan.
 * Semua angka berasal dari server; komponen ini tidak menghitung uang sendiri.
 */
export default function OrderFinancePanel({
  orderId,
  caps,
  version = 0,
  onChanged,
}: {
  orderId: string;
  caps: FinCaps;
  version?: number;
  onChanged?: () => void;
}) {
  const [detail, setDetail] = useState<OrderFinanceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRecord, setShowRecord] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    try {
      setDetail(
        await finFetch<OrderFinanceDetail>(`/api/finance/orders/${orderId}`),
      );
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [orderId]);

  useEffect(() => {
    if (caps.view) void load();
  }, [load, caps.view, version]);

  const changed = useCallback(() => {
    void load();
    onChanged?.();
  }, [load, onChanged]);

  const actions = usePaymentActions(changed);

  if (!caps.view) return null;
  if (error)
    return (
      <p className="text-xs text-red-600 dark:text-red-400 p-4">{error}</p>
    );
  if (!detail)
    return <p className="text-xs text-zinc-400 p-4">Memuat data keuangan…</p>;

  const f = detail.finance;
  const hasInvoice = !!f.invoice_id;
  const progress =
    f.total > 0
      ? Math.min(100, Math.round((f.paid_verified / f.total) * 100))
      : 0;
  const visiblePayments = detail.payments;

  return (
    <section className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 md:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em]">
            Harga &amp; Pembayaran
          </h3>
          {hasInvoice && (
            <p className="text-[11px] text-zinc-400">
              Tagihan v{f.invoice_version} · jatuh tempo{" "}
              {formatDateShort(f.due_date)}
            </p>
          )}
        </div>
        <StatusBadge status={f.payment_status} />
      </div>

      {hasInvoice ? (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ["Tagihan", f.total, "text-zinc-900 dark:text-zinc-100"],
              [
                "Terbayar",
                f.paid_verified,
                "text-emerald-600 dark:text-emerald-400",
              ],
              [
                f.overpaid > 0 ? "Lebih bayar" : "Sisa",
                f.overpaid > 0 ? f.overpaid : f.balance,
                f.balance > 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-zinc-500",
              ],
            ].map(([l, v, c]) => (
              <div
                key={l as string}
                className="rounded-md bg-zinc-50 dark:bg-zinc-900 py-2.5"
              >
                <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em]">
                  {l}
                </p>
                <p
                  className={`text-sm font-semibold font-mono tabular-nums ${c}`}
                >
                  {formatRupiah(v as number)}
                </p>
              </div>
            ))}
          </div>

          <div>
            <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
              <div
                className="h-full bg-[#124540] dark:bg-[#49bfb4] transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            {f.paid_pending > 0 && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                {formatRupiah(f.paid_pending)} menunggu verifikasi (belum
                dihitung sebagai terbayar)
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Order ini belum ditagih.{" "}
          {caps.create
            ? "Terbitkan tagihan untuk mulai mencatat pembayaran."
            : "Hubungi bagian keuangan."}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {caps.create && (
          <button
            onClick={() => setShowInvoice(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150"
          >
            <FileText className="w-3.5 h-3.5" />
            {hasInvoice ? "Revisi tagihan" : "Terbitkan tagihan"}
          </button>
        )}
        {caps.create && hasInvoice && (
          <button
            onClick={() => setShowRecord(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md bg-[#124540] text-white hover:bg-[#0d332f] transition-colors duration-150"
          >
            <Plus className="w-3.5 h-3.5" /> Catat pembayaran
          </button>
        )}
        {detail.invoices.length > 1 && (
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150 ml-auto"
          >
            <History className="w-3.5 h-3.5" /> Riwayat tagihan (
            {detail.invoices.length})
          </button>
        )}
      </div>

      {showHistory && (
        <ul className="rounded-md border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
          {detail.invoices.map((i) => (
            <li
              key={i.id}
              className="px-3 py-2 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                  v{i.version}{" "}
                  {i.status === "active" && (
                    <span className="text-emerald-600 dark:text-emerald-400 font-normal">
                      · aktif
                    </span>
                  )}
                </p>
                <p className="text-[10px] text-zinc-400">
                  {i.issued_by_name ?? "-"} · {formatDateTime(i.issued_at)}
                  {i.reason ? ` · ${i.reason}` : ""}
                </p>
              </div>
              <span className="font-mono tabular-nums font-semibold text-zinc-600 dark:text-zinc-300">
                {formatRupiah(i.total)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {visiblePayments.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em]">
            Riwayat pembayaran
          </p>
          {visiblePayments.map((p) => (
            <PaymentRow key={p.id} p={p} caps={caps} actions={actions} />
          ))}
        </div>
      )}

      {actions.node}
      {showRecord && hasInvoice && (
        <RecordPaymentModal
          target={{ ...f, total: f.total }}
          canRefund={caps.edit}
          onClose={() => setShowRecord(false)}
          onDone={changed}
        />
      )}
      {showInvoice && (
        <InvoiceModal
          detail={detail}
          onClose={() => setShowInvoice(false)}
          onDone={changed}
        />
      )}
    </section>
  );
}
