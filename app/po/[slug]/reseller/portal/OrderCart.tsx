"use client";

import { AlertTriangle } from "lucide-react";
import { CartItem } from "@/types/po";
import { POReseller } from "@/types/po";
import { POResellerOrder } from "@/lib/po/supabase";
import { formatRupiah } from "@/lib/po/pricing";

interface OrderCartProps {
  reseller: POReseller | null;
  cart: CartItem[];
  catatan: string;
  submitting: boolean;
  editingOrder: POResellerOrder | null;
  katalogHref: string;
  onCatatanChange: (val: string) => void;
  onRemoveItem: (cartId: string) => void;
  onCancelEdit: () => void;
  onSubmit: () => void;
}

export function OrderCart({
  reseller,
  cart,
  catatan,
  submitting,
  editingOrder,
  katalogHref,
  onCatatanChange,
  onRemoveItem,
  onCancelEdit,
  onSubmit,
}: OrderCartProps) {
  const cartTotal = cart.reduce((s, i) => s + i.subtotal, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Banner Mode Edit */}
      {editingOrder && (
        <div className="bg-[#fefce8] border border-[#fef08a] rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="text-[#ca8a04] w-5 h-5 shrink-0" />
            <div>
              <div className="text-[13px] font-bold text-[#854d0e]">
                Mode Edit Pesanan
              </div>
              <div className="text-[12px] text-[#a16207] leading-relaxed mt-0.5">
                Sedang mengubah PO: <strong>{editingOrder.po_number}</strong>
              </div>
            </div>
          </div>
          <button
            onClick={onCancelEdit}
            className="bg-white border border-[#fef08a] text-[#a16207] text-[12px] font-bold py-1.5 rounded-md hover:bg-[#fef08a] transition-colors"
          >
            Batal Edit & Buat Pesanan Baru
          </button>
        </div>
      )}

      {/* Info Reseller */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl p-3.5 md:p-5">
        <div className="text-[11px] font-bold tracking-widest uppercase text-[#9ca3af] mb-3.5">
          Info Reseller
        </div>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-[#e1f5ee] flex items-center justify-center text-[#085041] font-bold text-[14px]">
            {reseller?.nama.charAt(0)}
          </div>
          <div>
            <p className="text-[14.4px] font-bold m-0 leading-tight">
              {reseller?.nama}
            </p>
            <p className="text-[11.8px] text-[#9ca3af] m-0">{reseller?.kode}</p>
          </div>
          <span className="ml-auto bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0] px-[9px] py-0.5 rounded-full text-[11.5px] font-semibold">
            Aktif
          </span>
        </div>
      </div>

      {/* Catatan Pengiriman */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl p-3.5 md:p-5">
        <div className="text-[11px] font-bold tracking-widest uppercase text-[#9ca3af] mb-3.5">
          Catatan Pesanan
        </div>
        <textarea
          value={catatan}
          onChange={(e) => onCatatanChange(e.target.value)}
          rows={3}
          placeholder="Opsional: alamat atau instruksi khusus..."
          className="w-full px-3 py-[9px] border border-[#e5e7eb] rounded-lg text-[13.6px] text-[#0e0e0e] outline-none focus:border-[#0e0e0e] focus:shadow-[0_0_0_3px_rgba(14,14,14,0.07)] transition-all resize-none bg-white"
        />
      </div>

      {/* Keranjang */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl p-3.5 5[20px]">
        <div className="text-[11px] font-bold tracking-widest uppercase text-[#9ca3af] mb-3.5">
          Keranjang Pesanan
        </div>
        {cart.length === 0 ? (
          <div className="text-center py-6 px-4 text-[#9ca3af] text-[13.4px]">
            Belum ada item. Tambahkan dari panel kanan.
          </div>
        ) : (
          <div>
            {cart.map((item) => (
              <div
                key={item.cart_id}
                className="py-3 border-b border-[#e5e7eb] relative last:border-0"
              >
                <div className="text-[14px] font-bold text-[#0e0e0e] mb-[3px] pr-[30px]">
                  {item.product_name}
                </div>
                <div className="text-[11.8px] text-[#9ca3af] mb-1">
                  <span className="font-semibold text-[#4b5563]">
                    {item.warna}
                  </span>{" "}
                  · {item.lengan} · {item.ukuran}
                </div>
                <div className="text-[13px] text-[#4b5563]">
                  {item.qty} pcs ={" "}
                  <strong className="text-[#185fa5]">
                    {formatRupiah(item.subtotal)}
                  </strong>
                </div>
                <button
                  onClick={() => onRemoveItem(item.cart_id)}
                  className="absolute top-3 right-0 w-[26px] h-[26px] rounded-full border border-[#e5e7eb] flex items-center justify-center text-[#9ca3af] hover:border-[#fca5a5] hover:text-[#dc2626] hover:bg-[#fef2f2] transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
            <div className="flex justify-between items-center pt-3 mt-2 border-t border-[#e5e7eb]">
              <span className="text-[12px] font-bold text-[#9ca3af] uppercase tracking-[0.06em]">
                Total Bayar
              </span>
              <span className="text-[17.6px] font-extrabold text-[#15803d]">
                {formatRupiah(cartTotal)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Submit */}
      <button
        onClick={onSubmit}
        disabled={submitting || cart.length === 0}
        className="w-full bg-[#0e0e0e] text-white py-[13px] px-5 rounded-lg text-[14.4px] font-bold flex justify-center items-center gap-2 hover:opacity-80 transition-opacity disabled:opacity-40"
      >
        {submitting
          ? "Memproses..."
          : editingOrder
            ? "Simpan Perubahan"
            : "Kirim Semua Pesanan"}
      </button>
    </div>
  );
}
