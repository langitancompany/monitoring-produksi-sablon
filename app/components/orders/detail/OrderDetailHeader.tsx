// app/components/orders/detail/OrderDetailHeader.tsx

import React from "react";
import {
  formatDate,
  getStatusColor,
  openWA,
  getDeadlineStatus,
  orderTypeLabel,
} from "@/lib/utils";
import { Order, UserData } from "@/types";
import {
  ChevronRight,
  MessageCircle,
  Pencil,
  Phone,
  Printer,
  Loader2,
  Trash2,
  User,
  Users,
} from "lucide-react";

interface OrderDetailHeaderProps {
  order: Order;
  currentUser: UserData;
  isPrintingLabel: boolean;
  canEditOrderInfo: boolean;
  canDeleteOrder: boolean;
  isDeleting?: boolean; // ── TAMBAHAN ── loading di tombol Hapus
  onBack: () => void;
  onEdit: () => void;
  onDelete: (id: string) => void;
  onPrintLabel: () => void;
}

// Ganti dengan domain produksi Anda
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://sablon.langitan.co";

export default function OrderDetailHeader({
  order,
  currentUser,
  isPrintingLabel,
  canEditOrderInfo,
  canDeleteOrder,
  isDeleting = false,
  onBack,
  onEdit,
  onDelete,
  onPrintLabel,
}: OrderDetailHeaderProps) {
  const isManagement = ["admin", "manager", "super_admin"].includes(
    currentUser.role,
  );
  const isLate = getDeadlineStatus(order.deadline, order.status) === "overdue";

  // ─── Kirim konfirmasi pesanan via WhatsApp ────────────────────────────────

  const handleKirimKonfirmasi = () => {
    const trackingUrl = `${APP_URL}/tracking?kode=${encodeURIComponent(order.kode_produksi)}`;
    const pesan = [
      `Assalamu'alaikum, *${order.nama_pemesan}* 👋`,
      ``,
      `Pesanan Anda telah kami terima dan sedang kami proses.`,
      ``,
      `📦 *Detail Pesanan*`,
      `Kode  : *${order.kode_produksi}*`,
      `Item  : ${order.jumlah} pcs (${orderTypeLabel(order)})`,
      `Estimasi selesai: *${formatDate(order.deadline)}*`,
      ``,
      `🔍 *Pantau progres produksi Anda di:*`,
      trackingUrl,
      ``,
      `Terima kasih telah mempercayai Langitan.co 🙏`,
    ].join("\n");

    const nomorWA = order.no_hp?.replace(/\D/g, "");
    if (!nomorWA) {
      alert("Nomor HP pelanggan belum diisi.");
      return;
    }

    // Pastikan nomor diawali kode negara (62 untuk Indonesia)
    const nomorFormatted = nomorWA.startsWith("0")
      ? `62${nomorWA.slice(1)}`
      : nomorWA;

    window.open(
      `https://wa.me/${nomorFormatted}?text=${encodeURIComponent(pesan)}`,
      "_blank",
    );
  };

  return (
    <>
      {/* Tombol aksi atas */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button
          onClick={onBack}
          className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400 hover:text-[#49BFB4] dark:hover:text-[#49BFB4] flex items-center gap-2 font-semibold p-2 -ml-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors duration-150"
        >
          <ChevronRight className="w-4 h-4 md:w-5 md:h-5 rotate-180" /> Kembali
        </button>
        <div className="flex flex-wrap gap-2">
          {/* Tombol kirim konfirmasi WA — hanya management */}
          {isManagement && (
            <button
              onClick={onPrintLabel}
              disabled={isPrintingLabel}
              className="border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 px-3 py-1.5 rounded-md text-xs md:text-sm font-semibold flex items-center gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition-colors duration-150 disabled:opacity-50"
            >
              <Printer className="w-3 h-3" />
              {isPrintingLabel ? "Memproses..." : "Label Kirim"}
            </button>
          )}
          {canEditOrderInfo && (
            <button
              onClick={onEdit}
              className="bg-[#124540] text-white px-3 py-1.5 rounded-md text-xs md:text-sm font-semibold flex items-center gap-2 hover:bg-emerald-700 transition-colors duration-150"
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
          )}
          {canDeleteOrder && (
            <button
              onClick={() => onDelete(order.id)}
              disabled={isDeleting}
              className="bg-red-600 text-white px-3 py-1.5 rounded-md text-xs md:text-sm font-semibold flex items-center gap-2 hover:bg-red-700 disabled:opacity-70 disabled:cursor-not-allowed transition-colors duration-150"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" /> Menghapus...
                </>
              ) : (
                <>
                  <Trash2 className="w-3 h-3" /> Hapus
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Info pesanan */}
      <div className="bg-white dark:bg-zinc-950 p-5 md:p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-xl md:text-2xl font-semibold text-zinc-900 dark:text-white mb-1">
            {order.nama_pemesan}
          </h1>
          <div className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400 font-medium flex flex-wrap gap-2 md:gap-3 items-center">
            <span className="font-mono tabular-nums bg-zinc-100 dark:bg-zinc-900 px-2 py-0.5 rounded-md text-zinc-600 dark:text-zinc-300">
              #{order.kode_produksi}
            </span>
            <span className="font-mono tabular-nums">{order.jumlah} Pcs</span>
            <span
              className={
                isLate
                  ? "font-mono tabular-nums text-red-600 dark:text-red-400 font-semibold"
                  : "font-mono tabular-nums"
              }
            >
              {formatDate(order.deadline)}
            </span>
            <button
              onClick={handleKirimKonfirmasi}
              className="bg-green-600 text-white px-2 py-1 rounded-md text-[10px] font-semibold flex items-center gap-1.5"
            >
              <MessageCircle className="w-3 h-3" /> Konfirmasi WA
            </button>
          </div>

          {isManagement && (
            <div className="mt-3 flex items-center gap-3">
              <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-2 py-1 rounded-md border border-blue-100 dark:border-blue-900/40 w-fit">
                <User className="w-3.5 h-3.5" />
                <span className="text-xs font-semibold">
                  PJ: {order.assigned_user?.name || "-"}
                </span>
              </div>
              {order.helper_user && (
                <div className="flex items-center gap-1.5 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 px-2 py-1 rounded-md border border-orange-100 dark:border-orange-900/40 w-fit">
                  <Users className="w-3.5 h-3.5" />
                  <span className="text-xs font-semibold">
                    Helper: {order.helper_user.name}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 items-end w-full md:w-auto">
          <div
            className={`px-2.5 py-1 rounded-full font-semibold text-[11px] uppercase tracking-wide text-center w-full md:w-auto ${getStatusColor(order.status)}`}
          >
            {order.status}
          </div>
          {isLate && (
            <div className="px-2.5 py-1 rounded-full font-semibold text-[11px] bg-red-600 text-white uppercase tracking-wide text-center w-full md:w-auto">
              Telat Deadline
            </div>
          )}
        </div>
      </div>
    </>
  );
}
