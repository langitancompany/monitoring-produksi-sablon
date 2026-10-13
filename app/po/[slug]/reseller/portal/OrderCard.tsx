"use client";

import { useState } from "react";
import { Pencil, Trash2, MessageCircleMore } from "lucide-react";
import { POResellerOrder } from "@/lib/po/supabase";
import { formatRupiah } from "@/lib/po/pricing";

interface OrderCardProps {
  order: POResellerOrder;
  waPhone: string;
  onEdit: (order: POResellerOrder) => void;
  onDelete: (poNumber: string) => void;
}

export function OrderCard({
  order,
  waPhone,
  onEdit,
  onDelete,
}: OrderCardProps) {
  const [expanded, setExpanded] = useState(false);

  const date = new Date(order.created_at).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  function buildWaUrl() {
    const daftarBarang = order.order_items
      .map(
        (item, i) =>
          `${i + 1}. ${item.product_name} (${item.warna}, ${item.lengan}, ${item.ukuran}) — ${item.qty} pcs = ${formatRupiah(item.subtotal)}`,
      )
      .join("\n");

    const text = [
      `Halo Admin, konfirmasi ulang pesanan.`,
      ``,
      `*Kode PO:* ${order.po_number}`,
      order.notes ? `*Catatan:* ${order.notes}` : "",
      ``,
      `*Pesanan:*`,
      daftarBarang,
      ``,
      `*Total: ${formatRupiah(order.total_amount)}*`,
    ]
      .filter(Boolean)
      .join("\n");

    const phone = waPhone.replace(/\D/g, "");
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[12px] overflow-hidden">
      {/* Header Card */}
      <div
        className="p-[14px_16px] flex items-start justify-between gap-3 cursor-pointer select-none hover:bg-[#fafafa] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-[8px] mb-[4px] flex-wrap">
            <span className="text-[14.4px] font-extrabold font-mono tracking-[0.05em] text-[#0e0e0e]">
              {order.po_number}
            </span>
            <span className="bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0] px-[8px] py-[1px] rounded-full text-[10.5px] font-bold">
              Terkirim
            </span>
          </div>
          <div className="text-[12px] text-[#9ca3af]">{date}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[15px] font-extrabold text-[#15803d]">
            {formatRupiah(order.total_amount)}
          </div>
          <div className="text-[11.5px] text-[#9ca3af]">
            {order.order_items.reduce((s, i) => s + i.qty, 0)} pcs
          </div>
        </div>
      </div>

      {/* Expand: Daftar Item */}
      {expanded && (
        <div className="border-t border-[#e5e7eb]">
          <div className="divide-y divide-[#f3f4f6]">
            {order.order_items.map((item, idx) => (
              <div
                key={idx}
                className="px-[16px] py-[10px] flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-[13.6px] font-semibold text-[#0e0e0e] truncate">
                    {item.product_name}
                  </div>
                  <div className="text-[11.8px] text-[#9ca3af] mt-[1px]">
                    {item.warna} · {item.lengan} · {item.ukuran}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[12.5px] text-[#4b5563]">
                    {item.qty} pcs
                  </div>
                  <div className="text-[12.5px] font-bold text-[#185fa5]">
                    {formatRupiah(item.subtotal)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer expand */}
          <div className="p-[16px] bg-[#f9fafb] border-t border-[#e5e7eb] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-[12px] text-[#9ca3af]">
              {order.notes ? (
                <span>📝 {order.notes}</span>
              ) : (
                <span>Tidak ada catatan pengiriman.</span>
              )}
            </div>
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-[8px]">
              <button
                onClick={() => onEdit(order)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-[6px] bg-white border border-[#e5e7eb] text-[#4b5563] px-[12px] py-[8px] sm:py-[6px] rounded-[7px] text-[12px] font-bold hover:text-[#0e0e0e] hover:border-[#d1d5db] transition-colors shrink-0"
              >
                <Pencil size={13} /> Edit
              </button>
              <button
                onClick={() => onDelete(order.po_number)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-[6px] bg-white border border-[#fee2e2] text-[#dc2626] px-[12px] py-[8px] sm:py-[6px] rounded-[7px] text-[12px] font-bold hover:bg-[#fef2f2] transition-colors shrink-0"
              >
                <Trash2 size={13} /> Hapus
              </button>
              <a
                href={buildWaUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto flex items-center justify-center gap-[6px] bg-[#25D366] text-white px-[12px] py-[8px] sm:py-[6px] rounded-[7px] text-[12px] font-bold hover:opacity-90 transition-opacity decoration-transparent shrink-0"
              >
                <MessageCircleMore size={13} /> Kirim WA
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
