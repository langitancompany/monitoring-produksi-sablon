"use client";

import { useDialog } from "@/app/components/ui/DialogProvider";
import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  getPOSettingBySlug,
  getAllPOProducts,
  submitOrder,
} from "@/lib/po/admin";
import { formatRupiah } from "@/lib/po/pricing";
import { POSetting, POProduct } from "@/types/po";
import {
  Package,
  ArrowLeft,
  User,
  ShoppingBag,
  Send,
  Check,
  Copy,
  AlertTriangle,
  Landmark,
  MessageCircle,
  Loader2,
  Trash2,
  ShoppingCart,
  LayoutGrid,
  QrCode,
  Download,
} from "lucide-react";
import type { CartItemSession } from "@/app/po/[slug]/page";

const CART_KEY = "po_cart";

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

function clearCart() {
  sessionStorage.removeItem(CART_KEY);
}

function OrderFormContent() {
  const { notify } = useDialog();
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug");
  const katalogHref = slug ? `/po/${slug}` : "/po";

  const [setting, setSetting] = useState<POSetting | null>(null);
  const [products, setProducts] = useState<POProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const [nama, setNama] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [metodeKirim, setMetodeKirim] = useState("Diambil");
  const [alamat, setAlamat] = useState("");

  const [cart, setCart] = useState<CartItemSession[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [successData, setSuccessData] = useState<{
    kodePO: string;
    total: number;
    items: CartItemSession[];
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // ✅ State baru untuk handle download QRIS
  const [downloading, setDownloading] = useState(false);
  const [downloadNotif, setDownloadNotif] = useState(false);
  const [downloadError, setDownloadError] = useState(false);

  useEffect(() => {
    if (slug) sessionStorage.setItem("po_slug", slug);
    setCart(loadCart());

    async function load() {
      const effectiveSlug = slug || sessionStorage.getItem("po_slug");
      if (!effectiveSlug) {
        setLoading(false);
        return;
      }
      const set = await getPOSettingBySlug(effectiveSlug);
      if (!set) {
        setLoading(false);
        return;
      }
      const prods = await getAllPOProducts(set.id);
      setSetting(set);
      setProducts(prods.filter((p) => p.is_active));
      setLoading(false);
    }
    load();
  }, [slug]);

  const grandTotal = cart.reduce((sum, item) => sum + item.subtotal, 0);

  const removeFromCart = (cart_id: string) => {
    const updated = cart.filter((i) => i.cart_id !== cart_id);
    setCart(updated);
    saveCart(updated);
  };

  const submitOrderHandler = async () => {
    if (!nama || !whatsapp) {
      notify("Mohon lengkapi Nama dan No. WhatsApp.");
      return;
    }
    if (metodeKirim === "Dikirim" && !alamat.trim()) {
      notify("Mohon isi alamat lengkap pengiriman.");
      return;
    }
    if (cart.length === 0) {
      notify(
        "Keranjang kosong! Tambahkan produk dari katalog terlebih dahulu.",
      );
      return;
    }

    setSubmitting(true);

    const payload = {
      customer_type: "PUBLIC" as const,
      customer_name: nama,
      customer_wa: whatsapp,
      delivery_method: metodeKirim as "Diambil" | "Dikirim",
      shipping_address: alamat,
      order_items: cart.map((item) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        warna: item.warna,
        lengan: item.lengan,
        ukuran: item.ukuran,
        qty: item.qty,
        harga_satuan: item.harga_satuan,
        subtotal: item.subtotal,
      })),
    };

    try {
      const result = await submitOrder(payload, setting!, products);

      if (!result.success) {
        notify("Gagal memproses pesanan: " + result.error);
        setSubmitting(false);
        return;
      }

      setSuccessData({
        kodePO: result.po_number || "ERROR",
        total: result.total_amount ?? grandTotal,
        items: cart, // ✅ simpan dulu isi keranjang sebelum dikosongkan
      });
      clearCart();
      setCart([]);
      setSubmitting(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error(error);
      notify("Terjadi kesalahan pada server saat menyimpan pesanan.");
      setSubmitting(false);
    }
  };

  const copyKode = () => {
    if (!successData) return;
    navigator.clipboard.writeText(successData.kodePO);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ✅ Fungsi baru: download QRIS via blob, bukan buka tab baru
  const downloadQris = async () => {
    if (!setting?.qris_image_url) return;

    setDownloading(true);
    setDownloadError(false);

    try {
      const response = await fetch(setting.qris_image_url);

      if (!response.ok) {
        throw new Error(`Gagal mengambil gambar (status ${response.status})`);
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = "QRIS-Payment.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Bersihkan object URL setelah dipakai
      URL.revokeObjectURL(blobUrl);

      setDownloadNotif(true);
      setTimeout(() => setDownloadNotif(false), 3500);
    } catch (error) {
      console.error("Download QRIS error:", error);
      setDownloadError(true);
      setTimeout(() => setDownloadError(false), 3500);
    } finally {
      setDownloading(false);
    }
  };

  const getWhatsAppLink = () => {
    if (!successData || !setting) return "#";

    let infoPengiriman = `\n*Metode Pengambilan:* ${metodeKirim}`;
    if (metodeKirim === "Dikirim") {
      infoPengiriman += `\n*Alamat Pengiriman:* ${alamat}`;
    }

    const daftarBarang = successData.items
      .map(
        (item, i) =>
          `${i + 1}. ${item.product_name} (${item.ukuran}, ${item.lengan}, ${item.warna})\n    ${item.qty}pcs x ${formatRupiah(item.harga_satuan)} = ${formatRupiah(item.subtotal)}`,
      )
      .join("\n");

    const text = `Halo Admin, saya ingin konfirmasi pesanan PO saya.

*Kode PO:* ${successData.kodePO}
*Nama Pemesan:* ${nama}${infoPengiriman}

*Daftar Pesanan:*
${daftarBarang}
*Total Tagihan:* *${formatRupiah(successData.total)}*

Mohon info langkah pembayarannya.`;

    const waNumber =
      setting.wa_admin_phone?.replace(/\D/g, "") || "628123456789";
    return `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center">
        <Loader2 className="animate-spin text-zinc-400" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 text-zinc-950 font-sans selection:bg-zinc-200 pb-20">
      {/* ── HEADER ── */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 px-5 md:px-10 h-[60px] flex items-center justify-between">
        <div className="text-base font-extrabold tracking-tight text-zinc-950 flex items-center gap-2">
          <Package size={18} />
          <span>Form Pemesanan PO</span>
        </div>
        <Link
          href={katalogHref}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 border border-gray-200 px-3.5 py-1.5 rounded-full hover:border-gray-300 hover:text-zinc-950 transition-colors"
        >
          <ArrowLeft size={14} />
          Katalog
        </Link>
      </header>

      {/* ========================== SUKSES STATE ========================== */}
      {successData ? (
        <div className="animate-in fade-in zoom-in-95 duration-300">
          <div className="bg-zinc-950 text-white px-5 py-12 md:py-16 text-center relative overflow-hidden">
            <div
              className="absolute inset-0 pointer-events-none opacity-60"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 50% 60%, #064e3b 0%, transparent 60%)",
              }}
            />
            <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-5 relative z-10">
              <Check size={32} className="text-white" />
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight relative z-10 mb-2">
              Pesanan Berhasil Disimpan!
            </h2>
            <p className="text-sm text-white/60 relative z-10">
              Simpan kode pemesanan, lalu konfirmasi ke admin via WhatsApp.
            </p>
          </div>

          <div className="max-w-xl mx-auto px-5 py-8 md:py-10">
            {/* Kode PO */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center mb-4">
              <p className="text-[11px] font-bold tracking-widest uppercase text-gray-400 mb-2">
                Kode Pemesanan Anda
              </p>
              <p className="text-4xl font-extrabold tracking-wide text-zinc-950 mb-5 font-mono">
                {successData.kodePO}
              </p>
              <button
                onClick={copyKode}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition-all ${
                  copied
                    ? "bg-green-100 text-green-700 border border-green-300"
                    : "bg-stone-100 text-gray-600 border border-gray-200 hover:bg-gray-200 hover:text-zinc-950"
                }`}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Tersalin!" : "Salin Kode"}
              </button>
            </div>

            {/* Warning simpan kode */}
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3.5 mb-4 text-amber-800 text-sm font-semibold">
              <AlertTriangle
                size={18}
                className="text-amber-600 shrink-0 mt-0.5"
              />
              <p>
                Harap salin dan simpan kode ini untuk konfirmasi pembayaran
                kepada admin.
              </p>
            </div>

            {/* Info rekening */}
            {setting?.bank_account_info && (
              <div className="flex items-center gap-3 bg-stone-100 border border-gray-200 rounded-xl p-3.5 mb-4 text-gray-600 text-sm">
                <Landmark size={20} className="text-gray-400 shrink-0" />
                <span>
                  Transfer ke: <strong>{setting.bank_account_info}</strong>
                </span>
              </div>
            )}

            {/* ✅ QRIS — hanya muncul jika qris_image_url ada di settings */}
            {setting?.qris_image_url && (
              <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center mb-4">
                <p className="text-[11px] font-bold tracking-widest uppercase text-gray-400 mb-3 flex items-center justify-center gap-1.5">
                  <QrCode size={13} />
                  Scan QRIS untuk Bayar
                </p>
                <div className="w-52 h-52 mx-auto rounded-xl overflow-hidden border border-gray-100 bg-white mb-4">
                  <img
                    src={setting.qris_image_url}
                    alt="QRIS Payment"
                    className="w-full h-full object-contain p-1"
                  />
                </div>

                {/* ✅ Tombol download diganti jadi button + fetch blob */}
                <button
                  onClick={downloadQris}
                  disabled={downloading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-stone-100 border border-gray-200 text-gray-600 text-xs font-bold hover:bg-gray-200 hover:text-zinc-950 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {downloading ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Download size={13} />
                  )}
                  {downloading ? "Mengunduh..." : "Download QRIS"}
                </button>

                {/* ✅ Notifikasi sukses */}
                {downloadNotif && (
                  <p className="text-xs text-green-600 font-semibold mt-3 flex items-center justify-center gap-1.5 animate-in fade-in duration-200">
                    <Check size={13} />
                    Berhasil diunduh, silakan cek folder Download kamu
                  </p>
                )}

                {/* ✅ Notifikasi error */}
                {downloadError && (
                  <p className="text-xs text-red-600 font-semibold mt-3 flex items-center justify-center gap-1.5 animate-in fade-in duration-200">
                    <AlertTriangle size={13} />
                    Gagal mengunduh QRIS. Coba lagi.
                  </p>
                )}
              </div>
            )}

            {/* Tombol WhatsApp */}
            <p className="text-sm text-gray-500 text-center mb-3">
              Klik tombol di bawah untuk kirim rincian pesanan ke WhatsApp
              Admin.
            </p>
            <a
              href={getWhatsAppLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20ba59] text-white py-3.5 rounded-xl font-extrabold text-[15px] transition-colors mb-3"
            >
              <MessageCircle size={20} />
              Konfirmasi via WhatsApp
            </a>

            <Link
              href={katalogHref}
              className="w-full flex items-center justify-center gap-2 mt-2 text-gray-500 hover:text-zinc-950 py-2 text-sm font-semibold transition-colors"
            >
              <ArrowLeft size={16} />
              Kembali ke Katalog
            </Link>
          </div>
        </div>
      ) : (
        /* ========================== FORM STATE ========================== */
        <div className="animate-in fade-in duration-300">
          <div className="bg-zinc-950 text-white px-5 md:px-10 py-8 md:py-10 relative overflow-hidden">
            <div
              className="absolute inset-0 pointer-events-none opacity-80"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 80% 50%, #1f2937 0%, transparent 55%)",
              }}
            />
            <div className="relative z-10 max-w-2xl mx-auto">
              <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-widest uppercase text-white/50 mb-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                Pre-Order Aktif
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-1">
                Lengkapi <em className="not-italic text-white/40">data diri</em>{" "}
                kamu
              </h1>
              <p className="text-sm text-white/55">
                Keranjang sudah terisi dari katalog. Tinggal isi biodata dan
                kirim pesanan.
              </p>
            </div>
          </div>

          <div className="max-w-2xl mx-auto px-5 py-8 md:py-10 space-y-4">
            {/* Keranjang kosong */}
            {cart.length === 0 && (
              <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
                <ShoppingCart
                  size={40}
                  className="mx-auto mb-3 text-gray-300"
                />
                <p className="font-bold text-zinc-950 mb-1">
                  Keranjang masih kosong
                </p>
                <p className="text-sm text-gray-400 mb-5">
                  Pilih produk dari katalog terlebih dahulu, lalu tambahkan ke
                  keranjang.
                </p>
                <Link
                  href={katalogHref}
                  className="inline-flex items-center gap-2 bg-zinc-950 text-white px-6 py-2.5 rounded-full text-sm font-bold hover:opacity-80 transition-opacity"
                >
                  <LayoutGrid size={15} />
                  Kembali ke Katalog
                </Link>
              </div>
            )}

            {/* CARD 1: Ringkasan Keranjang */}
            {cart.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl md:rounded-2xl p-5 md:p-7">
                <h2 className="text-[11px] font-bold tracking-widest uppercase text-gray-400 mb-4 flex items-center gap-2">
                  <ShoppingBag size={14} /> Ringkasan Pesanan
                </h2>

                <div className="space-y-2.5 mb-4">
                  {cart.map((item) => (
                    <div
                      key={item.cart_id}
                      className="flex items-start gap-3 p-3 bg-stone-50 rounded-xl border border-gray-100 group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-zinc-950 truncate">
                          {item.product_name}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.ukuran !== "-" && (
                            <span className="text-[11px] font-semibold bg-white border border-gray-200 text-gray-500 px-2 py-0.5 rounded-full">
                              {item.ukuran}
                            </span>
                          )}
                          {item.lengan !== "-" && (
                            <span className="text-[11px] font-semibold bg-white border border-gray-200 text-gray-500 px-2 py-0.5 rounded-full">
                              {item.lengan}
                            </span>
                          )}
                          {item.warna !== "-" && (
                            <span className="text-[11px] font-semibold bg-white border border-gray-200 text-gray-500 px-2 py-0.5 rounded-full">
                              {item.warna}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1.5">
                          {item.qty} pcs × {formatRupiah(item.harga_satuan)}{" "}
                          <strong className="text-blue-700">
                            = {formatRupiah(item.subtotal)}
                          </strong>
                        </p>
                      </div>
                      <button
                        onClick={() => removeFromCart(item.cart_id)}
                        className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-300 hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0 mt-0.5"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                  <div>
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                      Total Bayar
                    </span>
                    <Link
                      href={katalogHref}
                      className="block text-xs text-blue-600 hover:underline font-semibold mt-0.5"
                    >
                      + Tambah produk lain
                    </Link>
                  </div>
                  <span className="text-xl font-extrabold text-green-600">
                    {formatRupiah(grandTotal)}
                  </span>
                </div>
              </div>
            )}

            {/* CARD 2: Data Diri */}
            <div className="bg-white border border-gray-200 rounded-xl md:rounded-2xl p-5 md:p-7">
              <h2 className="text-[11px] font-bold tracking-widest uppercase text-gray-400 mb-4 flex items-center gap-2">
                <User size={14} /> Data Pemesan
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-950 mb-1.5">
                    Nama Lengkap
                  </label>
                  <input
                    type="text"
                    value={nama}
                    onChange={(e) => setNama(e.target.value)}
                    placeholder="Nama kamu"
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm text-zinc-950 bg-white outline-none focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/5 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-950 mb-1.5">
                    No. WhatsApp
                  </label>
                  <input
                    type="text"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="Contoh: 0812345678"
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm text-zinc-950 bg-white outline-none focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/5 transition-all"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-xs font-bold text-zinc-950 mb-1.5">
                  Metode Pengambilan
                </label>
                <select
                  value={metodeKirim}
                  onChange={(e) => setMetodeKirim(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm text-zinc-950 bg-white outline-none focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/5 transition-all"
                >
                  <option value="Diambil">
                    Diambil di Tempat (Toko/Studio)
                  </option>
                  <option value="Dikirim">Dikirim ke Alamat</option>
                </select>
              </div>

              {metodeKirim === "Dikirim" && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <label className="block text-xs font-bold text-zinc-950 mb-1.5">
                    Alamat Lengkap Pengiriman
                  </label>
                  <textarea
                    value={alamat}
                    onChange={(e) => setAlamat(e.target.value)}
                    rows={3}
                    placeholder="Jalan, RT/RW, kelurahan, kecamatan, kota, kode pos..."
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm text-zinc-950 bg-white outline-none focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/5 transition-all resize-y min-h-20"
                  />
                </div>
              )}
            </div>

            {/* Info rekening */}
            {setting?.bank_account_info && (
              <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-4 text-gray-600 text-sm">
                <Landmark size={18} className="text-gray-400 shrink-0" />
                <span>
                  Pembayaran via transfer ke:{" "}
                  <strong className="text-zinc-950">
                    {setting.bank_account_info}
                  </strong>
                </span>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={submitOrderHandler}
              disabled={submitting || cart.length === 0}
              className="w-full bg-zinc-950 text-white py-3.5 rounded-xl text-[15px] font-extrabold flex justify-center items-center gap-2 hover:opacity-85 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {submitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  <Send size={18} />
                  Proses Pesanan
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrderFormPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-stone-100 flex items-center justify-center">
          <Loader2 className="animate-spin text-zinc-400" size={32} />
        </div>
      }
    >
      <OrderFormContent />
    </Suspense>
  );
}
