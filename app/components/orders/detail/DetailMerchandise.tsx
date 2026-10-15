// app/components/orders/detail/DetailMerchandise.tsx
//
// ── TAMBAHAN ── Ringkasan pesanan MERCHANDISE di halaman detail: jenis (produk),
// varian bila ada, jumlah, dan catatan tambahan. Menggantikan DetailUkuran/DetailGesut yang
// hanya relevan untuk pesanan sablon (dikontrol dari OrderDetail.tsx).

import React from "react";
import { Order } from "@/types";
import { merchandiseProductLabel, merchandiseVariantLabel } from "@/lib/utils";

interface DetailMerchandiseProps {
  order: Order;
}

export default function DetailMerchandise({ order }: DetailMerchandiseProps) {
  return (
    <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 md:p-6">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide mb-3">
        Detail Merchandise
      </h3>

      {(() => {
        const varian = merchandiseVariantLabel(
          order.jenis_merchandise,
          order.varian_merchandise,
        );
        const items = [
          {
            label: "Jenis",
            value: merchandiseProductLabel(order.jenis_merchandise),
            mono: false,
          },
          ...(varian ? [{ label: "Varian", value: varian, mono: false }] : []),
          {
            label: "Jumlah",
            value: `${(order.jumlah ?? 0).toLocaleString("id-ID")} pcs`,
            mono: true,
          },
        ];
        return (
          <div
            className={`grid gap-3 ${items.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}
          >
            {items.map((it) => (
              <div
                key={it.label}
                className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-3"
              >
                <div className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1">
                  {it.label}
                </div>
                <div
                  className={`text-sm font-semibold text-zinc-900 dark:text-zinc-100 ${it.mono ? "font-mono tabular-nums" : ""}`}
                >
                  {it.value}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {order.catatan_pesanan?.trim() && (
        <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <div className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1">
            Catatan Tambahan
          </div>
          <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-words">
            {order.catatan_pesanan}
          </p>
        </div>
      )}
    </div>
  );
}
