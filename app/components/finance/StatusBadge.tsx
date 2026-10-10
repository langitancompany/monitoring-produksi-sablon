import React from "react";
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Ban,
  XCircle,
  FileQuestion,
  ArrowUpRight,
} from "lucide-react";
import type { OrderPaymentStatus, PaymentStatus } from "@/lib/finance/types";

const BASE =
  "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap";

const ORDER_STATUS: Record<
  OrderPaymentStatus,
  { cls: string; icon: React.ReactNode }
> = {
  "Belum Ditagih": {
    cls: "bg-zinc-50 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800",
    icon: <FileQuestion className="w-3 h-3" />,
  },
  "Belum Bayar": {
    cls: "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/50",
    icon: <AlertCircle className="w-3 h-3" />,
  },
  DP: {
    cls: "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/50",
    icon: <Clock className="w-3 h-3" />,
  },
  Lunas: {
    cls: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/50",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  "Kelebihan Bayar": {
    cls: "bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400 border-violet-100 dark:border-violet-900/50",
    icon: <ArrowUpRight className="w-3 h-3" />,
  },
};

/** Status tagihan order (dihitung otomatis oleh database). */
export function StatusBadge({ status }: { status: OrderPaymentStatus }) {
  const cfg = ORDER_STATUS[status] ?? ORDER_STATUS["Belum Ditagih"];
  return (
    <span className={`${BASE} ${cfg.cls}`}>
      {cfg.icon}
      {status}
    </span>
  );
}

const PAY_STATUS: Record<
  PaymentStatus,
  { label: string; cls: string; icon: React.ReactNode }
> = {
  pending: {
    label: "Menunggu verifikasi",
    cls: "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/50",
    icon: <Clock className="w-3 h-3" />,
  },
  verified: {
    label: "Terverifikasi",
    cls: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/50",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  rejected: {
    label: "Ditolak",
    cls: "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/50",
    icon: <XCircle className="w-3 h-3" />,
  },
  void: {
    label: "Dibatalkan",
    cls: "bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800",
    icon: <Ban className="w-3 h-3" />,
  },
};

/** Status satu transaksi pembayaran. */
export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const cfg = PAY_STATUS[status];
  return (
    <span className={`${BASE} ${cfg.cls}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}
