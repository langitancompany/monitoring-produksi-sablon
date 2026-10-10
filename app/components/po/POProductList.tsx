"use client";

import { useMarkPODataStaleOnLeave } from "./POAdminDataContext";
import { useDialog } from "@/app/components/ui/DialogProvider";
import { useEffect, useState } from "react";
import {
  getAllPOProducts,
  createPOProduct,
  updatePOProduct,
  deletePOProduct,
  togglePOProductActive,
  deleteProductImages,
} from "@/lib/po/admin";
import { formatRupiah } from "@/lib/po/pricing";
import { POProduct } from "@/types/po";
import { ArrowLeft, ImageOff, Plus, UploadCloud, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { thumbUrl, fallbackToOriginal } from "@/lib/po/images";
import { uploadOptimized } from "@/lib/po/optimizeImage";
import { countOldImages, optimizeExistingImages } from "@/lib/po/optimizeOld";

const EMPTY_PRODUCT: Omit<POProduct, "id"> = {
  product_code: "",
  name: "",
  category: "dewasa",
  garment_type: "kaos_dewasa",
  base_price: 0,
  available_sizes: [],
  sleeve_types: [],
  colors: [],
  image_urls: [],
  description: "",
  is_active: true,
  sort_order: 0,
  enable_sleeve_surcharge: false,
  enable_xxl_surcharge: false,
  enable_sweater_xxl_surcharge: false,
};

function arrayToStr(arr: string[]) {
  return arr.join(", ");
}
function strToArray(str: string) {
  return str
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-full">
      <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 block mb-1.5">
        {label}{" "}
        {hint && (
          <span className="font-normal text-zinc-400 dark:text-zinc-500">
            {hint}
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2.5 text-sm text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 hover:border-[#49bfb4]/50 focus:outline-none focus:ring-2 focus:ring-[#49bfb4] focus:border-[#49bfb4] transition-colors duration-150";

// Wajibkan komponen menerima properti poId
interface POProductListProps {
  poId: string;
}

export default function POProductList({ poId }: POProductListProps) {
  const { notify, confirmAsync } = useDialog();
  useMarkPODataStaleOnLeave();
  const [products, setProducts] = useState<POProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<POProduct | null>(null);
  const [form, setForm] = useState<Omit<POProduct, "id">>(EMPTY_PRODUCT);
  const [saving, setSaving] = useState(false);

  // ── OPTIMASI FOTO LAMA ──
  const [optimizing, setOptimizing] = useState(false);
  const [optProgress, setOptProgress] = useState({ done: 0, total: 0 });

  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [pendingDeleteUrls, setPendingDeleteUrls] = useState<string[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

  const [rawSizes, setRawSizes] = useState("");
  const [rawSleeves, setRawSleeves] = useState("");
  const [rawColors, setRawColors] = useState("");

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poId]); // Reload jika poId berganti

  useEffect(() => {
    if (showForm) {
      setRawSizes(arrayToStr(form.available_sizes));
      setRawSleeves(arrayToStr(form.sleeve_types));
      setRawColors(arrayToStr(form.colors));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm]);

  async function load() {
    setLoading(true);
    // Teruskan poId agar admin.ts bisa memfilter data
    const data = await getAllPOProducts(poId);
    setProducts(data);
    setLoading(false);
  }

  async function handleOptimizeOld() {
    const total = countOldImages(products);
    if (total === 0) return;
    const okOptimize = await confirmAsync(
      `Ada ${total} foto lama yang belum dioptimasi.\n\nFoto akan dikecilkan otomatis dan file lama diganti. Proses bisa beberapa menit — jangan tutup halaman ini sampai selesai.\n\nLanjutkan?`,
      { title: "Optimasi Foto" },
    );
    if (!okOptimize) return;
    setOptimizing(true);
    setOptProgress({ done: 0, total });
    try {
      const r = await optimizeExistingImages(products, (done, tot) =>
        setOptProgress({ done, total: tot }),
      );
      const mb = (r.savedBytes / 1024 / 1024).toFixed(1);
      notify(
        `Selesai.\n${r.done} foto berhasil dioptimasi (hemat ± ${mb} MB)` +
          (r.failed > 0
            ? `\n${r.failed} foto dilewati/gagal (tetap memakai file lama).`
            : ""),
      );
    } catch (err) {
      console.error(err);
      notify(
        "Terjadi kesalahan saat optimasi. Foto yang belum diproses tetap aman.",
      );
    } finally {
      setOptimizing(false);
      load();
    }
  }

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_PRODUCT);
    setNewFiles([]);
    setPreviewUrls([]);
    setPendingDeleteUrls([]);
    setShowForm(true);
  }

  function openEdit(p: POProduct) {
    setEditTarget(p);
    setForm({
      product_code: p.product_code,
      name: p.name,
      category: p.category ?? "dewasa",
      garment_type: p.garment_type ?? "kaos_dewasa",
      base_price: p.base_price,
      available_sizes: p.available_sizes,
      sleeve_types: p.sleeve_types,
      colors: p.colors,
      image_urls: p.image_urls || [],
      description: p.description || "",
      is_active: p.is_active,
      sort_order: p.sort_order,
      enable_sleeve_surcharge: p.enable_sleeve_surcharge ?? false,
      enable_xxl_surcharge: p.enable_xxl_surcharge ?? false,
      enable_sweater_xxl_surcharge: p.enable_sweater_xxl_surcharge ?? false,
    });
    setNewFiles([]);
    setPreviewUrls([]);
    setPendingDeleteUrls([]);
    setShowForm(true);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    setNewFiles((prev) => [...prev, ...files]);
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviewUrls((prev) => [...prev, ...urls]);
    e.target.value = "";
  }

  function removeOldImage(index: number) {
    const urlToDelete = form.image_urls[index];
    const updated = [...form.image_urls];
    updated.splice(index, 1);
    setForm({ ...form, image_urls: updated });
    setPendingDeleteUrls((prev) => [...prev, urlToDelete]);
  }

  function removeNewImage(index: number) {
    const updatedFiles = [...newFiles];
    updatedFiles.splice(index, 1);
    setNewFiles(updatedFiles);

    const updatedPreviews = [...previewUrls];
    URL.revokeObjectURL(updatedPreviews[index]);
    updatedPreviews.splice(index, 1);
    setPreviewUrls(updatedPreviews);
  }

  async function handleSave() {
    if (!form.name || !form.product_code || form.base_price <= 0) {
      notify("Nama, kode produk, dan harga wajib diisi.");
      return;
    }
    setSaving(true);
    const supabase = createClient();

    try {
      const uploadedUrls: string[] = [];

      for (const file of newFiles) {
        // ── OPTIMASI ── kompres (utama 1200px + thumbnail 480px) lalu upload
        const up = await uploadOptimized(supabase, file);
        if (up) {
          uploadedUrls.push(up.url);
          continue;
        }

        // Fallback: kompresi/upload gagal → upload file asli seperti dulu
        const fileExt = file.name.split(".").pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `products/${fileName}`;
        const { data, error } = await supabase.storage
          .from("po_assets")
          .upload(filePath, file, { cacheControl: "31536000" });
        if (error) {
          console.error("Gagal upload gambar:", error);
          notify(`Gagal upload ${file.name}. Lanjut menyimpan data lainnya.`);
        } else if (data) {
          const { data: publicUrlData } = supabase.storage
            .from("po_assets")
            .getPublicUrl(filePath);
          uploadedUrls.push(publicUrlData.publicUrl);
        }
      }

      const finalProduct = {
        ...form,
        available_sizes: strToArray(rawSizes),
        sleeve_types: strToArray(rawSleeves),
        colors: strToArray(rawColors),
        image_urls: [...form.image_urls, ...uploadedUrls],
      };

      if (editTarget) {
        await updatePOProduct(editTarget.id, finalProduct);
      } else {
        // Menyisipkan po_setting_id ke produk baru menggunakan keyword 'any' agar tidak error TypeScript
        await createPOProduct({ ...finalProduct, po_setting_id: poId } as any);
      }

      if (pendingDeleteUrls.length > 0) {
        await deleteProductImages(pendingDeleteUrls);
      }
    } catch (err) {
      console.error(err);
      notify("Terjadi kesalahan saat menyimpan data.");
    } finally {
      setSaving(false);
      setShowForm(false);
      load();
    }
  }

  async function handleToggle(id: string, current: boolean) {
    await togglePOProductActive(id, !current);
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, is_active: !current } : p)),
    );
  }

  async function handleDelete(id: string, name: string) {
    if (!(await confirmAsync(`Hapus produk "${name}"?`))) return;
    await deletePOProduct(id);
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-40">
        <div className="w-6 h-6 border-4 border-[#49bfb4] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 md:p-6 lg:p-8 w-full">
        <div className="flex items-start gap-4 mb-8">
          <button
            onClick={() => {
              setPendingDeleteUrls([]);
              setShowForm(false);
            }}
            className="p-2 -ml-2 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors duration-150"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500 mb-1">
              {editTarget ? "Edit" : "Baru"}
            </p>
            <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {editTarget ? editTarget.name : "Tambah Produk"}
            </h2>
          </div>
        </div>

        <div className="space-y-4 md:space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Kode Produk *">
              <input
                type="text"
                value={form.product_code}
                onChange={(e) =>
                  setForm({ ...form, product_code: e.target.value })
                }
                placeholder="KAO-001"
                className={inputCls}
              />
            </Field>
            <Field label="Urutan Tampil">
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) =>
                  setForm({ ...form, sort_order: Number(e.target.value) })
                }
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Kategori Produk *">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setForm({ ...form, category: "dewasa" })}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-md border text-sm font-semibold transition-colors duration-150 ${
                  form.category === "dewasa"
                    ? "border-[#49bfb4] bg-[#49bfb4]/10 text-[#49bfb4]"
                    : "border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                }`}
              >
                Dewasa / Umum
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, category: "kids" })}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-md border text-sm font-semibold transition-colors duration-150 ${
                  form.category === "kids"
                    ? "border-[#49bfb4] bg-[#49bfb4]/10 text-[#49bfb4]"
                    : "border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                }`}
              >
                Anak-anak
              </button>
            </div>
          </Field>
          <Field label="Jenis Garmen *" hint="(untuk rekap belanja bahan)">
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { value: "kaos_dewasa", label: "Kaos Dewasa" },
                  { value: "kaos_kids", label: "Kaos Kids" },
                  { value: "sweater", label: "Sweater" },
                  { value: "hoodie", label: "Hoodie" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm({ ...form, garment_type: opt.value })}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-md border text-sm font-semibold transition-colors duration-150 ${
                    form.garment_type === opt.value
                      ? "border-[#49bfb4] bg-[#49bfb4]/10 text-[#49bfb4]"
                      : "border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Nama Produk *">
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Kaos Lengan Pendek Combed 30s"
              className={inputCls}
            />
          </Field>
          <Field label="Harga Dasar (Rp) *">
            <input
              type="number"
              value={form.base_price}
              onChange={(e) =>
                setForm({ ...form, base_price: Number(e.target.value) })
              }
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Ukuran" hint="(pisahkan dengan koma)">
              <input
                type="text"
                value={rawSizes}
                onChange={(e) => setRawSizes(e.target.value)}
                placeholder="S, M, L, XL, XXL"
                className={inputCls}
              />
            </Field>
            <Field label="Jenis Lengan" hint="(pisahkan dengan koma)">
              <input
                type="text"
                value={rawSleeves}
                onChange={(e) => setRawSleeves(e.target.value)}
                placeholder="Pendek, Panjang"
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Warna" hint="(pisahkan dengan koma)">
            <input
              type="text"
              value={rawColors}
              onChange={(e) => setRawColors(e.target.value)}
              placeholder="Hitam, Putih, Navy"
              className={inputCls}
            />
          </Field>

          <div className="bg-zinc-50 dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-3">
            <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Biaya Tambahan Tambahan (Surcharge)
            </p>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.enable_xxl_surcharge}
                onChange={(e) =>
                  setForm({ ...form, enable_xxl_surcharge: e.target.checked })
                }
                className="w-4 h-4 accent-[#49bfb4]"
              />
              <span className="text-sm text-zinc-600 dark:text-zinc-300">
                Aktifkan biaya tambahan untuk size XXL (Kaos Dewasa)
              </span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.enable_sleeve_surcharge}
                onChange={(e) =>
                  setForm({
                    ...form,
                    enable_sleeve_surcharge: e.target.checked,
                  })
                }
                className="w-4 h-4 accent-[#49bfb4]"
              />
              <span className="text-sm text-zinc-600 dark:text-zinc-300">
                Aktifkan biaya tambahan untuk Lengan Panjang (Kaos)
              </span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.enable_sweater_xxl_surcharge}
                onChange={(e) =>
                  setForm({
                    ...form,
                    enable_sweater_xxl_surcharge: e.target.checked,
                  })
                }
                className="w-4 h-4 accent-[#49bfb4]"
              />
              <span className="text-sm text-zinc-600 dark:text-zinc-300">
                Aktifkan biaya tambahan untuk size XXL (Sweater/Hoodie)
              </span>
            </label>
          </div>

          <Field label="Deskripsi">
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              rows={3}
              className={inputCls}
            />
          </Field>

          <div className="pt-2">
            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 block mb-2">
              Foto Produk
            </label>
            <div className="relative border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl p-8 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors duration-150 flex flex-col items-center justify-center gap-2 overflow-hidden">
              <div className="w-12 h-12 rounded-full bg-[#49bfb4]/10 text-[#49bfb4] flex items-center justify-center">
                <UploadCloud size={24} />
              </div>
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mt-2">
                Klik atau Drag gambar ke sini
              </p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 text-center max-w-xs">
                (Direkomendasikan max 2MB)
              </p>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>

            {(form.image_urls.length > 0 || previewUrls.length > 0) && (
              <div className="flex flex-wrap gap-3 mt-4">
                {form.image_urls.map((url, i) => (
                  <div key={`old-${i}`} className="relative w-20 h-20 group">
                    <img
                      src={url}
                      alt={`Saved ${i}`}
                      className="w-full h-full object-cover rounded-lg border border-zinc-200 dark:border-zinc-800"
                    />
                    <button
                      onClick={() => removeOldImage(i)}
                      className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 hover:bg-red-700 transition-colors duration-150"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {previewUrls.map((url, i) => (
                  <div key={`new-${i}`} className="relative w-20 h-20 group">
                    <img
                      src={url}
                      alt={`New ${i}`}
                      className="w-full h-full object-cover rounded-lg border-2 border-[#49bfb4]"
                    />
                    <span className="absolute bottom-1 right-1 font-mono text-[8px] font-semibold px-1.5 py-0.5 rounded-full border border-zinc-300/70 dark:border-zinc-700 bg-white/80 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300">
                      BARU
                    </span>
                    <button
                      onClick={() => removeNewImage(i)}
                      className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 hover:bg-red-700 transition-colors duration-150"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setForm({ ...form, is_active: !form.is_active })}
                className={`relative w-10 h-5 rounded-full transition-colors duration-150 cursor-pointer ${form.is_active ? "bg-[#49bfb4]" : "bg-zinc-300 dark:bg-zinc-600"}`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 bg-white rounded-full ${form.is_active ? "translate-x-5" : "translate-x-0.5"}`}
                />
              </div>
              <span className="text-sm text-zinc-700 dark:text-zinc-300 font-medium">
                Produk aktif (tampil di katalog)
              </span>
            </label>
          </div>

          <div className="flex flex-col-reverse md:flex-row gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
            <button
              onClick={() => {
                setPendingDeleteUrls([]);
                setShowForm(false);
              }}
              className="w-full md:w-auto px-6 py-3 border border-zinc-200 dark:border-zinc-700 rounded-md font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors duration-150"
            >
              Batal
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full md:flex-1 bg-[#124540] hover:bg-[#0d332f] text-white px-6 py-3 rounded-md font-semibold transition-colors duration-150 disabled:opacity-50"
            >
              {saving ? "Menyimpan..." : "Simpan Produk"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 md:p-6">
        <div>
          <h2 className="text-lg md:text-xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Katalog Produk
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            <span className="font-mono tabular-nums">{products.length}</span>{" "}
            produk terdaftar dalam katalog
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {countOldImages(products) > 0 && (
            <button
              onClick={handleOptimizeOld}
              disabled={optimizing}
              className="w-full sm:w-auto flex items-center justify-center gap-2 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-wait px-4 py-2.5 rounded-md text-sm font-semibold transition-colors duration-150"
            >
              {optimizing
                ? `Mengoptimasi ${optProgress.done}/${optProgress.total}...`
                : `Optimasi ${countOldImages(products)} Foto Lama`}
            </button>
          )}
          <button
            onClick={openCreate}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#124540] hover:bg-[#0d332f] text-white px-5 py-2.5 rounded-md text-sm font-semibold transition-colors duration-150"
          >
            <Plus size={16} /> Tambah Produk
          </button>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="bg-zinc-50 dark:bg-zinc-900 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl p-12 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-white dark:bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400 mb-4">
            <ImageOff size={24} />
          </div>
          <h3 className="font-semibold text-zinc-700 dark:text-zinc-200 mb-1">
            Belum ada produk
          </h3>
          <p className="text-sm text-zinc-500 mb-6 max-w-sm">
            Katalog masih kosong. Tambahkan produk pertama Anda untuk mulai
            menerima pesanan.
          </p>
          <button
            onClick={openCreate}
            className="text-sm font-semibold text-[#49bfb4] hover:underline"
          >
            + Tambah Produk Sekarang
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {products.map((p) => (
            <div
              key={p.id}
              className={`flex flex-col sm:flex-row gap-4 p-5 border rounded-xl bg-white dark:bg-zinc-950 transition-colors duration-150 ${!p.is_active ? "border-zinc-200 dark:border-zinc-800 opacity-60" : "border-zinc-200 dark:border-zinc-800"}`}
            >
              <div className="w-full sm:w-28 h-48 sm:h-28 rounded-xl bg-zinc-100 dark:bg-zinc-800 shrink-0 overflow-hidden relative">
                {p.image_urls && p.image_urls.length > 0 ? (
                  <img
                    src={thumbUrl(p.image_urls[0])}
                    onError={fallbackToOriginal(p.image_urls[0])}
                    alt={p.name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400">
                    <ImageOff size={20} className="mb-1 opacity-50" />
                    <span className="text-[9px] font-semibold uppercase">
                      No Image
                    </span>
                  </div>
                )}
                {!p.is_active && (
                  <div className="absolute inset-0 bg-zinc-900/40 flex items-center justify-center">
                    <span className="font-mono bg-zinc-900 text-white text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md">
                      NONAKTIF
                    </span>
                  </div>
                )}
              </div>
              <div className="flex-1 flex flex-col sm:flex-row sm:items-start justify-between min-w-0">
                <div className="flex-1 min-w-0 pr-0 sm:pr-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-mono tabular-nums text-[11px] font-semibold px-2.5 py-1 rounded-full border border-zinc-300/70 dark:border-zinc-700 bg-white/80 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300">
                      {p.product_code}
                    </span>
                    {!p.is_active && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                        Nonaktif
                      </span>
                    )}
                  </div>
                  <h3
                    className="font-semibold text-zinc-800 dark:text-zinc-100 truncate mb-1"
                    title={p.name}
                  >
                    {p.name}
                  </h3>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 truncate">
                    {p.available_sizes.join(", ")} • {p.colors.length} Warna
                  </div>
                  <p className="font-mono tabular-nums text-lg font-semibold text-[#49bfb4] mt-auto">
                    {formatRupiah(p.base_price)}
                  </p>
                </div>
                <div className="grid grid-cols-3 sm:flex gap-2 sm:gap-1.5 shrink-0 w-full sm:w-auto mt-2 sm:mt-0 pt-3 sm:pt-0 border-t sm:border-0 border-zinc-100 dark:border-zinc-800">
                  <button
                    onClick={() => handleToggle(p.id, p.is_active)}
                    className="text-xs border border-zinc-200 dark:border-zinc-700 px-3 py-2 sm:py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-semibold transition-colors duration-150"
                  >
                    {p.is_active ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                  <button
                    onClick={() => openEdit(p)}
                    className="text-xs border border-zinc-200 dark:border-zinc-700 px-3 py-2 sm:py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-semibold transition-colors duration-150"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(p.id, p.name)}
                    className="text-xs border border-red-200 dark:border-red-900/50 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-2 sm:py-1.5 rounded-md font-semibold transition-colors duration-150"
                  >
                    Hapus
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
