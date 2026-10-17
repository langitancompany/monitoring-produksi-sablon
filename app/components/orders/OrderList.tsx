// app/components/orders/OrderList.tsx

import React, { useState } from "react";
import {
  formatDate,
  getDeadlineStatus,
  MONTHS,
  orderTypeLabel,
} from "@/lib/utils";
import { Order, ProductionTypeData, UserData } from "@/types";
import {
  AlertTriangle,
  Calendar,
  ClipboardList,
  Clock,
  FileText,
  Loader2,
  Trash2,
  User,
  Users,
} from "lucide-react";

interface OrderListProps {
  role: string;
  orders: Order[];
  productionTypes: ProductionTypeData[];
  onSelectOrder: (id: string) => void;
  onNewOrder: () => void;
  onDeleteOrder: (id: string) => void;
  /** id pesanan yang sedang dihapus (untuk menampilkan loading di tombol sampah). */
  deletingOrderId?: string | null;
  currentUser: UserData;
  // ── TAMBAHAN ── dipakai ulang untuk daftar Pesanan Merchandise. Semua opsional,
  // default-nya = tampilan Pesanan Aktif (sablon) seperti sebelumnya.
  title?: string;
  newOrderLabel?: string;
  /** false = sembunyikan filter "Semua Jenis" (tidak relevan untuk merchandise). */
  showTypeFilter?: boolean;
  /** Permission yang menentukan tombol Buat/Hapus. Default "orders"; daftar merchandise memakai "merchandise". */
  permissionKey?: "orders" | "merchandise";
}

// Teks jenis pada kartu: merchandise menampilkan produknya (mis. "Lanyard · Dengan Stopper").
function typeLabel(o: Order): string {
  return orderTypeLabel(o);
}

// ─── Konstanta Alur Status ───────────────────────────────────────────────────

const STATUS_FLOW = [
  "Pesanan Masuk",
  "On Process",
  "Finishing",
  "Kirim",
  "Selesai",
] as const;

function getStepIndex(status: string): number {
  const map: Record<string, number> = {
    "Pesanan Masuk": 0,
    "On Process": 1,
    Finishing: 2,
    Kirim: 3,
    Selesai: 4,
    Revisi: 1,
    "Ada Kendala": 1,
    Telat: 1,
  };
  return map[status] ?? 0;
}

const isSpecialStatus = (status: string) =>
  ["Revisi", "Ada Kendala", "Telat"].includes(status);

function statusBadgeClass(status: string): string {
  switch (status) {
    case "Pesanan Masuk":
      return "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
    case "On Process":
      return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800";
    case "Finishing":
      return "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800";
    case "Kirim":
      return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800";
    case "Selesai":
      return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800";
    case "Revisi":
      return "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800";
    case "Ada Kendala":
      return "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800";
    case "Telat":
      return "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800";
    default:
      return "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700";
  }
}

// ─── Progress Bar ────────────────────────────────────────────────────────────

function ProgressBar({ status }: { status: string }) {
  const currentStep = getStepIndex(status);
  const isOverdue = status === "Telat";
  const isKendala = status === "Ada Kendala";
  const isRevisi = status === "Revisi";

  return (
    <div className="mt-2 mb-1">
      <div className="flex gap-1 mb-1">
        {STATUS_FLOW.map((_, i) => {
          let barClass = "h-1 flex-1 rounded-full ";
          if (i < currentStep) {
            barClass += "bg-emerald-400 dark:bg-emerald-600";
          } else if (i === currentStep) {
            if (isOverdue || isKendala)
              barClass += "bg-red-400 dark:bg-red-600";
            else if (isRevisi) barClass += "bg-orange-400 dark:bg-orange-500";
            else barClass += "bg-[#2589ff]";
          } else {
            barClass += "bg-zinc-200 dark:bg-zinc-700";
          }
          return <div key={i} className={barClass} />;
        })}
      </div>
      <div className="flex justify-between">
        {STATUS_FLOW.map((_, i) => {
          let labelClass = "text-[8px] flex-1 text-center ";
          if (i < currentStep) {
            labelClass += "text-emerald-600 dark:text-emerald-400 font-medium";
          } else if (i === currentStep) {
            if (isOverdue || isKendala)
              labelClass += "text-red-600 dark:text-red-400 font-semibold";
            else if (isRevisi)
              labelClass +=
                "text-orange-600 dark:text-orange-400 font-semibold";
            else labelClass += "text-[#2589ff] font-semibold";
          } else {
            labelClass += "text-zinc-400 dark:text-zinc-600";
          }
          const shortNames = [
            "Masuk",
            "Proses",
            "Finishing",
            "Kirim",
            "Selesai",
          ];
          return (
            <span key={i} className={labelClass}>
              {shortNames[i]}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Mobile Card ─────────────────────────────────────────────────────────────

interface MobileCardProps {
  order: Order;
  isManagement: boolean;
  canDeleteOrder: boolean;
  isDeleting?: boolean;
  onSelectOrder: (id: string) => void;
  onDeleteOrder: (id: string) => void;
}

function MobileCard({
  order,
  isManagement,
  canDeleteOrder,
  isDeleting = false,
  onSelectOrder,
  onDeleteOrder,
}: MobileCardProps) {
  const isOverdue =
    order.status === "Telat" ||
    getDeadlineStatus(order.deadline, order.status) === "overdue";
  const isKendala = order.status === "Ada Kendala";
  const isDone = order.status === "Selesai" || order.status === "Kirim";

  let borderAccent = "border-zinc-200 dark:border-zinc-800";
  if (isOverdue)
    borderAccent =
      "border-t-2 border-t-red-400 border-x-zinc-200 border-b-zinc-200 dark:border-t-red-600 dark:border-x-zinc-800 dark:border-b-zinc-800";
  else if (isKendala)
    borderAccent =
      "border-t-2 border-t-orange-400 border-x-zinc-200 border-b-zinc-200 dark:border-t-orange-500 dark:border-x-zinc-800 dark:border-b-zinc-800";
  else if (isDone)
    borderAccent =
      "border-t-2 border-t-emerald-400 border-x-zinc-200 border-b-zinc-200 dark:border-t-emerald-600 dark:border-x-zinc-800 dark:border-b-zinc-800";

  return (
    <div
      onClick={() => {
        if (!isDeleting) onSelectOrder(order.id);
      }}
      aria-busy={isDeleting}
      className={`block bg-white dark:bg-zinc-950 rounded-xl border ${borderAccent} p-3 transition-colors duration-150 ${isDeleting ? "cursor-wait" : "cursor-pointer"}`}
    >
      {/* Row 1: kode + badge status */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-mono font-semibold text-zinc-400 dark:text-zinc-500">
          #{order.kode_produksi}
        </span>
        <div className="flex items-center gap-1">
          {isSpecialStatus(order.status) && (
            <AlertTriangle className="w-3 h-3 text-red-500 dark:text-red-400" />
          )}
          <span
            className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wide ${statusBadgeClass(order.status)}`}
          >
            {order.status}
          </span>
        </div>
      </div>

      {/* Nama pemesan */}
      <p className="font-semibold text-sm text-zinc-900 dark:text-white line-clamp-1 mb-1 leading-tight">
        {order.nama_pemesan}
      </p>

      <ProgressBar status={order.status} />

      {/* Detail ringkas */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="font-mono tabular-nums text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">
            {order.jumlah.toLocaleString("id-ID")} pcs
          </span>
          <span className="text-[10px] text-zinc-400 dark:text-zinc-600">
            ·
          </span>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-semibold">
            {typeLabel(order)}
          </span>
        </div>
        <span
          className={`text-[10px] font-semibold ${isOverdue ? "text-red-500 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"}`}
        >
          {formatDate(order.deadline)}
        </span>
      </div>

      {/* PIC & Helper */}
      {isManagement && (
        <div className="flex flex-wrap gap-1 mt-2">
          {order.assigned_user && (
            <div className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded text-[9px] font-semibold border border-blue-100 dark:border-blue-900/30">
              <User className="w-2.5 h-2.5" /> {order.assigned_user.name}
            </div>
          )}
          {order.helper_user && (
            <div className="flex items-center gap-1 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 px-1.5 py-0.5 rounded text-[9px] font-semibold border border-orange-100 dark:border-orange-900/30">
              <Users className="w-2.5 h-2.5" /> {order.helper_user.name}
            </div>
          )}
        </div>
      )}

      {/* Tombol hapus */}
      {canDeleteOrder && (
        <button
          disabled={isDeleting}
          aria-busy={isDeleting}
          onClick={(e) => {
            e.stopPropagation();
            if (isDeleting) return;
            onDeleteOrder(order.id);
          }}
          className="mt-2 w-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-3 py-1.5 rounded-md text-[10px] font-semibold hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors duration-150 border border-red-200 dark:border-red-900/50 flex items-center justify-center gap-1.5 disabled:cursor-wait"
        >
          {isDeleting ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" /> Menghapus…
            </>
          ) : (
            <>
              <Trash2 className="w-3 h-3" /> Hapus
            </>
          )}
        </button>
      )}
    </div>
  );
}

// ─── Kanban ──────────────────────────────────────────────────────────────────

const KANBAN_COLUMNS: {
  status: string;
  label: string;
  borderClass: string;
  bgClass: string;
  textClass: string;
  countClass: string;
}[] = [
  {
    status: "Pesanan Masuk",
    label: "Pesanan Masuk",
    borderClass: "border-t-zinc-400 dark:border-t-zinc-500",
    bgClass: "bg-zinc-100 dark:bg-zinc-800/60",
    textClass: "text-zinc-700 dark:text-zinc-200",
    countClass: "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300",
  },
  {
    status: "On Process",
    label: "On Process",
    borderClass: "border-t-blue-500 dark:border-t-blue-400",
    bgClass: "bg-blue-50 dark:bg-blue-900/30",
    textClass: "text-blue-700 dark:text-blue-300",
    countClass:
      "bg-blue-100 dark:bg-blue-800/60 text-blue-600 dark:text-blue-300",
  },
  {
    status: "Finishing",
    label: "Finishing",
    borderClass: "border-t-violet-500 dark:border-t-violet-400",
    bgClass: "bg-violet-50 dark:bg-violet-900/30",
    textClass: "text-violet-700 dark:text-violet-300",
    countClass:
      "bg-violet-100 dark:bg-violet-800/60 text-violet-600 dark:text-violet-300",
  },
  {
    status: "Kirim",
    label: "Siap Kirim",
    borderClass: "border-t-amber-500 dark:border-t-amber-400",
    bgClass: "bg-amber-50 dark:bg-amber-900/30",
    textClass: "text-amber-700 dark:text-amber-300",
    countClass:
      "bg-amber-100 dark:bg-amber-800/60 text-amber-600 dark:text-amber-300",
  },
];

function getKanbanColumn(order: Order): string {
  if (["Revisi", "Ada Kendala", "Telat"].includes(order.status))
    return "On Process";
  return order.status;
}

interface KanbanCardProps {
  order: Order;
  isManagement: boolean;
  canDeleteOrder: boolean;
  isDeleting?: boolean;
  onSelectOrder: (id: string) => void;
  onDeleteOrder: (id: string) => void;
}

function KanbanCard({
  order,
  isManagement,
  canDeleteOrder,
  isDeleting = false,
  onSelectOrder,
  onDeleteOrder,
}: KanbanCardProps) {
  const isOverdue =
    order.status === "Telat" ||
    getDeadlineStatus(order.deadline, order.status) === "overdue";
  const isKendala = order.status === "Ada Kendala";
  const isRevisi = order.status === "Revisi";

  let leftBorder = "";
  if (isOverdue)
    leftBorder = "border-l-2 border-l-red-400 dark:border-l-red-600";
  else if (isKendala)
    leftBorder = "border-l-2 border-l-orange-400 dark:border-l-orange-500";
  else if (isRevisi)
    leftBorder = "border-l-2 border-l-amber-400 dark:border-l-amber-500";

  return (
    <div
      onClick={() => {
        if (!isDeleting) onSelectOrder(order.id);
      }}
      aria-busy={isDeleting}
      className={`block bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 ${leftBorder} p-3 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors duration-150 group ${isDeleting ? "cursor-wait" : "cursor-pointer"}`}
    >
      {/* Kode + Badge */}
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <span className="text-[9px] font-mono text-zinc-400 dark:text-zinc-500 font-semibold mt-0.5">
          #{order.kode_produksi}
        </span>
        <div className="flex flex-col items-end gap-0.5">
          {isSpecialStatus(order.status) && (
            <span
              className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full border uppercase tracking-wide flex items-center gap-0.5 ${statusBadgeClass(order.status)}`}
            >
              <AlertTriangle className="w-2 h-2" />
              {order.status}
            </span>
          )}
        </div>
      </div>

      {/* Nama */}
      <p className="font-semibold text-xs text-zinc-900 dark:text-white line-clamp-2 leading-tight mb-2">
        {order.nama_pemesan}
      </p>

      {/* Detail */}
      <div className="space-y-1 text-[10px] text-zinc-500 dark:text-zinc-400">
        <div className="flex items-center gap-1">
          <FileText className="w-3 h-3 shrink-0" />
          <span className="font-mono tabular-nums font-medium">
            {order.jumlah.toLocaleString("id-ID")} pcs
          </span>
          <span className="text-zinc-300 dark:text-zinc-600">·</span>
          <span className="uppercase font-semibold">{typeLabel(order)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3 shrink-0" />
          <span
            className={
              isOverdue ? "text-red-500 dark:text-red-400 font-semibold" : ""
            }
          >
            {formatDate(order.deadline)}
            {isOverdue && " · Telat!"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3 shrink-0" />
          <span>{formatDate(order.tanggal_masuk)}</span>
        </div>
      </div>

      {/* PIC & Helper */}
      {isManagement && (
        <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
          {order.assigned_user && (
            <div className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded text-[9px] font-semibold border border-blue-100 dark:border-blue-900/30">
              <User className="w-2.5 h-2.5" /> {order.assigned_user.name}
            </div>
          )}
          {order.helper_user && (
            <div className="flex items-center gap-1 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 px-1.5 py-0.5 rounded text-[9px] font-semibold border border-orange-100 dark:border-orange-900/30">
              <Users className="w-2.5 h-2.5" /> {order.helper_user.name}
            </div>
          )}
        </div>
      )}

      {/* Hapus */}
      {canDeleteOrder && (
        <button
          disabled={isDeleting}
          aria-busy={isDeleting}
          onClick={(e) => {
            e.stopPropagation();
            if (isDeleting) return;
            onDeleteOrder(order.id);
          }}
          className={`mt-2 w-full bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 px-2 py-1 rounded-md text-[9px] font-semibold hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors duration-150 border border-red-100 dark:border-red-900/30 flex items-center justify-center gap-1 disabled:cursor-wait ${
            isDeleting ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          {isDeleting ? (
            <>
              <Loader2 className="w-2.5 h-2.5 animate-spin" /> Menghapus…
            </>
          ) : (
            <>
              <Trash2 className="w-2.5 h-2.5" /> Hapus
            </>
          )}
        </button>
      )}
    </div>
  );
}

// ─── Sorting ─────────────────────────────────────────────────────────────────

function sortByUrgency(orders: Order[]): Order[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const H3 = 3 * 24 * 60 * 60 * 1000;

  const getTier = (order: Order): number => {
    const isOverdue =
      order.status === "Telat" ||
      getDeadlineStatus(order.deadline, order.status) === "overdue";
    if (isOverdue) return 0;
    const deadline = new Date(order.deadline);
    deadline.setHours(0, 0, 0, 0);
    const diffMs = deadline.getTime() - now.getTime();
    if (diffMs <= H3) return 1;
    return 2;
  };

  return [...orders].sort((a, b) => {
    const tierA = getTier(a);
    const tierB = getTier(b);
    if (tierA !== tierB) return tierA - tierB;
    if (tierA === 0 || tierA === 1)
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    return (
      new Date(a.tanggal_masuk).getTime() - new Date(b.tanggal_masuk).getTime()
    );
  });
}

// ─── Kanban Board ─────────────────────────────────────────────────────────────

interface KanbanBoardProps {
  orders: Order[];
  isManagement: boolean;
  canDeleteOrder: boolean;
  deletingOrderId?: string | null;
  onSelectOrder: (id: string) => void;
  onDeleteOrder: (id: string) => void;
}

function KanbanBoard({
  orders,
  isManagement,
  canDeleteOrder,
  deletingOrderId,
  onSelectOrder,
  onDeleteOrder,
}: KanbanBoardProps) {
  const sortedOrders = sortByUrgency(orders);
  return (
    <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1">
      {KANBAN_COLUMNS.map((col) => {
        const colOrders = sortedOrders.filter(
          (o) => getKanbanColumn(o) === col.status,
        );
        return (
          <div key={col.status} className="flex-1 min-w-44">
            <div
              className={`rounded-xl border-t-2 border border-zinc-200 dark:border-zinc-800 ${col.borderClass} ${col.bgClass} mb-2 px-3 py-2 flex items-center justify-between`}
            >
              <span className={`text-xs font-semibold ${col.textClass}`}>
                {col.label}
              </span>
              <span
                className={`font-mono tabular-nums text-[10px] font-semibold px-2 py-0.5 rounded-full ${col.countClass}`}
              >
                {colOrders.length}
              </span>
            </div>
            <div className="space-y-2">
              {colOrders.map((order) => (
                <KanbanCard
                  key={order.id}
                  order={order}
                  isManagement={isManagement}
                  canDeleteOrder={canDeleteOrder}
                  isDeleting={deletingOrderId === order.id}
                  onSelectOrder={onSelectOrder}
                  onDeleteOrder={onDeleteOrder}
                />
              ))}
              {colOrders.length === 0 && (
                <div className="text-center text-[10px] text-zinc-300 dark:text-zinc-700 py-6 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-md">
                  Kosong
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Komponen Utama ───────────────────────────────────────────────────────────

export default function OrderList({
  role,
  orders,
  productionTypes,
  onSelectOrder,
  onNewOrder,
  onDeleteOrder,
  deletingOrderId,
  currentUser,
  title = "Daftar Pesanan",
  newOrderLabel = "Pesanan baru",
  showTypeFilter = true,
  permissionKey = "orders",
}: OrderListProps) {
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const listPerms = currentUser?.permissions?.[permissionKey];
  const canDeleteOrder = role === "supervisor" || listPerms?.delete === true;
  const canCreateOrder = role === "supervisor" || listPerms?.create === true;
  const isManagement = ["admin", "manager", "supervisor"].includes(role);

  const filteredOrders = orders.filter((o) => {
    if (statusFilter !== "completed" && o.status === "Selesai") return false;

    let statusMatch = true;
    if (statusFilter === "process") {
      statusMatch = ["On Process", "Finishing", "Pesanan Masuk"].includes(
        o.status,
      );
    } else if (statusFilter === "overdue") {
      statusMatch =
        o.status === "Telat" ||
        getDeadlineStatus(o.deadline, o.status) === "overdue";
    } else if (statusFilter === "completed") {
      statusMatch = o.status === "Selesai" || o.status === "Kirim";
    } else if (statusFilter === "kendala") {
      statusMatch = o.status === "Ada Kendala" || o.status === "Revisi";
    }

    let monthMatch = true;
    if (monthFilter !== "all") {
      const orderMonth = new Date(o.tanggal_masuk).getMonth();
      monthMatch = orderMonth.toString() === monthFilter;
    }

    let typeMatch = true;
    if (typeFilter !== "all") typeMatch = o.jenis_produksi === typeFilter;

    return statusMatch && monthMatch && typeMatch;
  });

  const countOverdue = orders.filter(
    (o) =>
      o.status !== "Selesai" &&
      (o.status === "Telat" ||
        getDeadlineStatus(o.deadline, o.status) === "overdue"),
  ).length;
  const countKendala = orders.filter((o) =>
    ["Ada Kendala", "Revisi"].includes(o.status),
  ).length;

  const filterButtons = [
    { id: null, label: "Semua", count: null },
    { id: "process", label: "Proses", count: null },
    { id: "overdue", label: "Telat", count: countOverdue },
    { id: "kendala", label: "Kendala", count: countKendala },
    { id: "completed", label: "Siap Kirim", count: null },
  ];

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="hidden md:block">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
            {title}
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            <span className="font-mono tabular-nums">
              {filteredOrders.length}
            </span>{" "}
            pesanan ditampilkan
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <select
            className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs rounded-md px-2 py-2 focus:ring-2 focus:ring-[#124540] focus:border-[#124540] outline-none transition-colors duration-150"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
          >
            <option value="all">Semua Bulan</option>
            {MONTHS.map((m, i) => (
              <option key={i} value={i.toString()}>
                {m}
              </option>
            ))}
          </select>
          {showTypeFilter && (
            <select
              className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs rounded-md px-2 py-2 focus:ring-2 focus:ring-[#124540] focus:border-[#124540] outline-none transition-colors duration-150"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="all">Semua Jenis</option>
              {productionTypes.map((pt) => (
                <option key={pt.id} value={pt.value}>
                  {pt.name}
                </option>
              ))}
            </select>
          )}
          {canCreateOrder && (
            <button
              onClick={onNewOrder}
              className="ml-auto md:ml-0 bg-[#124540] hover:bg-[#0d332f] text-white px-3 py-2 rounded-md text-xs font-semibold flex items-center gap-2 transition-colors duration-150 whitespace-nowrap"
            >
              <ClipboardList className="w-3.5 h-3.5" /> {newOrderLabel}
            </button>
          )}
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {filterButtons.map((f) => (
          <button
            key={f.id ?? "all"}
            onClick={() => setStatusFilter(f.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors duration-150 border ${
              statusFilter === f.id
                ? "bg-[#124540] text-white border-[#124540]"
                : "bg-white text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700"
            }`}
          >
            {f.label}
            {f.count !== null && f.count > 0 && (
              <span
                className={`font-mono tabular-nums text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                  statusFilter === f.id
                    ? "bg-white/20 text-white"
                    : "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
                }`}
              >
                {f.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Kanban — Desktop */}
      <div className="hidden md:block">
        {filteredOrders.length > 0 ? (
          <KanbanBoard
            orders={filteredOrders}
            isManagement={isManagement}
            canDeleteOrder={canDeleteOrder}
            deletingOrderId={deletingOrderId}
            onSelectOrder={onSelectOrder}
            onDeleteOrder={onDeleteOrder}
          />
        ) : (
          <div className="text-center text-zinc-400 dark:text-zinc-500 py-16 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-950/50 text-sm">
            Tidak ada pesanan sesuai filter
          </div>
        )}
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-2.5">
        {filteredOrders.length > 0 ? (
          sortByUrgency(filteredOrders).map((order) => (
            <MobileCard
              key={order.id}
              order={order}
              isManagement={isManagement}
              canDeleteOrder={canDeleteOrder}
              isDeleting={deletingOrderId === order.id}
              onSelectOrder={onSelectOrder}
              onDeleteOrder={onDeleteOrder}
            />
          ))
        ) : (
          <div className="text-center text-zinc-400 dark:text-zinc-500 py-12 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-950/50 text-xs">
            Tidak ada pesanan sesuai filter
          </div>
        )}
      </div>
    </div>
  );
}
