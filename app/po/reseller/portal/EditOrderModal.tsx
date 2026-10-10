"use client";

import { useDialog } from "@/app/components/ui/DialogProvider";
import { useState } from "react";
import { CartItem, POProduct, POSetting } from "@/types/po";
import { POResellerOrder } from "@/lib/po/supabase";
import { formatRupiah, calculateItemPrice } from "@/lib/po/pricing";
import { Trash2, Plus, ChevronDown, ChevronUp } from "lucide-react";

interface EditOrderModalProps {
  editingOrder: POResellerOrder;
  cart: CartItem[];
  catatan: string;
  submitting: boolean;
  products: POProduct[];
  setting: POSetting;
  onCatatanChange: (val: string) => void;
  onCartChange: (cart: CartItem[]) => void;
  onCancel: () => void;
  onSave: () => void;
}

function buildVarianList(p: POProduct) {
  const list: Array<{ kode: string; warna: string; lengan: string }> = [];
  let idx = 1;
  p.colors.forEach((w) => {
    p.sleeve_types.forEach((l) => {
      list.push({
        kode: `V-${String(idx).padStart(2, "0")}`,
        warna: w,
        lengan: l,
      });
      idx++;
    });
  });
  return list;
}

export function EditOrderModal({
  editingOrder,
  cart,
  catatan,
  submitting,
  products,
  setting,
  onCatatanChange,
  onCartChange,
  onCancel,
  onSave,
}: EditOrderModalProps) {
  const { notify } = useDialog();
  const total = cart.reduce((s, i) => s + i.subtotal, 0);

  // ── State untuk tambah item baru ─────────────────────────────────
  const [showAddItem, setShowAddItem] = useState(false);
  const [addProductIdx, setAddProductIdx] = useState(-1);
  const [addMatrix, setAddMatrix] = useState<Record<string, number>>({});

  const pricingSettings = {
    sleeveSurcharge: setting.sleeve_surcharge,
    xxlSurcharge: setting.xxl_surcharge,
    sweaterXxlSurcharge: setting.sweater_xxl_surcharge ?? 0,
  };

  const addProduct = addProductIdx >= 0 ? products[addProductIdx] : null;
  const addVarianList = addProduct ? buildVarianList(addProduct) : [];

  // ── Handlers item yang ada ────────────────────────────────────────
  function handleQtyChange(cartId: string, newQty: number) {
    if (newQty < 1) return;
    onCartChange(
      cart.map((item) =>
        item.cart_id === cartId
          ? { ...item, qty: newQty, subtotal: item.harga_satuan * newQty }
          : item,
      ),
    );
  }

  function handleRemoveItem(cartId: string) {
    onCartChange(cart.filter((item) => item.cart_id !== cartId));
  }

  // ── Handler tambah item baru ──────────────────────────────────────
  function hitungSubtotalBaris(vi: number) {
    if (!addProduct) return { total: 0, pcs: 0 };
    const v = addVarianList[vi];
    let total = 0,
      pcs = 0;
    addProduct.available_sizes.forEach((ukuran, ui) => {
      const qty = addMatrix[`${vi}_${ui}`] ?? 0;
      if (qty > 0) {
        const harga = calculateItemPrice(
          addProduct.base_price,
          ukuran,
          v.lengan,
          addProduct,
          pricingSettings,
        );
        total += harga * qty;
        pcs += qty;
      }
    });
    return { total, pcs };
  }

  function grandSubtotalTambah() {
    if (!addProduct) return { total: 0, pcs: 0 };
    let total = 0,
      pcs = 0;
    addVarianList.forEach((_, vi) => {
      const r = hitungSubtotalBaris(vi);
      total += r.total;
      pcs += r.pcs;
    });
    return { total, pcs };
  }

  function handleTambahItem() {
    if (!addProduct) return;
    const newItems: CartItem[] = [];

    addVarianList.forEach((v, vi) => {
      addProduct.available_sizes.forEach((ukuran, ui) => {
        const qty = addMatrix[`${vi}_${ui}`] ?? 0;
        if (qty > 0) {
          const harga = calculateItemPrice(
            addProduct.base_price,
            ukuran,
            v.lengan,
            addProduct,
            pricingSettings,
          );
          newItems.push({
            cart_id: crypto.randomUUID(),
            product_id: addProduct.id,
            product_name: addProduct.name,
            warna: v.warna,
            lengan: v.lengan,
            ukuran,
            qty,
            harga_satuan: harga,
            subtotal: harga * qty,
          });
        }
      });
    });

    if (newItems.length === 0) {
      notify("Isi QTY minimal satu sel.");
      return;
    }

    onCartChange([...cart, ...newItems]);
    setAddProductIdx(-1);
    setAddMatrix({});
    setShowAddItem(false);
  }

  const grandAdd = grandSubtotalTambah();

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onCancel}
      />

      {/* Panel */}
      <div className="relative bg-white w-full sm:max-w-[560px] rounded-t-[20px] sm:rounded-[16px] max-h-[92vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-[#e5e7eb] px-5 py-4 flex items-center justify-between z-10">
          <div>
            <div className="text-[14px] font-extrabold text-[#0e0e0e]">
              Edit Pesanan
            </div>
            <div className="text-[11.5px] text-[#9ca3af] font-mono mt-[2px]">
              {editingOrder.po_number}
            </div>
          </div>
          <button
            onClick={onCancel}
            className="w-[30px] h-[30px] rounded-full border border-[#e5e7eb] flex items-center justify-center text-[#9ca3af] hover:text-[#0e0e0e] hover:border-[#d1d5db] transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* ── Catatan ── */}
          <div>
            <label className="block text-[12px] font-bold text-[#4b5563] mb-[6px] uppercase tracking-[0.06em]">
              Catatan Pesanan
            </label>
            <textarea
              value={catatan}
              onChange={(e) => onCatatanChange(e.target.value)}
              rows={2}
              placeholder="Opsional: alamat atau instruksi khusus..."
              className="w-full px-[12px] py-[9px] border border-[#e5e7eb] rounded-[8px] text-[13.6px] text-[#111827] bg-[#f9fafb] outline-none focus:border-[#0e0e0e] focus:shadow-[0_0_0_3px_rgba(14,14,14,0.07)] transition-all resize-none"
            />
          </div>

          {/* ── Daftar Item ── */}
          <div>
            <label className="block text-[12px] font-bold text-[#4b5563] mb-[6px] uppercase tracking-[0.06em]">
              Item Pesanan
            </label>

            {cart.length === 0 ? (
              <div className="border border-dashed border-[#e5e7eb] rounded-[8px] py-6 text-center text-[13px] text-[#9ca3af]">
                Semua item dihapus. Tambah item baru atau batalkan.
              </div>
            ) : (
              <div className="border border-[#e5e7eb] rounded-[8px] overflow-hidden divide-y divide-[#f3f4f6]">
                {cart.map((item) => (
                  <div
                    key={item.cart_id}
                    className="px-4 py-3 flex items-center gap-3"
                  >
                    {/* Info produk */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-[#0e0e0e] truncate">
                        {item.product_name}
                      </div>
                      <div className="text-[11.5px] text-[#9ca3af] mt-[1px]">
                        {item.warna} · {item.lengan} · {item.ukuran}
                      </div>
                      <div className="text-[11px] text-[#9ca3af]">
                        @ {formatRupiah(item.harga_satuan)} / pcs
                      </div>
                    </div>

                    {/* QTY stepper */}
                    <div className="flex items-center gap-[5px] shrink-0">
                      <button
                        onClick={() =>
                          handleQtyChange(item.cart_id, item.qty - 1)
                        }
                        disabled={item.qty <= 1}
                        className="w-[26px] h-[26px] rounded-[6px] border border-[#e5e7eb] flex items-center justify-center text-[#4b5563] hover:border-[#d1d5db] hover:bg-[#f9fafb] disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-bold text-[14px]"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={1}
                        value={item.qty}
                        onChange={(e) =>
                          handleQtyChange(
                            item.cart_id,
                            Math.max(1, Number(e.target.value)),
                          )
                        }
                        className="w-[40px] text-center border border-[#e5e7eb] rounded-[6px] py-[3px] text-[13px] font-semibold text-[#111827] bg-[#f9fafb] outline-none focus:border-[#0e0e0e] transition-all"
                      />
                      <button
                        onClick={() =>
                          handleQtyChange(item.cart_id, item.qty + 1)
                        }
                        className="w-[26px] h-[26px] rounded-[6px] border border-[#e5e7eb] flex items-center justify-center text-[#4b5563] hover:border-[#d1d5db] hover:bg-[#f9fafb] transition-colors font-bold text-[14px]"
                      >
                        +
                      </button>
                    </div>

                    {/* Subtotal */}
                    <div className="text-right shrink-0 min-w-[68px]">
                      <div className="text-[12.5px] font-bold text-[#185fa5]">
                        {formatRupiah(item.subtotal)}
                      </div>
                    </div>

                    {/* Hapus */}
                    <button
                      onClick={() => handleRemoveItem(item.cart_id)}
                      className="w-[26px] h-[26px] rounded-[6px] border border-[#fee2e2] flex items-center justify-center text-[#dc2626] hover:bg-[#fef2f2] transition-colors shrink-0"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}

                {/* Total */}
                <div className="px-4 py-3 flex justify-between bg-[#f9fafb]">
                  <span className="text-[12px] font-bold text-[#9ca3af] uppercase tracking-[0.06em]">
                    Total
                  </span>
                  <span className="text-[15px] font-extrabold text-[#15803d]">
                    {formatRupiah(total)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ── Tambah Item Baru ── */}
          <div className="border border-[#e5e7eb] rounded-[10px] overflow-hidden">
            {/* Toggle header */}
            <button
              onClick={() => {
                setShowAddItem(!showAddItem);
                if (showAddItem) {
                  setAddProductIdx(-1);
                  setAddMatrix({});
                }
              }}
              className="w-full flex items-center justify-between px-4 py-3 bg-[#f9fafb] hover:bg-[#f3f4f6] transition-colors"
            >
              <div className="flex items-center gap-2 text-[13px] font-bold text-[#4b5563]">
                <Plus size={14} />
                Tambah Item Baru
              </div>
              {showAddItem ? (
                <ChevronUp size={14} className="text-[#9ca3af]" />
              ) : (
                <ChevronDown size={14} className="text-[#9ca3af]" />
              )}
            </button>

            {showAddItem && (
              <div className="p-4 flex flex-col gap-3 border-t border-[#e5e7eb]">
                {/* Pilih produk */}
                <div>
                  <label className="block text-[11.5px] font-bold text-[#9ca3af] mb-[5px] uppercase tracking-[0.06em]">
                    Pilih Produk
                  </label>
                  <select
                    value={addProductIdx}
                    onChange={(e) => {
                      setAddProductIdx(Number(e.target.value));
                      setAddMatrix({});
                    }}
                    className="w-full px-[12px] py-[9px] border border-[#e5e7eb] rounded-[8px] text-[13.6px] bg-white text-[#111827] bg-[#f9fafb] outline-none focus:border-[#0e0e0e] transition-all cursor-pointer"
                  >
                    <option value={-1}>-- Pilih produk --</option>
                    {products.map((p, i) => (
                      <option key={p.id} value={i}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tabel varian */}
                {addProduct && addVarianList.length > 0 && (
                  <div className="border border-[#e5e7eb] rounded-[8px] overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-[12.5px]">
                        <thead>
                          <tr>
                            <th className="px-[10px] py-[7px] text-left text-[10.5px] font-bold uppercase text-[#9ca3af] bg-[#f5f5f4] border-b border-[#e5e7eb] whitespace-nowrap">
                              Varian
                            </th>
                            {addProduct.available_sizes.map((u) => (
                              <th
                                key={u}
                                className="px-[5px] py-[7px] text-center text-[10.5px] font-bold uppercase text-[#9ca3af] bg-[#f5f5f4] border-b border-[#e5e7eb]"
                              >
                                {u}
                              </th>
                            ))}
                            <th className="px-[5px] py-[7px] text-center text-[10.5px] font-bold uppercase text-[#9ca3af] bg-[#f5f5f4] border-b border-[#e5e7eb] min-w-[70px]">
                              Sub
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {addVarianList.map((v, vi) => {
                            const rowSub = hitungSubtotalBaris(vi);
                            const isPanjang = v.lengan
                              .toLowerCase()
                              .includes("panjang");
                            const chipColor = isPanjang
                              ? "bg-[#faeeda] text-[#633806] border-[#ef9f27]"
                              : "bg-[#e6f1fb] text-[#185fa5] border-[#85b7eb]";

                            return (
                              <tr key={vi} className="even:bg-[#f9fafb]">
                                <td className="px-[10px] py-[5px] border-b border-[#e5e7eb] align-middle">
                                  <div className="text-[11px] font-semibold text-[#4b5563]">
                                    {v.warna}
                                  </div>
                                  <span
                                    className={`inline-flex items-center px-[5px] py-[1px] border rounded-full text-[9.5px] font-semibold ${chipColor}`}
                                  >
                                    {v.lengan}
                                  </span>
                                </td>
                                {addProduct.available_sizes.map((_, ui) => {
                                  const val = addMatrix[`${vi}_${ui}`] || "";
                                  const hasVal = Number(val) > 0;
                                  return (
                                    <td
                                      key={ui}
                                      className="px-[3px] py-[5px] border-b border-[#e5e7eb] align-middle text-center"
                                    >
                                      <input
                                        type="number"
                                        min="0"
                                        value={val}
                                        onChange={(e) => {
                                          const parsed = Math.max(
                                            0,
                                            Number(e.target.value),
                                          );
                                          setAddMatrix((prev) => ({
                                            ...prev,
                                            [`${vi}_${ui}`]: parsed,
                                          }));
                                        }}
                                        className={`w-[44px] text-center border rounded-[5px] py-[4px] px-[2px] text-[12.5px] font-semibold outline-none focus:border-[#0e0e0e] transition-all ${
                                          hasVal
                                            ? "bg-[#e6f1fb] border-[#85b7eb] text-[#185fa5]"
                                            : "bg-white border-[#e5e7eb]"
                                        }`}
                                      />
                                    </td>
                                  );
                                })}
                                <td className="px-[3px] py-[5px] border-b border-[#e5e7eb] align-middle text-center">
                                  {rowSub.pcs > 0 ? (
                                    <div className="text-[10.5px] font-bold text-[#185fa5] whitespace-nowrap">
                                      {rowSub.pcs}x<br />
                                      {formatRupiah(rowSub.total)}
                                    </div>
                                  ) : (
                                    <span className="text-[#d1d5db]">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Footer tabel */}
                    <div className="px-3 py-2.5 border-t border-[#e5e7eb] bg-white flex items-center justify-between gap-3">
                      <div className="text-[12px] text-[#4b5563]">
                        <strong className="text-[#185fa5]">
                          {formatRupiah(grandAdd.total)}
                        </strong>
                        <span className="text-[#9ca3af] ml-1">
                          ({grandAdd.pcs} pcs)
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setAddMatrix({})}
                          className="px-[10px] py-[6px] border border-[#e5e7eb] text-[#4b5563] rounded-[6px] text-[12px] font-semibold hover:border-[#d1d5db] transition-colors"
                        >
                          Reset
                        </button>
                        <button
                          onClick={handleTambahItem}
                          className="px-[12px] py-[6px] bg-[#0e0e0e] text-white rounded-[6px] text-[12px] font-bold hover:opacity-80 transition-opacity"
                        >
                          Tambah ke Pesanan
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Tombol Aksi ── */}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 bg-white border border-[#e5e7eb] text-[#4b5563] py-[11px] rounded-[8px] text-[13.6px] font-bold hover:border-[#d1d5db] transition-colors"
            >
              Batal
            </button>
            <button
              onClick={onSave}
              disabled={submitting || cart.length === 0}
              className="flex-1 bg-[#0e0e0e] text-white py-[11px] rounded-[8px] text-[13.6px] font-bold hover:opacity-80 transition-opacity disabled:opacity-40"
            >
              {submitting ? "Menyimpan..." : "Simpan Perubahan"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
