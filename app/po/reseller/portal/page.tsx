"use client";

import { useDialog } from "@/app/components/ui/DialogProvider";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getPOSettingBySlug,
  getPOProducts,
  submitOrder,
  getResellerOrders,
  deleteResellerOrder,
  updateResellerOrder,
  POResellerOrder,
} from "@/lib/po/supabase";
import { POSetting, POProduct, POReseller, CartItem } from "@/types/po";
import { calculateItemPrice, formatRupiah } from "@/lib/po/pricing";

// ── Sub-components ───────────────────────────────────────────────
import { SuccessToast } from "@/app/po/reseller/portal/SuccessToast";
import { EditOrderModal } from "@/app/po/reseller/portal/EditOrderModal";
import { OrderCart } from "@/app/po/reseller/portal/OrderCart";
import { ProductMatrix } from "@/app/po/reseller/portal/ProductMatrix";
import { HistoryTab } from "@/app/po/reseller/portal/HistoryTab";

// ── Helper ───────────────────────────────────────────────────────
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

// ── Main Page ────────────────────────────────────────────────────
export default function ResellerPortalPage() {
  const { notify, confirmAsync } = useDialog();
  const router = useRouter();

  // ── Core state ──────────────────────────────────────────────────
  const [slug, setSlug] = useState<string | null>(null);
  const [reseller, setReseller] = useState<POReseller | null>(null);
  const [setting, setSetting] = useState<POSetting | null>(null);
  const [products, setProducts] = useState<POProduct[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Tab ─────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"order" | "history">("order");

  // ── Order form ──────────────────────────────────────────────────
  const [selectedProductIdx, setSelectedProductIdx] = useState(-1);
  const [matrixData, setMatrixData] = useState<Record<string, number>>({});
  const [cart, setCart] = useState<CartItem[]>([]);
  const [catatan, setCatatan] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ── Edit & modal ─────────────────────────────────────────────────
  const [editingOrder, setEditingOrder] = useState<POResellerOrder | null>(
    null,
  );
  const [showEditModal, setShowEditModal] = useState(false);

  // ── Toast ────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{
    poNumber: string;
    waUrl: string;
  } | null>(null);

  // ── Riwayat ──────────────────────────────────────────────────────
  const [orders, setOrders] = useState<POResellerOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const katalogHref = slug ? `/po/${slug}` : "/po";

  // ── Load orders ──────────────────────────────────────────────────
  const loadOrders = useCallback(
    async (resellerId: string, poSettingId?: string) => {
      setLoadingOrders(true);
      const data = await getResellerOrders(resellerId, poSettingId);
      setOrders(data);
      setLoadingOrders(false);
    },
    [],
  );

  // ── Init ─────────────────────────────────────────────────────────
  useEffect(() => {
    const savedSlug = sessionStorage.getItem("po_slug");
    setSlug(savedSlug);

    const stored = sessionStorage.getItem("po_reseller");
    if (!stored) {
      router.replace(
        savedSlug ? `/po/reseller?slug=${savedSlug}` : "/po/reseller",
      );
      return;
    }

    const resellerData = JSON.parse(stored) as POReseller;
    setReseller(resellerData);

    async function load() {
      if (!savedSlug) {
        setLoading(false);
        return;
      }
      const s = await getPOSettingBySlug(savedSlug);
      if (!s) {
        setLoading(false);
        return;
      }
      const p = await getPOProducts(s.id);
      setSetting(s);
      setProducts(p);
      setLoading(false);
      if (resellerData?.id) loadOrders(resellerData.id, s.id);
    }
    load();
  }, [router, loadOrders]);

  useEffect(() => {
    if (activeTab === "history" && reseller?.id) {
      loadOrders(reseller.id, setting?.id);
    }
  }, [activeTab, reseller, setting, loadOrders]);

  // ── Handlers ──────────────────────────────────────────────────────
  const handleEditOrder = (order: POResellerOrder) => {
    setEditingOrder(order);
    setCart(
      order.order_items.map((item: any) => ({
        ...item,
        cart_id: crypto.randomUUID(),
      })) as CartItem[],
    );
    setCatatan(order.notes || "");
    setShowEditModal(true);
  };

  const cancelEdit = () => {
    setEditingOrder(null);
    setCart([]);
    setCatatan("");
    setShowEditModal(false);
  };

  const handleDeleteOrder = async (poNumber: string) => {
    if (!(await confirmAsync("Apakah Anda yakin ingin menghapus pesanan ini?")))
      return;
    if (!reseller) return;

    setLoadingOrders(true);
    const res = await deleteResellerOrder(poNumber, reseller.id);

    if (res?.success) {
      setOrders((prev) => prev.filter((o) => o.po_number !== poNumber));
    } else {
      notify("Gagal menghapus: " + (res?.error || "Unknown error"));
    }
    setLoadingOrders(false);
  };

  const tambahKeKeranjang = () => {
    const selectedProduct =
      selectedProductIdx >= 0 ? products[selectedProductIdx] : null;
    if (!selectedProduct) return;

    const pricingSettings = {
      sleeveSurcharge: setting!.sleeve_surcharge,
      xxlSurcharge: setting!.xxl_surcharge,
      sweaterXxlSurcharge: setting!.sweater_xxl_surcharge ?? 0,
    };
    const varianList = buildVarianList(selectedProduct);
    const newItems: CartItem[] = [];

    varianList.forEach((v, vi) => {
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
          newItems.push({
            cart_id: crypto.randomUUID(),
            product_id: selectedProduct.id,
            product_name: selectedProduct.name,
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
    setCart([...cart, ...newItems]);
    setSelectedProductIdx(-1);
    setMatrixData({});
  };

  const handleSubmit = async () => {
    if (cart.length === 0) {
      notify("Keranjang kosong.");
      return;
    }
    if (!reseller) return;
    setSubmitting(true);

    const payload = {
      customer_type: "RESELLER" as const,
      reseller_id: reseller.id,
      customer_name: reseller.nama,
      customer_wa: reseller.wa ?? "",
      delivery_method: "Dikirim" as const,
      notes: catatan,
      order_items: cart,
    };

    let result: any;

    if (editingOrder) {
      result = await updateResellerOrder(
        editingOrder.po_number,
        payload,
        setting!,
        products,
      );
    } else {
      result = await submitOrder(payload, setting!, products);
    }

    if (!result.success) {
      notify("Gagal memproses pesanan: " + result.error);
      setSubmitting(false);
      return;
    }

    // Build WA message
    const grandTotal = cart.reduce((s, i) => s + i.subtotal, 0);
    const daftarBarang = cart
      .map(
        (item, i) =>
          `${i + 1}. ${item.product_name} (${item.warna}, ${item.lengan}, ${item.ukuran}) — ${item.qty} pcs = ${formatRupiah(item.subtotal)}`,
      )
      .join("\n");

    const waText = [
      `Halo Admin, konfirmasi ${editingOrder ? "perubahan" : ""} pesanan reseller.`,
      ``,
      `*Kode PO:* ${editingOrder ? editingOrder.po_number : result.po_number}`,
      `*Reseller:* ${reseller.nama} (${reseller.kode})`,
      catatan ? `*Catatan:* ${catatan}` : "",
      ``,
      `*Pesanan:*`,
      daftarBarang,
      ``,
      `*Total: ${formatRupiah(grandTotal)}*`,
    ]
      .filter(Boolean)
      .join("\n");

    const phone = setting!.wa_admin_phone?.replace(/\D/g, "") || "";
    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(waText)}`;
    const finalPoNumber = editingOrder
      ? editingOrder.po_number
      : result.po_number!;

    // Reset semua state
    setEditingOrder(null);
    setShowEditModal(false);
    setCart([]);
    setCatatan("");
    setMatrixData({});
    setSelectedProductIdx(-1);
    setToast({ poNumber: finalPoNumber, waUrl });
    setSubmitting(false);

    loadOrders(reseller.id, setting?.id);
  };

  const handleLogout = async () => {
    const ok = await confirmAsync(
      "Yakin ingin keluar? Keranjang belum dikirim akan hilang.",
      { title: "Keluar" },
    );
    if (!ok) return;
    sessionStorage.removeItem("po_reseller");
    router.push(slug ? `/po/reseller?slug=${slug}` : "/po/reseller");
  };

  // ── Loading & guard ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f4] flex items-center justify-center text-[13.5px] font-semibold text-[#4b5563]">
        Memuat Portal...
      </div>
    );
  }

  if (!setting?.is_active) {
    return (
      <div className="min-h-screen bg-[#f5f5f4] flex items-center justify-center p-4">
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-8 text-center max-w-sm w-full">
          <h2 className="text-[18px] font-bold text-[#0e0e0e] mb-2">
            PO Sedang Tutup
          </h2>
          <p className="text-[13px] text-[#9ca3af]">
            Pemesanan tidak dapat dilakukan saat ini.
          </p>
        </div>
      </div>
    );
  }

  const tabCount = { order: cart.length, history: orders.length };

  // ── Render ────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up { animation: slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}</style>

      <div className="min-h-screen bg-[#f5f5f4] text-[#0e0e0e] font-sans pb-10">
        {/* ── Header ── */}
        <header className="bg-white border-b border-[#e5e7eb] px-4 md:px-12 h-[58px] flex items-center justify-between sticky top-0 z-50">
          <div className="text-[15px] font-extrabold tracking-tight">
            Portal Reseller
          </div>
          <div className="flex items-center gap-2.5">
            <div className="hidden md:flex items-center gap-1.5 px-3 py-[5px] bg-[#f5f5f4] border border-[#e5e7eb] rounded-full text-[12.5px] font-bold text-[#4b5563]">
              {reseller?.nama} ({reseller?.kode})
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3.5 py-[5px] bg-transparent border border-[#e5e7eb] rounded-full text-[12.5px] font-semibold text-[#9ca3af] hover:border-[#d1d5db] hover:text-[#0e0e0e] transition-colors"
            >
              Keluar
            </button>
          </div>
        </header>

        {/* ── Hero ── */}
        <div className="bg-[#0e0e0e] text-white px-4 py-7 md:py-11 md:px-12 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_50%,#1f2937_0%,transparent_55%)] pointer-events-none" />
          <div className="relative z-10 max-w-[600px] mx-auto md:mx-0">
            <div className="inline-flex items-center gap-[7px] text-[11px] font-bold tracking-widest uppercase text-white/50 mb-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
              Portal Reseller Aktif
            </div>
            <h1 className="text-[21px] md:text-[28px] font-extrabold tracking-tight leading-tight mb-1.5">
              Selamat datang,{" "}
              <em className="not-italic text-white/40">{reseller?.nama}</em>
            </h1>
            <p className="text-[13.6px] text-white/55">
              Input pesanan kapan saja — riwayat tersimpan otomatis di tab
              Riwayat.
            </p>
          </div>
        </div>

        {/* ── Tab Navigation ── */}
        <div className="bg-white border-b border-[#e5e7eb] px-4 md:px-12">
          <div className="max-w-[1200px] mx-auto flex gap-0">
            {(["order", "history"] as const).map((tab) => {
              const label =
                tab === "order" ? "Buat Pesanan" : "Riwayat Pesanan";
              const count = tabCount[tab];
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`relative flex items-center gap-[7px] px-1 py-4 mr-7 text-[13.5px] font-bold transition-colors ${
                    isActive
                      ? "text-[#0e0e0e]"
                      : "text-[#9ca3af] hover:text-[#4b5563]"
                  }`}
                >
                  {label}
                  {count > 0 && (
                    <span
                      className={`1.5[6px] py-px rounded-full text-[10.5px] font-bold ${
                        isActive
                          ? "bg-[#0e0e0e] text-white"
                          : "bg-[#f3f4f6] text-[#9ca3af]"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0e0e0e] rounded-t-full" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Tab: Buat Pesanan ── */}
        {activeTab === "order" && (
          <div className="max-w-[1200px] mx-auto p-5 md:py-9 md:px-12 grid grid-cols-1 md:grid-cols-[300px_1fr] gap-5 items-start">
            <OrderCart
              reseller={reseller}
              cart={cart}
              catatan={catatan}
              submitting={submitting}
              editingOrder={editingOrder}
              katalogHref={katalogHref}
              onCatatanChange={setCatatan}
              onRemoveItem={(id) =>
                setCart(cart.filter((c) => c.cart_id !== id))
              }
              onCancelEdit={cancelEdit}
              onSubmit={handleSubmit}
            />
            <ProductMatrix
              products={products}
              setting={setting!}
              selectedProductIdx={selectedProductIdx}
              matrixData={matrixData}
              onProductChange={(idx) => {
                setSelectedProductIdx(idx);
                setMatrixData({});
              }}
              onMatrixChange={(key, val) =>
                setMatrixData((prev) => ({ ...prev, [key]: val }))
              }
              onReset={() => setMatrixData({})}
              onAddToCart={tambahKeKeranjang}
            />
          </div>
        )}

        {/* ── Tab: Riwayat Pesanan ── */}
        {activeTab === "history" && (
          <div className="max-w-[780px] mx-auto p-5 md:py-9 md:px-12">
            <HistoryTab
              orders={orders}
              loadingOrders={loadingOrders}
              waPhone={setting?.wa_admin_phone ?? ""}
              onEdit={handleEditOrder}
              onDelete={handleDeleteOrder}
              onRefresh={() => reseller && loadOrders(reseller.id)}
              onGoToOrder={() => setActiveTab("order")}
            />
          </div>
        )}
      </div>

      {/* ── Toast ── */}
      {toast && (
        <SuccessToast
          poNumber={toast.poNumber}
          waUrl={toast.waUrl}
          onClose={() => setToast(null)}
        />
      )}

      {/* ── Modal Edit ── */}
      {showEditModal && editingOrder && (
        <EditOrderModal
          editingOrder={editingOrder}
          cart={cart}
          catatan={catatan}
          submitting={submitting}
          products={products}
          setting={setting!}
          onCatatanChange={setCatatan}
          onCartChange={setCart}
          onCancel={cancelEdit}
          onSave={handleSubmit}
        />
      )}
    </>
  );
}
