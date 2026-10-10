// app/components/po/POOrderEditForm.tsx
"use client";

import { useDialog } from "@/app/components/ui/DialogProvider";
import { useState } from "react";
import { updatePOOrderFull } from "@/lib/po/admin";
import { calculateItemPrice, formatRupiah } from "@/lib/po/pricing";
import { POOrder, POOrderItem, POProduct, POSetting } from "@/types/po";
import { ArrowLeft, Plus, Trash2, Save, X } from "lucide-react";

const inputCls =
  "w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2.5 text-sm text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 hover:border-[#49bfb4]/50 focus:ring-2 focus:ring-[#49bfb4] focus:border-[#49bfb4] outline-none transition-colors duration-150";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 block mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

/* ── Baris untuk menambah item baru, pilih dari produk aktif ───── */
function AddItemRow({
  products,
  setting,
  onAdd,
  onCancel,
}: {
  products: POProduct[];
  setting: POSetting;
  onAdd: (item: POOrderItem) => void;
  onCancel: () => void;
}) {
  const { notify } = useDialog();
  const [productId, setProductId] = useState("");
  const [ukuran, setUkuran] = useState("");
  const [lengan, setLengan] = useState("");
  const [warna, setWarna] = useState("");
  const [qty, setQty] = useState(1);

  const product = products.find((p) => p.id === productId);

  const pricingSettings = {
    sleeveSurcharge: setting.sleeve_surcharge ?? 0,
    xxlSurcharge: setting.xxl_surcharge ?? 0,
    sweaterXxlSurcharge: setting.sweater_xxl_surcharge ?? 0,
  };

  const hargaSatuan = product
    ? calculateItemPrice(
        product.base_price,
        ukuran || "-",
        lengan || "-",
        product,
        pricingSettings,
      )
    : 0;
  const subtotal = hargaSatuan * qty;

  function handleProductChange(id: string) {
    setProductId(id);
    setUkuran("");
    setLengan("");
    setWarna("");
  }

  function handleAdd() {
    if (!product) {
      notify("Pilih produk terlebih dahulu.");
      return;
    }
    if (product.available_sizes.length > 0 && !ukuran) {
      notify("Pilih ukuran terlebih dahulu.");
      return;
    }
    if (product.sleeve_types.length > 0 && !lengan) {
      notify("Pilih jenis lengan terlebih dahulu.");
      return;
    }
    if (product.colors.length > 0 && !warna) {
      notify("Pilih warna terlebih dahulu.");
      return;
    }
    if (qty <= 0) {
      notify("Qty harus lebih dari 0.");
      return;
    }

    onAdd({
      product_id: product.id,
      product_name: product.name,
      ukuran: ukuran || "-",
      lengan: lengan || "-",
      warna: warna || "-",
      qty,
      harga_satuan: hargaSatuan,
      subtotal,
    });
  }

  return (
    <div className="border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl p-4 space-y-3 bg-zinc-50 dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
          Tambah Item Baru
        </p>
        <button
          onClick={onCancel}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors duration-150"
        >
          <X size={16} />
        </button>
      </div>

      <Field label="Produk">
        <select
          value={productId}
          onChange={(e) => handleProductChange(e.target.value)}
          className={inputCls}
        >
          <option value="">— Pilih Produk —</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({formatRupiah(p.base_price)})
            </option>
          ))}
        </select>
      </Field>

      {product && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {product.available_sizes.length > 0 && (
            <Field label="Ukuran">
              <select
                value={ukuran}
                onChange={(e) => setUkuran(e.target.value)}
                className={inputCls}
              >
                <option value="">—</option>
                {product.available_sizes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {product.sleeve_types.length > 0 && (
            <Field label="Lengan">
              <select
                value={lengan}
                onChange={(e) => setLengan(e.target.value)}
                className={inputCls}
              >
                <option value="">—</option>
                {product.sleeve_types.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {product.colors.length > 0 && (
            <Field label="Warna">
              <select
                value={warna}
                onChange={(e) => setWarna(e.target.value)}
                className={inputCls}
              >
                <option value="">—</option>
                {product.colors.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Qty">
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
              className={inputCls}
            />
          </Field>
        </div>
      )}

      {product && (
        <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800">
          <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            Subtotal item ini
          </span>
          <span className="font-mono tabular-nums text-sm font-semibold text-[#49bfb4]">
            {formatRupiah(subtotal)}
          </span>
        </div>
      )}

      <button
        onClick={handleAdd}
        disabled={!product}
        className="w-full bg-[#124540] hover:bg-[#0d332f] disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white text-sm font-semibold py-2.5 rounded-md transition-colors duration-150"
      >
        Tambahkan ke Pesanan
      </button>
    </div>
  );
}

export default function POOrderEditForm({
  order,
  products,
  setting,
  onCancel,
  onSaved,
}: {
  order: POOrder;
  products: POProduct[];
  setting: POSetting;
  onCancel: () => void;
  onSaved: (updated: POOrder) => void;
}) {
  const { notify } = useDialog();
  const [customerName, setCustomerName] = useState(order.customer_name);
  const [customerWa, setCustomerWa] = useState(order.customer_wa);
  const [deliveryMethod, setDeliveryMethod] = useState<"Diambil" | "Dikirim">(
    order.delivery_method,
  );
  const [shippingAddress, setShippingAddress] = useState(
    order.shipping_address || "",
  );
  const [notes, setNotes] = useState(order.notes || "");
  const [items, setItems] = useState<POOrderItem[]>([...order.order_items]);
  const [showAddRow, setShowAddRow] = useState(false);
  const [saving, setSaving] = useState(false);

  const activeProducts = products.filter((p) => p.is_active);
  const grandTotal = items.reduce((sum, i) => sum + i.subtotal, 0);

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateItemQty(index: number, qty: number) {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? { ...item, qty, subtotal: item.harga_satuan * qty }
          : item,
      ),
    );
  }

  function handleAddItem(newItem: POOrderItem) {
    setItems((prev) => [...prev, newItem]);
    setShowAddRow(false);
  }

  async function handleSave() {
    if (!customerName.trim() || !customerWa.trim()) {
      notify("Nama dan WhatsApp pemesan wajib diisi.");
      return;
    }
    if (deliveryMethod === "Dikirim" && !shippingAddress.trim()) {
      notify("Alamat pengiriman wajib diisi untuk metode Dikirim.");
      return;
    }
    if (items.length === 0) {
      notify("Pesanan harus memiliki minimal 1 item.");
      return;
    }

    setSaving(true);
    const result = await updatePOOrderFull(order.id, {
      customer_name: customerName.trim(),
      customer_wa: customerWa.trim(),
      delivery_method: deliveryMethod,
      shipping_address:
        deliveryMethod === "Dikirim" ? shippingAddress.trim() : null,
      notes: notes.trim() || null,
      order_items: items,
      total_amount: grandTotal,
    });
    setSaving(false);

    if (!result.success) {
      notify("Gagal menyimpan perubahan: " + result.error);
      return;
    }

    onSaved({
      ...order,
      customer_name: customerName.trim(),
      customer_wa: customerWa.trim(),
      delivery_method: deliveryMethod,
      shipping_address:
        deliveryMethod === "Dikirim" ? shippingAddress.trim() : null,
      notes: notes.trim() || null,
      order_items: items,
      total_amount: grandTotal,
    });
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-5">
      <button
        onClick={onCancel}
        className="flex items-center gap-2 text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-white transition-colors duration-150"
      >
        <ArrowLeft size={15} /> Batal, kembali ke detail
      </button>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500 mb-1">
          Edit Pesanan
        </p>
        <h2 className="text-xl md:text-2xl font-semibold text-zinc-900 dark:text-white font-mono tabular-nums">
          {order.po_number}
        </h2>
      </div>

      {/* Biodata */}
      <div className="space-y-4 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 md:p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
          Data Pemesan
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nama Lengkap">
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="No. WhatsApp">
            <input
              type="text"
              value={customerWa}
              onChange={(e) => setCustomerWa(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="Metode Pengambilan">
          <select
            value={deliveryMethod}
            onChange={(e) =>
              setDeliveryMethod(e.target.value as "Diambil" | "Dikirim")
            }
            className={inputCls}
          >
            <option value="Diambil">Diambil di Tempat</option>
            <option value="Dikirim">Dikirim ke Alamat</option>
          </select>
        </Field>

        {deliveryMethod === "Dikirim" && (
          <Field label="Alamat Lengkap Pengiriman">
            <textarea
              value={shippingAddress}
              onChange={(e) => setShippingAddress(e.target.value)}
              rows={3}
              className={`${inputCls} resize-y`}
            />
          </Field>
        )}

        <Field label="Catatan">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Catatan tambahan (opsional)"
            className={`${inputCls} resize-y`}
          />
        </Field>
      </div>

      {/* Items */}
      <div className="space-y-3 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 md:p-5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
            Item Pesanan
          </p>
          {!showAddRow && (
            <button
              onClick={() => setShowAddRow(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-[#49bfb4] hover:underline transition-colors duration-150"
            >
              <Plus size={14} /> Tambah Item
            </button>
          )}
        </div>

        {items.length === 0 && (
          <p className="text-sm text-zinc-400 text-center py-4">
            Belum ada item. Tambahkan minimal 1 item.
          </p>
        )}

        <div className="space-y-2">
          {items.map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-zinc-800 dark:text-zinc-200 truncate">
                  {item.product_name}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {item.ukuran} · {item.lengan} · {item.warna} ·{" "}
                  <span className="font-mono tabular-nums">
                    {formatRupiah(item.harga_satuan)}
                  </span>
                  /pcs
                </p>
              </div>
              <input
                type="number"
                min={1}
                value={item.qty}
                onChange={(e) =>
                  updateItemQty(i, Math.max(1, Number(e.target.value)))
                }
                className="w-16 text-sm text-center font-mono tabular-nums bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-md px-2 py-1.5 hover:border-[#49bfb4]/50 focus:ring-2 focus:ring-[#49bfb4] focus:border-[#49bfb4] outline-none transition-colors duration-150"
              />
              <span className="font-mono tabular-nums text-sm font-semibold text-zinc-800 dark:text-zinc-200 w-28 text-right">
                {formatRupiah(item.subtotal)}
              </span>
              <button
                onClick={() => removeItem(i)}
                className="text-red-500/70 hover:text-red-600 dark:hover:text-red-500 shrink-0 transition-colors duration-150"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>

        {showAddRow && (
          <AddItemRow
            products={activeProducts}
            setting={setting}
            onAdd={handleAddItem}
            onCancel={() => setShowAddRow(false)}
          />
        )}

        <div className="flex justify-between items-center pt-3 border-t border-zinc-200 dark:border-zinc-800">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Total Keseluruhan
          </span>
          <span className="font-mono tabular-nums text-lg font-semibold text-emerald-600 dark:text-emerald-500">
            {formatRupiah(grandTotal)}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={onCancel}
          className="w-full sm:w-auto px-6 py-3 border border-zinc-300 dark:border-zinc-700 rounded-md text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150"
        >
          Batal
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full sm:flex-1 flex items-center justify-center gap-2 bg-[#124540] hover:bg-[#0d332f] disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white py-3 rounded-md text-sm font-semibold transition-colors duration-150"
        >
          {saving ? (
            <>
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              Menyimpan...
            </>
          ) : (
            <>
              <Save size={16} /> Simpan Perubahan
            </>
          )}
        </button>
      </div>
    </div>
  );
}
