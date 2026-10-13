"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  getPOSettingAdmin,
  getAllPOProducts,
  getPOSettingBySlug,
} from "@/lib/po/admin";
import { formatRupiah, calculateItemPrice } from "@/lib/po/pricing";
import { thumbUrl, fallbackToOriginal } from "@/lib/po/images";
import { getStoreInfo } from "@/lib/po/store-info";
import PixelTrail from "@/app/components/po/PixelTrail";
import { POSetting, POProduct } from "@/types/po";
import {
  Package,
  CalendarDays,
  Users,
  ArrowRight,
  LayoutGrid,
  Pencil,
  CheckCircle2,
  XCircle,
  Clock,
  Shirt,
  Camera,
  Eye,
  ChevronLeft,
  ChevronRight,
  X,
  ShoppingCart,
  Plus,
  Minus,
  Check,
  Baby,
  PersonStanding,
  MapPin,
  MessageCircle,
  ArrowUp,
} from "lucide-react";

// ── Tipe keranjang yang disimpan di sessionStorage ──
export type CartItemSession = {
  cart_id: string;
  product_id: string;
  product_name: string;
  warna: string;
  lengan: string;
  ukuran: string;
  qty: number;
  harga_satuan: number;
  subtotal: number;
};

type CategoryFilter = "dewasa" | "kids";

const CART_KEY = "po_cart";

// Tinggi header (px) — dipakai untuk menentukan kapan header berubah jadi putih
const HEADER_H = 60;

// Seberapa "tertinggal" teks hero saat scroll (0 = ikut scroll normal, 0.5 = bergeser separuh kecepatan)
const HERO_TEXT_LAG = 0.2;

function loadCart(): CartItemSession[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(sessionStorage.getItem(CART_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveCart(items: CartItemSession[]) {
  sessionStorage.setItem(CART_KEY, JSON.stringify(items));
}

// Unduh + decode gambar di latar belakang supaya siap tampil seketika
const preloaded = new Set<string>();
function preloadImages(urls: string[]) {
  urls.forEach((u) => {
    if (!u || preloaded.has(u)) return;
    preloaded.add(u);
    const im = new window.Image();
    im.src = u;
    im.decode?.().catch(() => {});
  });
}

export default function CatalogPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const withSlug = (path: string) => (slug ? `${path}?slug=${slug}` : path);

  const [setting, setSetting] = useState<POSetting | null>(null);
  const [products, setProducts] = useState<POProduct[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter kategori katalog (Dewasa / Kids)
  const [activeCategory, setActiveCategory] =
    useState<CategoryFilter>("dewasa");

  // Modal states
  const [selectedProduct, setSelectedProduct] = useState<POProduct | null>(
    null,
  );
  const [imageIndex, setImageIndex] = useState(0);
  const [touchStart, setTouchStart] = useState(0);

  // Varian picker states (di dalam modal)
  const [pickerWarna, setPickerWarna] = useState("");
  const [pickerLengan, setPickerLengan] = useState("");
  const [pickerUkuran, setPickerUkuran] = useState("");
  const [pickerQty, setPickerQty] = useState(1);
  const [addedFeedback, setAddedFeedback] = useState(false);

  // Keranjang
  const [cart, setCart] = useState<CartItemSession[]>([]);

  // Header transparan menyatu dengan hero; berubah putih setelah hero terlewati
  const [headerSolid, setHeaderSolid] = useState(false);
  const heroRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Simpan slug ke sessionStorage agar halaman lain bisa membacanya
    if (slug) sessionStorage.setItem("po_slug", slug);

    // Load keranjang dari sessionStorage
    setCart(loadCart());

    async function loadData() {
      setLoading(true);
      if (!slug) {
        setLoading(false);
        return;
      }
      const set = await getPOSettingBySlug(slug);
      if (!set) {
        setLoading(false);
        return;
      }
      const prods = await getAllPOProducts(set.id);
      setSetting(set);
      setProducts(prods.filter((p) => p.is_active));
      setLoading(false);
    }
    loadData();
  }, [slug]);

  // Keyboard navigation for Modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedProduct) return;
      if (e.key === "Escape") closeModal();
      if (e.key === "ArrowLeft") prevImage();
      if (e.key === "ArrowRight") nextImage();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedProduct, imageIndex]);

  // Preload SEMUA foto produk begitu modal dibuka → geser foto tanpa loading
  useEffect(() => {
    if (!selectedProduct) return;
    preloadImages(selectedProduct.image_urls);
  }, [selectedProduct]);

  const isActive = setting?.is_active ?? false;
  const brandName = setting?.title || "Katalog PO";

  // Judul tab: "(Nama PO) | Langitan.co" (cadangan bila judul dari server belum sesuai)
  useEffect(() => {
    document.title = `${brandName} | Langitan.co`;
  }, [brandName]);
  const periode = `${setting?.periode_mulai || "-"} — ${setting?.periode_selesai || "-"}`;
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  // Data footer: identitas toko + link WhatsApp admin (08xx → 628xx)
  const { storeName, storeAddress } = getStoreInfo(setting);
  const waDigits = (setting?.wa_admin_phone || "").replace(/\D/g, "");
  const waNumber = waDigits.startsWith("0")
    ? `62${waDigits.slice(1)}`
    : waDigits;
  const waLink = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`Halo admin ${brandName}, saya ingin bertanya tentang PO.`)}`
    : "";

  // Produk yang sesuai filter kategori aktif
  const filteredProducts = products.filter(
    (p) => (p.category ?? "dewasa") === activeCategory,
  );
  const dewasaCount = products.filter(
    (p) => (p.category ?? "dewasa") === "dewasa",
  ).length;
  const kidsCount = products.filter((p) => p.category === "kids").length;

  // Efek parallax hero: seluruh blok teks tengah bergeser DENGAN KECEPATAN LEBIH
  // LAMBAT dari scroll halaman, jadi seolah isi hero "tertinggal" di dalam objeknya.
  // Satu blok, satu kecepatan → jarak antar teks tetap, tidak menyatu/menciut.
  // Header berubah putih setelah hero terlewati.
  // Transform ditulis langsung ke elemen (tanpa setState) supaya scroll tetap mulus.
  useEffect(() => {
    const hero = heroRef.current;
    const stage = stageRef.current;
    if (!hero || !stage) return;
    let raf = 0;

    const update = () => {
      raf = 0;
      const y = window.scrollY;
      const hh = hero.offsetHeight || 1;
      setHeaderSolid(y > hh - HEADER_H - 1);

      // Hanya dihitung selama hero masih terlihat
      const sy = Math.min(y, hh);
      stage.style.transform = `translate3d(0, ${(sy * HERO_TEXT_LAG).toFixed(1)}px, 0)`;
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
  }, []);

  /* ── Modal Handlers ── */
  const openModal = (product: POProduct) => {
    setSelectedProduct(product);
    setImageIndex(0);
    // Reset picker ke default pertama
    setPickerWarna(product.colors[0] || "");
    setPickerLengan(product.sleeve_types[0] || "");
    setPickerUkuran(product.available_sizes[0] || "");
    setPickerQty(1);
    setAddedFeedback(false);
    document.body.style.overflow = "hidden";
  };

  const closeModal = () => {
    setSelectedProduct(null);
    document.body.style.overflow = "";
  };

  const nextImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!selectedProduct || selectedProduct.image_urls.length <= 1) return;
    setImageIndex((prev) => (prev + 1) % selectedProduct.image_urls.length);
  };

  const prevImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!selectedProduct || selectedProduct.image_urls.length <= 1) return;
    setImageIndex((prev) =>
      prev === 0 ? selectedProduct.image_urls.length - 1 : prev - 1,
    );
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart - touchEnd;
    if (diff > 45) nextImage();
    if (diff < -45) prevImage();
  };

  /* ── Hitung harga preview di modal ── */
  const hitungHargaModal = () => {
    if (!selectedProduct || !setting) return 0;
    return calculateItemPrice(
      selectedProduct.base_price,
      pickerUkuran,
      pickerLengan,
      selectedProduct,
      {
        sleeveSurcharge: setting.sleeve_surcharge ?? 0,
        xxlSurcharge: setting.xxl_surcharge ?? 0,
        sweaterXxlSurcharge: setting.sweater_xxl_surcharge ?? 0,
      },
    );
  };

  const hargaSatuan = hitungHargaModal();
  const hargaTotal = hargaSatuan * pickerQty;

  /* ── Tambah ke keranjang ── */
  const handleAddToCart = () => {
    if (!selectedProduct || !setting) return;

    const newItem: CartItemSession = {
      cart_id: crypto.randomUUID(),
      product_id: selectedProduct.id,
      product_name: selectedProduct.name,
      warna: pickerWarna || "-",
      lengan: pickerLengan || "-",
      ukuran: pickerUkuran || "-",
      qty: pickerQty,
      harga_satuan: hargaSatuan,
      subtotal: hargaSatuan * pickerQty,
    };

    const updated = [...cart, newItem];
    setCart(updated);
    saveCart(updated);

    // Feedback visual sebentar lalu tutup modal
    setAddedFeedback(true);
    setTimeout(() => {
      closeModal();
      setAddedFeedback(false);
    }, 900);
  };

  return (
    <div className="min-h-screen bg-stone-100 text-zinc-950 font-sans selection:bg-zinc-200">
      {/* ── HEADER ── (transparan di atas hero, jadi putih setelah hero terlewati) */}
      <header
        className={`fixed top-0 inset-x-0 z-40 px-5 md:px-10 lg:px-16 h-[60px] flex items-center justify-between border-b transition-[background-color,border-color,backdrop-filter] duration-300 ${
          headerSolid
            ? "bg-white/90 backdrop-blur-md border-gray-200"
            : "bg-transparent border-transparent"
        }`}
      >
        <div
          className={`text-base font-extrabold tracking-tight flex items-center gap-2 transition-colors duration-300 ${
            headerSolid ? "text-zinc-950" : "text-white"
          }`}
        >
          {setting?.icon_image_url ? (
            <img
              src={setting.icon_image_url}
              alt=""
              className="w-7 h-7 rounded-md object-cover"
            />
          ) : (
            <Package size={18} />
          )}
          <span>{brandName}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span
            className={`hidden md:flex items-center gap-1.5 text-xs transition-colors duration-300 ${
              headerSolid ? "text-gray-400" : "text-white/55"
            }`}
          >
            <CalendarDays size={14} />
            {periode}
          </span>
          <Link
            href={`/po/${slug}/reseller`}
            className={`flex items-center gap-1.5 bg-transparent border px-3 sm:px-4 py-2 rounded-full text-xs font-bold transition-all ${
              headerSolid
                ? "text-zinc-950 border-gray-300 hover:bg-stone-100 hover:border-zinc-950"
                : "text-white border-white/30 hover:bg-white/10 hover:border-white/60"
            }`}
            title="Portal Reseller"
          >
            <Users size={14} />
            <span className="hidden sm:inline">Reseller</span>
          </Link>

          {/* Tombol Keranjang */}
          {isActive && (
            <Link
              href={withSlug("/po/order")}
              className={`relative flex items-center gap-1.5 bg-transparent border px-4 py-2 rounded-full text-xs font-bold transition-all ${
                headerSolid
                  ? "text-zinc-950 border-gray-300 hover:bg-stone-100 hover:border-zinc-950"
                  : "text-white border-white/30 hover:bg-white/10 hover:border-white/60"
              }`}
            >
              <ShoppingCart size={14} />
              <span className="hidden sm:inline">Keranjang</span>
              {cartCount > 0 && (
                <span
                  className={`absolute -top-1.5 -right-1.5 w-4 h-4 text-[10px] font-extrabold rounded-full flex items-center justify-center ${
                    headerSolid
                      ? "bg-zinc-950 text-white"
                      : "bg-white text-zinc-950"
                  }`}
                >
                  {cartCount > 9 ? "9+" : cartCount}
                </span>
              )}
            </Link>
          )}

          {isActive ? (
            <Link
              href={withSlug("/po/order")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold hover:opacity-80 transition-all ${
                headerSolid
                  ? "bg-zinc-950 text-white"
                  : "bg-white text-zinc-950"
              }`}
            >
              <ArrowRight size={14} />
              <span className="hidden sm:inline">
                {cartCount > 0
                  ? `Pesan Sekarang (${cartCount})`
                  : "Pesan Sekarang"}
              </span>
              <span className="sm:hidden">Pesan</span>
            </Link>
          ) : (
            <button
              disabled
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold cursor-not-allowed transition-colors ${
                headerSolid
                  ? "bg-zinc-300 text-zinc-500"
                  : "bg-white/15 text-zinc-400"
              }`}
            >
              <ArrowRight size={14} />
              PO Ditutup
            </button>
          )}
        </div>
      </header>

      {/* ── HERO ── (mulai dari paling atas layar; header melayang di atasnya) */}
      <section
        ref={heroRef}
        className="bg-zinc-950 text-white px-5 md:px-10 lg:px-16 pt-[60px] pb-16 min-h-[100svh] flex items-center relative overflow-hidden"
      >
        <div
          className="absolute inset-0 pointer-events-none opacity-80"
          style={{
            backgroundImage:
              "radial-gradient(circle at 72% 30%, #1f2937 0%, transparent 52%), radial-gradient(circle at 20% 80%, #111827 0%, transparent 45%)",
          }}
        />
        <PixelTrail water={false} ambientAlpha={0.2} />

        {/* Teks tengah: satu blok yang bergeser lebih lambat dari scroll (parallax) */}
        <div className="w-full relative z-10">
          <div
            ref={stageRef}
            className="max-w-2xl mx-auto text-center will-change-transform"
          >
            <div className="mb-5">
              <div className="inline-flex items-center justify-center gap-2 text-[11px] font-bold tracking-widest uppercase text-white/55">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-green-400" : "bg-red-400"}`}
                />
                <span>{isActive ? "Pre-Order Aktif" : "PO Ditutup"}</span>
              </div>
            </div>

            <div className="mb-5">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-[1.08] tracking-tight">
                Temukan produk{" "}
                <em className="not-italic text-zinc-500">favorit</em> kamu di
                sini
              </h1>
            </div>

            <div className="mb-9">
              <p className="text-sm md:text-base text-white/60 max-w-md mx-auto leading-relaxed">
                Periode PO: {periode}. Pilih produk, tambahkan ke keranjang,
                lalu lanjut ke form pemesanan.
              </p>
            </div>

            <div>
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  onClick={() =>
                    document
                      .getElementById("sec-catalog")
                      ?.scrollIntoView({ behavior: "smooth" })
                  }
                  className="inline-flex items-center gap-2 bg-white text-zinc-950 px-6 py-3 rounded-full font-extrabold text-sm hover:opacity-90 hover:-translate-y-px transition-all"
                >
                  <LayoutGrid size={16} />
                  Lihat Katalog
                </button>
                {isActive && cartCount > 0 && (
                  <Link
                    href={withSlug("/po/order")}
                    className="inline-flex items-center gap-2 bg-transparent border border-white/25 text-white/85 px-6 py-3 rounded-full font-bold text-sm hover:border-white/55 hover:text-white transition-all"
                  >
                    <ShoppingCart size={16} />
                    Lihat Keranjang ({cartCount} item)
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── KATALOG ── */}
      <section
        id="sec-catalog"
        className="max-w-7xl mx-auto px-5 md:px-10 lg:px-16 py-12 md:py-16 scroll-mt-10"
      >
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Katalog Produk
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              Klik produk untuk melihat detail dan menambahkannya ke keranjang.
            </p>
          </div>
          <span className="text-xs font-bold text-gray-400 bg-gray-200/50 px-3 py-1 rounded-full">
            {filteredProducts.length} produk
          </span>
        </div>

        {/* Tab Pemisah Kategori: Dewasa / Kids */}
        <div className="flex items-center gap-2 mb-8 bg-white border border-gray-200 rounded-full p-1.5 w-fit">
          <button
            onClick={() => setActiveCategory("dewasa")}
            className={`flex items-center gap-2 px-4 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-bold transition-all ${
              activeCategory === "dewasa"
                ? "bg-zinc-950 text-white"
                : "text-gray-400 hover:text-zinc-950"
            }`}
          >
            <PersonStanding size={15} />
            Dewasa
            <span
              className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${
                activeCategory === "dewasa"
                  ? "bg-white/20 text-white"
                  : "bg-stone-100 text-gray-400"
              }`}
            >
              {dewasaCount}
            </span>
          </button>
          <button
            onClick={() => setActiveCategory("kids")}
            className={`flex items-center gap-2 px-4 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-bold transition-all ${
              activeCategory === "kids"
                ? "bg-zinc-950 text-white"
                : "text-gray-400 hover:text-zinc-950"
            }`}
          >
            <Baby size={15} />
            Kids
            <span
              className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${
                activeCategory === "kids"
                  ? "bg-white/20 text-white"
                  : "bg-stone-100 text-gray-400"
              }`}
            >
              {kidsCount}
            </span>
          </button>
        </div>

        {/* Status Banner */}
        {!loading && (
          <div className="mb-8">
            {isActive ? (
              <div className="flex items-start gap-2.5 p-3.5 md:px-5 md:py-3.5 bg-green-50 text-green-700 border border-green-200 rounded-xl text-sm font-semibold wrap-break-words">
                <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
                <span>
                  PO sedang <strong className="font-extrabold">AKTIF</strong> —
                  Klik produk untuk memilih dan tambahkan ke keranjang.
                </span>
              </div>
            ) : (
              <div className="flex items-start gap-2.5 p-3.5 md:px-5 md:py-3.5 bg-red-50 text-red-700 border border-red-200 rounded-xl text-sm font-semibold wrap-break-words">
                <XCircle size={18} className="shrink-0 mt-0.5" />
                <span>
                  PO sedang <strong className="font-extrabold">TUTUP</strong> —
                  Pemesanan tidak tersedia saat ini.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Grid produk */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5">
          {loading ? (
            <div className="col-span-full text-center py-16 text-gray-400 text-sm">
              <div className="w-8 h-8 border-[3px] border-gray-200 border-t-zinc-950 rounded-full animate-spin mx-auto mb-3" />
              <p>Memuat produk...</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="col-span-full text-center py-16 text-gray-400 text-sm">
              {activeCategory === "kids" ? (
                <Baby size={32} className="mx-auto mb-3 opacity-50" />
              ) : (
                <Package size={32} className="mx-auto mb-3 opacity-50" />
              )}
              <p>
                Belum ada produk {activeCategory === "kids" ? "kids" : "dewasa"}{" "}
                di katalog.
              </p>
            </div>
          ) : (
            filteredProducts.map((p, idx) => (
              <div
                key={p.id}
                onClick={() => openModal(p)}
                // Mulai unduh foto produk sebelum diklik (hover desktop / sentuh di HP)
                onMouseEnter={() => preloadImages(p.image_urls)}
                onTouchStart={() => preloadImages(p.image_urls)}
                className="bg-white border border-gray-200 rounded-xl md:rounded-2xl overflow-hidden cursor-pointer flex flex-col transition-all duration-200 hover:border-gray-300 hover:-translate-y-1 group"
              >
                {/* ✅ Aspect ratio diubah dari 4/3 → 4/5 agar sesuai rasio asli foto produk (portrait), supaya object-cover tidak memotong bagian penting gambar di semua ukuran layar */}
                <div className="w-full aspect-[4/5] bg-slate-100 relative overflow-hidden shrink-0">
                  {p.image_urls[0] ? (
                    <img
                      src={thumbUrl(p.image_urls[0])}
                      onError={fallbackToOriginal(p.image_urls[0])}
                      alt={p.name}
                      width={480}
                      height={600}
                      // 4 kartu pertama (terlihat tanpa scroll) dimuat langsung, sisanya lazy
                      loading={idx < 4 ? "eager" : "lazy"}
                      fetchPriority={idx < 2 ? "high" : "auto"}
                      decoding="async"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <Shirt size={36} />
                    </div>
                  )}
                  {p.image_urls.length > 1 && (
                    <div className="absolute bottom-2.5 right-2.5 bg-black/50 text-white text-[10px] md:text-xs font-bold px-2 md:px-2.5 py-1 rounded-full flex items-center gap-1 backdrop-blur-sm">
                      <Camera size={12} />
                      {p.image_urls.length}
                    </div>
                  )}
                </div>
                <div className="p-3.5 md:p-4 flex-1 flex flex-col">
                  <h3 className="text-sm md:text-[15px] font-bold leading-snug text-zinc-950">
                    {p.name}
                  </h3>
                  <p className="text-[15px] md:text-base font-extrabold text-zinc-950 mt-0.5">
                    {formatRupiah(p.base_price)}
                  </p>
                  {p.description && (
                    <p className="text-xs text-gray-400 leading-relaxed mt-1 line-clamp-2">
                      {p.description}
                    </p>
                  )}
                  <div className="mt-auto pt-3 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-[11px] md:text-xs font-bold text-gray-500 flex items-center gap-1">
                      <Eye size={13} /> Detail & Pilih
                    </span>
                    <div className="flex gap-1 overflow-hidden">
                      {p.available_sizes.slice(0, 3).map((s) => (
                        <span
                          key={s}
                          className="text-[10px] md:text-[11px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 border border-gray-200 text-gray-400 whitespace-nowrap"
                        >
                          {s}
                        </span>
                      ))}
                      {p.available_sizes.length > 3 && (
                        <span className="text-[10px] md:text-[11px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 border border-gray-200 text-gray-400">
                          +{p.available_sizes.length - 3}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ── CTA BOTTOM ── */}
      <section className="bg-zinc-950 text-white px-5 md:px-10 lg:px-16 py-14 md:py-20 text-center">
        <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-2.5">
          {cartCount > 0
            ? `${cartCount} item di keranjangmu`
            : "Siap untuk memesan?"}
        </h2>
        <p className="text-sm text-white/55 mb-7 max-w-md mx-auto">
          {cartCount > 0
            ? "Lanjutkan ke form pemesanan untuk menyelesaikan pesanan."
            : "Pilih produk dari katalog, tambahkan ke keranjang, lalu checkout."}
        </p>
        {isActive ? (
          <Link
            href={withSlug("/po/order")}
            className="inline-flex items-center gap-2 bg-white text-zinc-950 px-8 py-3.5 rounded-full font-extrabold text-sm hover:opacity-90 transition-opacity"
          >
            <ArrowRight size={16} />
            {cartCount > 0 ? "Lanjut ke Pemesanan" : "Buka Form Pemesanan"}
          </Link>
        ) : (
          <button
            disabled
            className="inline-flex items-center gap-2 bg-zinc-800 text-zinc-500 px-8 py-3.5 rounded-full font-extrabold text-sm cursor-not-allowed"
          >
            Pemesanan Ditutup
          </button>
        )}
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-zinc-950 text-white border-t border-white/10">
        <div className="max-w-7xl mx-auto px-5 md:px-10 lg:px-16 pt-14 pb-8">
          <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr]">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                {setting?.icon_image_url ? (
                  <img
                    src={setting.icon_image_url}
                    alt={brandName}
                    className="w-9 h-9 rounded-lg object-cover bg-white/10"
                  />
                ) : (
                  <span className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center">
                    <Package size={18} />
                  </span>
                )}
                <span className="text-base font-extrabold tracking-tight">
                  {brandName}
                </span>
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed max-w-xs mb-5">
                Pilih produk favoritmu, tambahkan ke keranjang, lalu selesaikan
                pesanan lewat form pemesanan.
              </p>
              <span className="inline-flex items-center gap-2 text-[11px] font-bold tracking-widest uppercase text-zinc-300 border border-white/15 rounded-full px-3 py-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-green-400" : "bg-red-400"}`}
                />
                {isActive ? "Pre-Order Aktif" : "PO Ditutup"}
              </span>
            </div>

            {/* Menu */}
            <nav aria-label="Menu footer">
              <h3 className="text-[11px] font-bold tracking-widest uppercase text-zinc-500 mb-4">
                Menu
              </h3>
              <ul className="space-y-3 text-sm">
                <li>
                  <button
                    type="button"
                    onClick={() =>
                      document
                        .getElementById("sec-catalog")
                        ?.scrollIntoView({ behavior: "smooth" })
                    }
                    className="text-zinc-400 hover:text-white transition-colors"
                  >
                    Katalog Produk
                  </button>
                </li>
                {isActive && (
                  <li>
                    <Link
                      href={withSlug("/po/order")}
                      className="text-zinc-400 hover:text-white transition-colors"
                    >
                      {cartCount > 0
                        ? `Keranjang (${cartCount})`
                        : "Form Pemesanan"}
                    </Link>
                  </li>
                )}
                <li>
                  <Link
                    href={`/po/${slug}/reseller`}
                    className="text-zinc-400 hover:text-white transition-colors"
                  >
                    Portal Reseller
                  </Link>
                </li>
                {slug && (
                  <li>
                    <Link
                      href={`/po/${slug}/daftar-reseller`}
                      className="text-zinc-400 hover:text-white transition-colors"
                    >
                      Daftar Jadi Reseller
                    </Link>
                  </li>
                )}
              </ul>
            </nav>

            {/* Informasi & kontak */}
            <div>
              <h3 className="text-[11px] font-bold tracking-widest uppercase text-zinc-500 mb-4">
                Informasi
              </h3>
              <ul className="space-y-3 text-sm text-zinc-400">
                <li className="flex items-start gap-2.5">
                  <CalendarDays size={15} className="mt-0.5 shrink-0" />
                  <span>
                    <span className="block text-zinc-500 text-xs mb-0.5">
                      Periode PO
                    </span>
                    {periode}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <MapPin size={15} className="mt-0.5 shrink-0" />
                  <span>{storeAddress}</span>
                </li>
              </ul>
              {waLink && (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex items-center gap-2 bg-white text-zinc-950 px-5 py-2.5 rounded-full font-extrabold text-xs hover:opacity-90 hover:-translate-y-px transition-all"
                >
                  <MessageCircle size={15} />
                  Hubungi Admin
                </a>
              )}
            </div>
          </div>

          {/* Bar bawah */}
          <div className="mt-12 pt-6 border-t border-white/10 flex flex-col-reverse sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
            <p>
              © {new Date().getFullYear()} {storeName}. Hak cipta dilindungi.
            </p>
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors"
            >
              <ArrowUp size={14} />
              Kembali ke atas
            </button>
          </div>
        </div>
      </footer>

      {/* ══════════════════════════════════════════════════
          MODAL DETAIL + VARIAN PICKER
      ══════════════════════════════════════════════════ */}
      {selectedProduct && (
        <div
          className="fixed inset-0 bg-black/75 z-50 flex items-end sm:items-center justify-center p-3 sm:p-5 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-4xl max-h-[92vh] sm:max-h-[88vh] overflow-hidden flex flex-col sm:flex-row shadow-2xl animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:fade-in sm:zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Sisi Foto ── */}
            {/* ✅ Aspect ratio mobile diubah dari 4/3 → 4/5 agar konsisten dengan rasio asli foto produk. Di desktop (sm:) tetap pakai min-h dengan object-cover, karena modal landscape punya ruang vertikal lebih fleksibel mengikuti tinggi konten */}
            <div
              className="w-full sm:flex-[1.2] bg-slate-100 relative overflow-hidden flex items-center justify-center aspect-4/5 sm:aspect-auto sm:min-h-[480px] select-none"
              onTouchStart={(e) => setTouchStart(e.touches[0].clientX)}
              onTouchEnd={handleTouchEnd}
            >
              {selectedProduct.image_urls[imageIndex] ? (
                <img
                  src={selectedProduct.image_urls[imageIndex]}
                  alt={selectedProduct.name}
                  decoding="async"
                  // Thumbnail (sudah ter-cache dari kartu) tampil dulu selagi foto besar dimuat
                  style={{
                    backgroundImage: `url("${thumbUrl(selectedProduct.image_urls[imageIndex])}")`,
                    backgroundSize: "contain",
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                  }}
                  className="w-full h-full object-contain animate-in fade-in duration-300"
                  key={imageIndex}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300">
                  <Shirt size={48} />
                </div>
              )}

              {selectedProduct.image_urls.length > 1 && (
                <>
                  <button
                    onClick={prevImage}
                    className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white w-9 h-9 rounded-full flex items-center justify-center transition-colors z-10"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    onClick={nextImage}
                    className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white w-9 h-9 rounded-full flex items-center justify-center transition-colors z-10"
                  >
                    <ChevronRight size={20} />
                  </button>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                    {selectedProduct.image_urls.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setImageIndex(i)}
                        className={`w-1.5 h-1.5 rounded-full transition-all ${
                          i === imageIndex
                            ? "bg-white scale-150"
                            : "bg-white/40 hover:bg-white/70"
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}

              <button
                onClick={closeModal}
                className="sm:hidden absolute top-3 right-3 bg-white/90 text-zinc-950 w-8 h-8 rounded-full flex items-center justify-center z-10 shadow-sm"
              >
                <X size={18} />
              </button>
            </div>

            {/* ── Sisi Info + Picker ── */}
            <div className="flex-1 flex flex-col overflow-y-auto">
              {/* Header info sisi kanan */}
              <div className="p-3 sm:p-6 border-b border-gray-100">
                <div className="hidden sm:flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold tracking-widest uppercase text-gray-400">
                    Pre-Order
                  </span>
                  <button
                    onClick={closeModal}
                    className="bg-stone-100 hover:bg-stone-200 text-zinc-950 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
                <h2 className="text-[15px] sm:text-xl font-extrabold leading-tight text-zinc-950 mb-1">
                  {selectedProduct.name}
                </h2>
                <p className="text-base sm:text-xl font-extrabold text-zinc-950">
                  {formatRupiah(selectedProduct.base_price)}
                  {hargaSatuan > selectedProduct.base_price && (
                    <span className="ml-2 text-xs sm:text-sm font-semibold text-blue-600">
                      → {formatRupiah(hargaSatuan)} (varian dipilih)
                    </span>
                  )}
                </p>
                {selectedProduct.description && (
                  <p className="text-[11px] sm:text-xs text-gray-500 mt-1.5 sm:mt-2 leading-relaxed">
                    {selectedProduct.description}
                  </p>
                )}
              </div>

              {/* ── VARIAN PICKER ── */}
              <div className="p-3 sm:p-6 flex-1 space-y-2.5 sm:space-y-4">
                {/* ═══ MOBILE: Warna / Lengan / Ukuran sebagai dropdown dalam satu baris ═══ */}
                {(selectedProduct.colors.length > 0 ||
                  selectedProduct.sleeve_types.length > 0 ||
                  selectedProduct.available_sizes.length > 0) && (
                  <div className="sm:hidden grid grid-cols-3 gap-2">
                    {/* Warna */}
                    {selectedProduct.colors.length > 0 && (
                      <div>
                        <label className="block text-[10px] font-bold text-zinc-950 mb-1 uppercase tracking-wide">
                          Warna
                        </label>
                        <select
                          value={pickerWarna}
                          onChange={(e) => setPickerWarna(e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-zinc-950 bg-white outline-none focus:border-zinc-950 transition-colors appearance-none"
                          style={{
                            backgroundImage:
                              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%239ca3af'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E\")",
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "right 0.4rem center",
                            backgroundSize: "1.1em",
                            paddingRight: "1.75rem",
                          }}
                        >
                          {selectedProduct.colors.map((w) => (
                            <option key={w} value={w}>
                              {w}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Lengan */}
                    {selectedProduct.sleeve_types.length > 0 && (
                      <div>
                        <label className="block text-[10px] font-bold text-zinc-950 mb-1 uppercase tracking-wide">
                          Lengan
                        </label>
                        <select
                          value={pickerLengan}
                          onChange={(e) => setPickerLengan(e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-zinc-950 bg-white outline-none focus:border-zinc-950 transition-colors appearance-none"
                          style={{
                            backgroundImage:
                              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%239ca3af'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E\")",
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "right 0.4rem center",
                            backgroundSize: "1.1em",
                            paddingRight: "1.75rem",
                          }}
                        >
                          {selectedProduct.sleeve_types.map((l) => (
                            <option key={l} value={l}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Ukuran */}
                    {selectedProduct.available_sizes.length > 0 && (
                      <div>
                        <label className="block text-[10px] font-bold text-zinc-950 mb-1 uppercase tracking-wide">
                          Ukuran
                        </label>
                        <select
                          value={pickerUkuran}
                          onChange={(e) => setPickerUkuran(e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-bold text-zinc-950 bg-white outline-none focus:border-zinc-950 transition-colors appearance-none"
                          style={{
                            backgroundImage:
                              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%239ca3af'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E\")",
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "right 0.4rem center",
                            backgroundSize: "1.1em",
                            paddingRight: "1.75rem",
                          }}
                        >
                          {selectedProduct.available_sizes.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* ═══ DESKTOP: Warna / Lengan / Ukuran sebagai button-group (pilihan visual) ═══ */}
                {/* Warna */}
                {selectedProduct.colors.length > 0 && (
                  <div className="hidden sm:block">
                    <p className="text-xs font-bold text-zinc-950 mb-2 uppercase tracking-wide">
                      Warna{" "}
                      <span className="font-semibold text-gray-400 normal-case tracking-normal">
                        — {pickerWarna}
                      </span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedProduct.colors.map((w) => (
                        <button
                          key={w}
                          onClick={() => setPickerWarna(w)}
                          className={`px-3 py-1.5 rounded-lg border text-sm font-semibold transition-all ${
                            pickerWarna === w
                              ? "border-zinc-950 bg-zinc-950 text-white"
                              : "border-gray-200 text-gray-600 hover:border-gray-400"
                          }`}
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Lengan */}
                {selectedProduct.sleeve_types.length > 0 && (
                  <div className="hidden sm:block">
                    <p className="text-xs font-bold text-zinc-950 mb-2 uppercase tracking-wide">
                      Lengan{" "}
                      <span className="font-semibold text-gray-400 normal-case tracking-normal">
                        — {pickerLengan}
                      </span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedProduct.sleeve_types.map((l) => (
                        <button
                          key={l}
                          onClick={() => setPickerLengan(l)}
                          className={`px-3 py-1.5 rounded-lg border text-sm font-semibold transition-all ${
                            pickerLengan === l
                              ? "border-zinc-950 bg-zinc-950 text-white"
                              : "border-gray-200 text-gray-600 hover:border-gray-400"
                          }`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Ukuran */}
                {selectedProduct.available_sizes.length > 0 && (
                  <div className="hidden sm:block">
                    <p className="text-xs font-bold text-zinc-950 mb-2 uppercase tracking-wide">
                      Ukuran{" "}
                      <span className="font-semibold text-gray-400 normal-case tracking-normal">
                        — {pickerUkuran}
                      </span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedProduct.available_sizes.map((u) => (
                        <button
                          key={u}
                          onClick={() => setPickerUkuran(u)}
                          className={`w-12 py-1.5 rounded-lg border text-sm font-bold transition-all ${
                            pickerUkuran === u
                              ? "border-zinc-950 bg-zinc-950 text-white"
                              : "border-gray-200 text-gray-600 hover:border-gray-400"
                          }`}
                        >
                          {u}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* QTY */}
                <div>
                  <p className="text-[11px] sm:text-xs font-bold text-zinc-950 mb-1.5 sm:mb-2 uppercase tracking-wide">
                    Jumlah
                  </p>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <button
                      onClick={() => setPickerQty((q) => Math.max(1, q - 1))}
                      className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-gray-200 flex items-center justify-center hover:bg-stone-100 transition-colors"
                    >
                      <Minus size={13} />
                    </button>
                    <span className="w-7 sm:w-8 text-center text-sm sm:text-base font-extrabold text-zinc-950">
                      {pickerQty}
                    </span>
                    <button
                      onClick={() => setPickerQty((q) => q + 1)}
                      className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-gray-200 flex items-center justify-center hover:bg-stone-100 transition-colors"
                    >
                      <Plus size={13} />
                    </button>
                    {hargaSatuan > 0 && (
                      <span className="text-xs sm:text-sm font-bold text-blue-600 ml-1.5 sm:ml-2">
                        = {formatRupiah(hargaTotal)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Tombol Aksi ── */}
              <div className="p-3 sm:p-6 border-t border-gray-100 space-y-2 sm:space-y-2.5">
                {isActive ? (
                  <>
                    <button
                      onClick={handleAddToCart}
                      disabled={addedFeedback}
                      className={`w-full flex items-center justify-center gap-2 py-2.5 sm:py-3 rounded-xl font-bold text-xs sm:text-sm transition-all ${
                        addedFeedback
                          ? "bg-green-600 text-white"
                          : "bg-zinc-950 hover:opacity-80 text-white"
                      }`}
                    >
                      {addedFeedback ? (
                        <>
                          <Check size={16} />
                          Ditambahkan ke Keranjang!
                        </>
                      ) : (
                        <>
                          <ShoppingCart size={16} />
                          Tambah ke Keranjang
                        </>
                      )}
                    </button>
                    <Link
                      href={withSlug("/po/order")}
                      className="w-full flex items-center justify-center gap-2 py-2.5 sm:py-3 rounded-xl font-bold text-xs sm:text-sm border border-gray-200 text-gray-600 hover:border-zinc-950 hover:text-zinc-950 transition-all"
                    >
                      <Pencil size={14} />
                      {cartCount > 0
                        ? `Lihat Keranjang (${cartCount} item)`
                        : "Langsung ke Form Pemesanan"}
                    </Link>
                  </>
                ) : (
                  <button
                    disabled
                    className="w-full flex items-center justify-center gap-2 bg-zinc-200 text-zinc-400 px-5 py-2.5 sm:py-3 rounded-xl font-bold text-xs sm:text-sm cursor-not-allowed"
                  >
                    PO Ditutup
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
