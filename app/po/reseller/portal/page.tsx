"use client";

import { useDialog } from "@/app/components/ui/DialogProvider";
import React, { useEffect, useRef, useState, useCallback } from "react";
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
import PixelTrail from "@/app/components/po/PixelTrail";
import { usePOTabIdentity } from "@/hooks/usePOTabIdentity";

// ── Sub-components ───────────────────────────────────────────────
import { SuccessToast } from "@/app/po/reseller/portal/SuccessToast";
import { EditOrderModal } from "@/app/po/reseller/portal/EditOrderModal";
import { OrderCart } from "@/app/po/reseller/portal/OrderCart";
import { ProductMatrix } from "@/app/po/reseller/portal/ProductMatrix";
import { HistoryTab } from "@/app/po/reseller/portal/HistoryTab";

// Tinggi header (px) & seberapa "tertinggal" teks hero saat scroll (0 = ikut scroll normal)
const HEADER_H = 58;
const HERO_TEXT_LAG = 0.5;

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

  // Header transparan menyatu dengan hero; berubah putih setelah hero terlewati
  const [headerSolid, setHeaderSolid] = useState(false);
  const heroRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  // Judul & ikon tab = sama seperti katalog, ditambah "Reseller"
  usePOTabIdentity(setting);

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

  // Hero baru dirender setelah data selesai dimuat & PO aktif
  const heroReady = !loading && !!setting?.is_active;

  // Efek parallax hero: blok teks bergeser LEBIH LAMBAT dari scroll halaman (seperti
  // di katalog). Header transparan di atas hero, jadi putih setelah hero terlewati.
  // Transform ditulis langsung ke elemen (tanpa setState) supaya scroll tetap mulus.
  useEffect(() => {
    if (!heroReady) return;
    const hero = heroRef.current;
    const stage = stageRef.current;
    if (!hero || !stage) return;
    let raf = 0;

    const update = () => {
      raf = 0;
      const y = window.scrollY;
      const hh = hero.offsetHeight || 1;
      setHeaderSolid(y > hh - HEADER_H - 1);
      stage.style.transform = `translate3d(0, ${(Math.min(y, hh) * HERO_TEXT_LAG).toFixed(1)}px, 0)`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [heroReady]);

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
        {/* ── Header: transparan di atas hero, putih setelah hero terlewati ── */}
        <header
          className={`fixed top-0 inset-x-0 z-50 px-4 md:px-12 h-[58px] flex items-center justify-between border-b transition-[background-color,border-color,backdrop-filter] duration-300 ${
            headerSolid
              ? "bg-white/90 backdrop-blur-md border-[#e5e7eb]"
              : "bg-transparent border-transparent"
          }`}
        >
          <div
            className={`text-[15px] font-extrabold tracking-tight transition-colors duration-300 ${
              headerSolid ? "text-[#0e0e0e]" : "text-white"
            }`}
          >
            Portal Reseller
          </div>
          <div className="flex items-center gap-2.5">
            <div
              className={`hidden md:flex items-center gap-1.5 px-3 py-[5px] border rounded-full text-[12.5px] font-bold transition-colors duration-300 ${
                headerSolid
                  ? "bg-[#f5f5f4] border-[#e5e7eb] text-[#4b5563]"
                  : "bg-white/10 border-white/20 text-white/80"
              }`}
            >
              {reseller?.nama} ({reseller?.kode})
            </div>
            <button
              onClick={handleLogout}
              className={`flex items-center gap-1.5 px-3.5 py-[5px] bg-transparent border rounded-full text-[12.5px] font-semibold transition-colors ${
                headerSolid
                  ? "border-[#e5e7eb] text-[#9ca3af] hover:border-[#d1d5db] hover:text-[#0e0e0e]"
                  : "border-white/30 text-white/70 hover:border-white/60 hover:text-white"
              }`}
            >
              Keluar
            </button>
          </div>
        </header>

        {/* ── Hero (menyatu dengan header, tinggi secukupnya) ── */}
        <div
          ref={heroRef}
          className="bg-[#0e0e0e] text-white px-4 md:px-12 pt-[58px] min-h-[300px] md:min-h-[340px] flex items-center relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_30%,#1f2937_0%,transparent_52%),radial-gradient(circle_at_20%_80%,#111827_0%,transparent_45%)] opacity-80 pointer-events-none" />
          <PixelTrail water={false} ambientAlpha={0.2} />
          <div className="w-full relative z-10 py-8 md:py-10">
            <div
              ref={stageRef}
              className="max-w-[600px] mx-auto text-center will-change-transform"
            >
              <div className="inline-flex items-center justify-center gap-[7px] text-[11px] font-bold tracking-widest uppercase text-white/55 mb-3">
                <div className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
                Portal Reseller Aktif
              </div>
              <h1 className="text-[26px] md:text-4xl font-extrabold tracking-tight leading-[1.1] mb-3">
                Selamat datang,{" "}
                <em className="not-italic text-zinc-500">{reseller?.nama}</em>
              </h1>
              <p className="text-[13.6px] md:text-sm text-white/60 max-w-md mx-auto leading-relaxed">
                Input pesanan kapan saja — riwayat tersimpan otomatis di tab
                Riwayat.
              </p>
            </div>
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
