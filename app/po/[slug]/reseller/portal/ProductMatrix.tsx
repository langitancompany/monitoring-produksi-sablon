"use client";

import { POProduct, POSetting } from "@/types/po";
import { calculateItemPrice, formatRupiah } from "@/lib/po/pricing";

interface ProductMatrixProps {
  products: POProduct[];
  setting: POSetting;
  selectedProductIdx: number;
  matrixData: Record<string, number>;
  onProductChange: (idx: number) => void;
  onMatrixChange: (key: string, val: number) => void;
  onReset: () => void;
  onAddToCart: () => void;
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

export function ProductMatrix({
  products,
  setting,
  selectedProductIdx,
  matrixData,
  onProductChange,
  onMatrixChange,
  onReset,
  onAddToCart,
}: ProductMatrixProps) {
  const selectedProduct =
    selectedProductIdx >= 0 ? products[selectedProductIdx] : null;
  const pricingSettings = {
    sleeveSurcharge: setting.sleeve_surcharge,
    xxlSurcharge: setting.xxl_surcharge,
    sweaterXxlSurcharge: setting.sweater_xxl_surcharge ?? 0,
  };

  function hitungSubtotalBaris(vi: number) {
    if (!selectedProduct) return { total: 0, pcs: 0 };
    const varianList = buildVarianList(selectedProduct);
    const v = varianList[vi];
    let total = 0,
      pcs = 0;
    selectedProduct.available_sizes.forEach((ukuran, ui) => {
      const qty = matrixData[`${vi}_${ui}`] ?? 0;
      if (qty > 0) {
        const harga = calculateItemPrice(
          selectedProduct.base_price,
          ukuran,
          v.lengan,
          selectedProduct,
          pricingSettings,
        );
        total += harga * qty;
        pcs += qty;
      }
    });
    return { total, pcs };
  }

  function hitungGrandSubtotal() {
    if (!selectedProduct) return { total: 0, pcs: 0 };
    const varianList = buildVarianList(selectedProduct);
    let total = 0,
      pcs = 0;
    varianList.forEach((_, vi) => {
      const row = hitungSubtotalBaris(vi);
      total += row.total;
      pcs += row.pcs;
    });
    return { total, pcs };
  }

  const varianList = selectedProduct ? buildVarianList(selectedProduct) : [];
  const grandSubtot = hitungGrandSubtotal();

  return (
    <div className="flex flex-col gap-[16px]">
      {/* Picker Produk */}
      <div className="bg-white border border-[#e5e7eb] rounded-[12px] p-[14px] md:p-[20px]">
        <div className="text-[11px] font-bold tracking-[0.1em] uppercase text-[#9ca3af] mb-[14px]">
          Pilih Produk
        </div>
        <select
          value={selectedProductIdx}
          onChange={(e) => onProductChange(Number(e.target.value))}
          className="w-full px-[12px] py-[9px] border border-[#e5e7eb] rounded-[8px] text-[13.6px] text-[#0e0e0e] bg-white outline-none focus:border-[#0e0e0e] focus:shadow-[0_0_0_3px_rgba(14,14,14,0.07)] transition-all cursor-pointer"
        >
          <option value={-1}>-- Pilih produk --</option>
          {products.map((p, i) => (
            <option key={p.id} value={i}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Tabel Varian */}
      {selectedProduct && varianList.length > 0 && (
        <div className="bg-white border border-[#e5e7eb] rounded-[12px] overflow-hidden">
          <div className="p-[14px] md:p-[20px] pb-0 border-b border-[#e5e7eb]">
            <div className="text-[11px] font-bold tracking-[0.1em] uppercase text-[#9ca3af] mb-[14px]">
              Input QTY per Kode Varian
            </div>
            <div className="flex items-start gap-[9px] bg-[#e6f1fb] border border-[#85b7eb] rounded-[8px] p-[11px_14px] text-[13.1px] font-semibold text-[#185fa5] leading-snug mb-[14px]">
              Setiap baris = 1 kombinasi Warna + Lengan. Isi QTY pada kolom
              ukuran. Biarkan 0 jika tidak dipesan.
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13.1px]">
              <thead>
                <tr>
                  <th className="px-[12px] py-[8px] text-left text-[11px] font-bold tracking-[0.05em] uppercase text-[#9ca3af] bg-[#f5f5f4] border-b border-[#e5e7eb] whitespace-nowrap min-w-[100px]">
                    Kode Varian
                  </th>
                  {selectedProduct.available_sizes.map((u) => (
                    <th
                      key={u}
                      className="px-[6px] py-[8px] text-center text-[11px] font-bold tracking-[0.05em] uppercase text-[#9ca3af] bg-[#f5f5f4] border-b border-[#e5e7eb]"
                    >
                      {u}
                    </th>
                  ))}
                  <th className="px-[6px] py-[8px] text-center text-[11px] font-bold tracking-[0.05em] uppercase text-[#9ca3af] bg-[#f5f5f4] border-b border-[#e5e7eb] min-w-[90px]">
                    Subtotal
                  </th>
                </tr>
              </thead>
              <tbody>
                {varianList.map((v, vi) => {
                  const rowSub = hitungSubtotalBaris(vi);
                  const isPanjang = v.lengan.toLowerCase().includes("panjang");
                  const chipColor = isPanjang
                    ? "bg-[#faeeda] text-[#633806] border-[#ef9f27]"
                    : "bg-[#e6f1fb] text-[#185fa5] border-[#85b7eb]";

                  return (
                    <tr key={vi} className="even:bg-[#f5f5f4]">
                      <td className="px-[12px] py-[6px] border-b border-[#e5e7eb] align-middle text-left">
                        <span className="inline-flex items-center px-[8px] py-[2px] bg-[#f5f5f4] text-[#4b5563] border border-[#e5e7eb] rounded-[6px] text-[11.2px] font-bold font-mono tracking-[0.04em]">
                          {v.kode}
                        </span>
                        <br />
                        <span className="text-[11.5px] font-semibold text-[#4b5563]">
                          {v.warna}
                        </span>{" "}
                        <span
                          className={`inline-flex items-center px-[6px] py-[1px] border rounded-full text-[10.4px] font-semibold ${chipColor}`}
                        >
                          {v.lengan}
                        </span>
                      </td>
                      {selectedProduct.available_sizes.map((_, ui) => {
                        const val = matrixData[`${vi}_${ui}`] || "";
                        const hasVal = Number(val) > 0;
                        return (
                          <td
                            key={ui}
                            className="px-[4px] py-[6px] border-b border-[#e5e7eb] align-middle text-center"
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
                                onMatrixChange(`${vi}_${ui}`, parsed);
                              }}
                              className={`w-[52px] text-center border rounded-[6px] py-[5px] px-[2px] text-[13.6px] font-semibold outline-none focus:border-[#0e0e0e] focus:shadow-[0_0_0_2px_rgba(14,14,14,0.07)] transition-all ${
                                hasVal
                                  ? "bg-[#e6f1fb] border-[#85b7eb] text-[#185fa5]"
                                  : "bg-white border-[#e5e7eb] text-[#0e0e0e]"
                              }`}
                            />
                          </td>
                        );
                      })}
                      <td className="px-[4px] py-[6px] border-b border-[#e5e7eb] align-middle text-center">
                        {rowSub.pcs > 0 ? (
                          <>
                            <div className="text-[13.6px]">
                              {rowSub.pcs} pcs
                            </div>
                            <div className="text-[11.5px] font-bold text-[#185fa5] whitespace-nowrap">
                              {formatRupiah(rowSub.total)}
                            </div>
                          </>
                        ) : (
                          <span className="text-[12.8px] font-bold text-[#185fa5]">
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer Tabel */}
          <div className="p-[12px_14px] border-t border-[#e5e7eb] bg-white flex flex-wrap items-center justify-between gap-[12px]">
            <div className="text-[13.1px] text-[#4b5563] flex items-baseline gap-[8px]">
              <span>Subtotal:</span>
              <strong className="text-[16px] text-[#185fa5]">
                {formatRupiah(grandSubtot.total)}
              </strong>
              <span className="text-[12px] text-[#9ca3af]">
                {grandSubtot.pcs} pcs
              </span>
            </div>
            <div className="flex gap-[8px]">
              <button
                onClick={onReset}
                className="bg-transparent border border-[#e5e7eb] text-[#4b5563] px-[14px] py-[10px] rounded-[8px] text-[13.6px] font-semibold hover:border-[#d1d5db] hover:text-[#0e0e0e] transition-colors"
              >
                Reset
              </button>
              <button
                onClick={onAddToCart}
                className="bg-[#0e0e0e] text-white px-[18px] py-[10px] rounded-[8px] text-[13.6px] font-bold hover:opacity-80 transition-opacity"
              >
                Tambah ke Keranjang
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
