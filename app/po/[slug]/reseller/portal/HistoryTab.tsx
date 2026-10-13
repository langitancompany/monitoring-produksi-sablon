"use client";

import { POResellerOrder } from "@/lib/po/supabase";
import { OrderCard } from "./OrderCard";

interface HistoryTabProps {
  orders: POResellerOrder[];
  loadingOrders: boolean;
  waPhone: string;
  onEdit: (order: POResellerOrder) => void;
  onDelete: (poNumber: string) => void;
  onRefresh: () => void;
  onGoToOrder: () => void;
}

export function HistoryTab({
  orders,
  loadingOrders,
  waPhone,
  onEdit,
  onDelete,
  onRefresh,
  onGoToOrder,
}: HistoryTabProps) {
  if (loadingOrders) {
    return (
      <div className="text-center py-[48px] text-[13.5px] font-semibold text-[#9ca3af]">
        Memuat riwayat...
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="bg-white border border-[#e5e7eb] rounded-[12px] p-[40px] text-center">
        <div className="text-[32px] mb-[10px]">📋</div>
        <div className="text-[15px] font-bold text-[#0e0e0e] mb-[6px]">
          Belum ada pesanan
        </div>
        <div className="text-[13px] text-[#9ca3af] mb-[20px]">
          Pesanan yang sudah dikirim akan muncul di sini.
        </div>
        <button
          onClick={onGoToOrder}
          className="bg-[#0e0e0e] text-white px-[20px] py-[10px] rounded-[8px] text-[13.6px] font-bold hover:opacity-80 transition-opacity"
        >
          Buat Pesanan Pertama
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[12px]">
      <div className="flex items-center justify-between mb-[4px]">
        <div className="text-[13px] text-[#9ca3af] font-semibold">
          {orders.length} pesanan tersimpan
        </div>
        <button
          onClick={onRefresh}
          className="text-[12.5px] text-[#9ca3af] hover:text-[#0e0e0e] font-semibold transition-colors flex items-center gap-[5px]"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1 8a7 7 0 1 0 7-7 7 7 0 0 0-4.95 2.05L1 5" />
            <path d="M1 1v4h4" />
          </svg>
          Refresh
        </button>
      </div>

      {orders.map((order) => (
        <OrderCard
          key={order.po_number}
          order={order}
          waPhone={waPhone}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
