"use client";

import { useMarkPODataStaleOnLeave } from "./POAdminDataContext";
import { useDialog } from "@/app/components/ui/DialogProvider";
import { useEffect, useState } from "react";
import { getPOSettingAdmin, updatePOSetting } from "@/lib/po/admin";
import { formatRupiah } from "@/lib/po/pricing";
import { POSetting } from "@/types/po";
import { createClient } from "@/lib/supabase/client";
import {
  ToggleLeft,
  ToggleRight,
  Tag,
  CalendarDays,
  CirclePlus,
  Phone,
  Landmark,
  Clock,
  CheckCircle2,
  XCircle,
  QrCode,
  Upload,
  Trash2,
  ImageIcon,
  Loader2,
  Save,
  Link as LinkIcon,
  Store,
  MapPin,
} from "lucide-react";

/* ── Reusable field wrapper ──────────────────────────────────────── */
function Field({
  label,
  icon: Icon,
  hint,
  children,
}: {
  label: string;
  icon: React.ElementType;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-full">
      <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">
        <Icon size={11} />
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1.5">
          {hint}
        </p>
      )}
    </div>
  );
}

/* ── Section header ──────────────────────────────────────────────── */
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500 pt-2 pb-1 border-t border-zinc-200 dark:border-zinc-800">
      {children}
    </p>
  );
}

const INPUT =
  "w-full border border-zinc-300 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 hover:border-[#49bfb4]/50 focus:outline-none focus:ring-2 focus:ring-[#49bfb4] focus:border-[#49bfb4] transition-colors duration-150";

// Tambahkan ini di POSettings.tsx
interface POSettingsProps {
  poId: string;
}
export default function POSettings({ poId }: POSettingsProps) {
  const { notify, confirmAsync } = useDialog();
  useMarkPODataStaleOnLeave();
  const [setting, setSetting] = useState<POSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingQris, setUploadingQris] = useState(false);
  const [qrisPreview, setQrisPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const [form, setForm] = useState({
    is_active: false,
    title: "",
    url_slug: "",
    periode_mulai: "",
    periode_selesai: "",
    sleeve_surcharge: 0,
    xxl_surcharge: 0,
    sweater_xxl_surcharge: 0,
    wa_admin_phone: "",
    bank_account_info: "",
  });
  // Identitas toko (invoice & resi) dipisah dari `form` supaya tidak ikut
  // terkirim ke database kalau kolomnya belum dibuat (lihat SQL migrasi).
  const [storeForm, setStoreForm] = useState({
    store_name: "",
    store_address: "",
  });

  // ✅ Semua useEffect di atas, sebelum early return apapun
  useEffect(() => {
    async function load() {
      const data = await getPOSettingAdmin(poId);
      if (data) {
        setSetting(data);
        setForm({
          is_active: data.is_active,
          title: data.title || "",
          url_slug: data.url_slug || "",
          periode_mulai: data.periode_mulai || "",
          periode_selesai: data.periode_selesai || "",
          sleeve_surcharge: data.sleeve_surcharge,
          xxl_surcharge: data.xxl_surcharge,
          sweater_xxl_surcharge: data.sweater_xxl_surcharge ?? 0,
          wa_admin_phone: data.wa_admin_phone || "",
          bank_account_info: data.bank_account_info || "",
        });
        setStoreForm({
          store_name: data.store_name || "",
          store_address: data.store_address || "",
        });
        // ✅ Set preview QRIS langsung di sini, tidak perlu useEffect terpisah
        if (data.qris_image_url) {
          setQrisPreview(data.qris_image_url);
        }
        if (data.logo_image_url) {
          setLogoPreview(data.logo_image_url);
        }
      }
      setLoading(false);
    }
    load();
  }, [poId]);

  async function handleSave() {
    if (!setting) return;
    setSaving(true);

    const result = await updatePOSetting(setting.id, {
      ...form,
      periode_mulai: form.periode_mulai || undefined,
      periode_selesai: form.periode_selesai || undefined,
      wa_admin_phone: form.wa_admin_phone || undefined,
      bank_account_info: form.bank_account_info || undefined,
      // Kirim hanya kalau kolomnya sudah ada di database, atau admin
      // memang mengisi nilainya. Kosong = pakai default di kode.
      ...(("store_name" in setting || storeForm.store_name.trim()) && {
        store_name: storeForm.store_name.trim() || null,
      }),
      ...(("store_address" in setting || storeForm.store_address.trim()) && {
        store_address: storeForm.store_address.trim() || null,
      }),
    });

    setSaving(false);
    if (result.success) {
      notify("Pengaturan berhasil disimpan.");
    } else {
      notify("Gagal: " + result.error);
    }
  }

  async function handleQrisUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !setting) return;

    if (!file.type.startsWith("image/")) {
      notify("Hanya file gambar yang diizinkan.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      notify("Ukuran file maksimal 2MB.");
      return;
    }

    setUploadingQris(true);
    const supabase = createClient();

    // Hapus gambar lama jika ada
    if (setting.qris_image_url) {
      const oldPath = setting.qris_image_url.split("/po_assets/")[1];
      if (oldPath) {
        await supabase.storage.from("po_assets").remove([oldPath]);
      }
    }

    // Upload gambar baru
    const ext = file.name.split(".").pop();
    const filePath = `qris/qris-${setting.id}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("po_assets")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      notify("Gagal upload: " + uploadError.message);
      setUploadingQris(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("po_assets")
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl;

    const { error: dbError } = await supabase
      .from("po_setting")
      .update({ qris_image_url: publicUrl })
      .eq("id", setting.id);

    if (dbError) {
      notify("Gagal simpan URL: " + dbError.message);
    } else {
      setQrisPreview(publicUrl);
      setSetting({ ...setting, qris_image_url: publicUrl });
    }

    setUploadingQris(false);
  }

  async function handleQrisDelete() {
    if (!setting?.qris_image_url) return;
    if (!(await confirmAsync("Hapus gambar QRIS?"))) return;

    const supabase = createClient();
    const oldPath = setting.qris_image_url.split("/po_assets/")[1];

    if (oldPath) {
      await supabase.storage.from("po_assets").remove([oldPath]);
    }

    await supabase
      .from("po_setting")
      .update({ qris_image_url: null })
      .eq("id", setting.id);

    setQrisPreview(null);
    setSetting({ ...setting, qris_image_url: null });
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !setting) return;

    if (!file.type.startsWith("image/")) {
      notify("Hanya file gambar yang diizinkan.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      notify("Ukuran file maksimal 2MB.");
      return;
    }

    setUploadingLogo(true);
    const supabase = createClient();

    // Hapus logo lama jika ada
    if (setting.logo_image_url) {
      const oldPath = setting.logo_image_url.split("/po_assets/")[1];
      if (oldPath) {
        await supabase.storage.from("po_assets").remove([oldPath]);
      }
    }

    // Upload logo baru
    const ext = file.name.split(".").pop();
    const filePath = `logo/logo-${setting.id}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("po_assets")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      notify("Gagal upload: " + uploadError.message);
      setUploadingLogo(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("po_assets")
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl;

    const { error: dbError } = await supabase
      .from("po_setting")
      .update({ logo_image_url: publicUrl })
      .eq("id", setting.id);

    if (dbError) {
      notify("Gagal simpan URL: " + dbError.message);
    } else {
      setLogoPreview(publicUrl);
      setSetting({ ...setting, logo_image_url: publicUrl });
    }

    setUploadingLogo(false);
  }

  async function handleLogoDelete() {
    if (!setting?.logo_image_url) return;
    if (!(await confirmAsync("Hapus logo toko?"))) return;

    const supabase = createClient();
    const oldPath = setting.logo_image_url.split("/po_assets/")[1];

    if (oldPath) {
      await supabase.storage.from("po_assets").remove([oldPath]);
    }

    await supabase
      .from("po_setting")
      .update({ logo_image_url: null })
      .eq("id", setting.id);

    setLogoPreview(null);
    setSetting({ ...setting, logo_image_url: null });
  }

  // ✅ Early return SETELAH semua hooks
  if (loading) {
    return (
      <div className="flex items-center gap-3 py-8 text-zinc-400 dark:text-zinc-500">
        <Clock size={16} className="animate-pulse" />
        <span className="text-sm">Memuat pengaturan...</span>
      </div>
    );
  }

  if (!setting) {
    return (
      <div className="flex items-center gap-3 py-8 text-red-400">
        <XCircle size={16} />
        <span className="text-sm">Setting tidak ditemukan di database.</span>
      </div>
    );
  }

  return (
    <div className="w-full space-y-5 md:space-y-6">
      {/* ── Status Toggle ─────────────────────────────────────────── */}
      <div
        className={`flex items-center justify-between gap-4 rounded-xl border p-5 transition-colors duration-150 ${form.is_active ? "border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900"}`}
      >
        <div className="flex items-center gap-3">
          {form.is_active ? (
            <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
          ) : (
            <XCircle size={18} className="text-zinc-400 shrink-0" />
          )}
          <div>
            <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
              Status PO
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {form.is_active
                ? "PO sedang aktif — publik bisa memesan"
                : "PO nonaktif — form pemesanan ditutup"}
            </p>
          </div>
        </div>
        <button
          onClick={() => setForm({ ...form, is_active: !form.is_active })}
          className="shrink-0 transition-colors duration-150"
          aria-label="Toggle status PO"
        >
          {form.is_active ? (
            <ToggleRight size={36} className="text-emerald-500" />
          ) : (
            <ToggleLeft
              size={36}
              className="text-zinc-300 dark:text-zinc-600"
            />
          )}
        </button>
      </div>

      <SectionHeading>Identitas Toko</SectionHeading>
      <Field
        label="Kop Toko"
        icon={ImageIcon}
        hint="Dipakai di header resi cetak (A6 & A4/PDF). Rasio gambar 1:15. Maks. 2MB."
      >
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          {/* Preview */}
          <div className="w-40 h-25 rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 flex items-center justify-center overflow-hidden bg-zinc-50 dark:bg-zinc-900 shrink-0">
            {logoPreview ? (
              <img
                src={logoPreview}
                alt="Logo Toko"
                className="w-full h-full object-contain p-2"
              />
            ) : (
              <div className="text-center text-zinc-400 dark:text-zinc-500">
                <ImageIcon size={28} className="mx-auto mb-1" />
                <p className="text-[11px]">Belum ada logo</p>
              </div>
            )}
          </div>

          {/* Tombol aksi */}
          <div className="flex flex-col gap-2">
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoUpload}
                disabled={uploadingLogo}
              />
              <span
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-md border text-sm font-semibold transition-colors duration-150 ${
                  uploadingLogo
                    ? "bg-zinc-100 dark:bg-zinc-900 text-zinc-400 border-zinc-200 dark:border-zinc-800 cursor-not-allowed"
                    : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-[#49bfb4] hover:text-[#49bfb4] cursor-pointer"
                }`}
              >
                {uploadingLogo ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Mengupload...
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    {logoPreview ? "Ganti Kop" : "Upload Kop"}
                  </>
                )}
              </span>
            </label>

            {logoPreview && (
              <button
                onClick={handleLogoDelete}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors duration-150"
              >
                <Trash2 size={14} />
                Hapus Kop
              </button>
            )}

            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 max-w-[200px]">
              Format: JPG, PNG, atau WebP. Upload langsung tersimpan otomatis.
            </p>
          </div>
        </div>
      </Field>

      <SectionHeading>Informasi Kampanye</SectionHeading>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-5">
        <Field label="Judul PO" icon={Tag}>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="PO Kaos Langitan Vol. 1"
            className={INPUT}
          />
        </Field>
        <Field
          label="Nama Link Katalog"
          icon={LinkIcon}
          hint="Contoh hasil: website.com/po/katalog-merch"
        >
          <div className="flex items-center">
            <span className="px-3 py-2.5 bg-zinc-100 dark:bg-zinc-900 border border-r-0 border-zinc-200 dark:border-zinc-800 rounded-l-md text-zinc-500 dark:text-zinc-400 text-sm font-mono">
              /po/
            </span>
            <input
              type="text"
              value={form.url_slug}
              onChange={(e) =>
                setForm({
                  ...form,
                  url_slug: e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, "-"),
                })
              }
              className={INPUT + " rounded-l-none"}
              placeholder="katalog-merch"
            />
          </div>
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-5">
        <Field label="Tanggal Mulai" icon={CalendarDays}>
          <input
            type="date"
            value={form.periode_mulai}
            onChange={(e) =>
              setForm({ ...form, periode_mulai: e.target.value })
            }
            className={INPUT}
          />
        </Field>
        <Field label="Tanggal Selesai" icon={CalendarDays}>
          <input
            type="date"
            value={form.periode_selesai}
            onChange={(e) =>
              setForm({ ...form, periode_selesai: e.target.value })
            }
            className={INPUT}
          />
        </Field>
      </div>

      <SectionHeading>Harga Tambahan</SectionHeading>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-5">
        <Field
          label="Tambahan Lengan Panjang (Rp)"
          icon={CirclePlus}
          hint={
            form.sleeve_surcharge > 0
              ? `+${formatRupiah(form.sleeve_surcharge)} untuk pilihan lengan panjang`
              : undefined
          }
        >
          <input
            type="number"
            value={form.sleeve_surcharge}
            onChange={(e) =>
              setForm({ ...form, sleeve_surcharge: Number(e.target.value) })
            }
            className={INPUT}
          />
        </Field>
        <Field
          label="Tambahan per Tingkat XXL (Rp)"
          icon={CirclePlus}
          hint={
            form.xxl_surcharge > 0 ? (
              <span>
                2XL +{formatRupiah(form.xxl_surcharge)}&nbsp;·&nbsp;3XL +
                {formatRupiah(form.xxl_surcharge * 2)}&nbsp;dst.
              </span>
            ) : undefined
          }
        >
          <input
            type="number"
            value={form.xxl_surcharge}
            onChange={(e) =>
              setForm({ ...form, xxl_surcharge: Number(e.target.value) })
            }
            className={INPUT}
          />
        </Field>
        <Field
          label="Tambahan Sweater Size 2XL+ (Rp)"
          icon={CirclePlus}
          hint={
            form.sweater_xxl_surcharge > 0 ? (
              <span>
                2XL +{formatRupiah(form.sweater_xxl_surcharge)}&nbsp;·&nbsp;3XL
                +{formatRupiah(form.sweater_xxl_surcharge * 2)}&nbsp;dst.
              </span>
            ) : undefined
          }
        >
          <input
            type="number"
            value={form.sweater_xxl_surcharge}
            onChange={(e) =>
              setForm({
                ...form,
                sweater_xxl_surcharge: Number(e.target.value),
              })
            }
            className={INPUT}
          />
        </Field>
      </div>

      <SectionHeading>Kontak &amp; Pembayaran</SectionHeading>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-5">
        <Field
          label="No. WhatsApp Admin"
          icon={Phone}
          hint="Awali dengan 62, bukan 0."
        >
          <input
            type="text"
            value={form.wa_admin_phone}
            onChange={(e) =>
              setForm({ ...form, wa_admin_phone: e.target.value })
            }
            placeholder="628123456789"
            className={INPUT}
          />
        </Field>
        <Field label="Info Rekening Transfer" icon={Landmark}>
          <textarea
            value={form.bank_account_info}
            onChange={(e) =>
              setForm({ ...form, bank_account_info: e.target.value })
            }
            rows={2}
            placeholder="BCA 1234567890 a/n Langitan Store"
            className={`${INPUT} resize-none h-full min-h-20`}
          />
        </Field>
      </div>

      <SectionHeading>Identitas Toko (Invoice &amp; Resi)</SectionHeading>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-5">
        <Field
          label="Nama Toko"
          icon={Store}
          hint="Kosongkan untuk memakai default (Langitan.co)."
        >
          <input
            type="text"
            value={storeForm.store_name}
            onChange={(e) =>
              setStoreForm({ ...storeForm, store_name: e.target.value })
            }
            placeholder="Langitan.co"
            className={INPUT}
          />
        </Field>
        <Field
          label="Alamat Toko"
          icon={MapPin}
          hint="Tampil di kop invoice dan resi. Kosongkan untuk default."
        >
          <textarea
            value={storeForm.store_address}
            onChange={(e) =>
              setStoreForm({ ...storeForm, store_address: e.target.value })
            }
            rows={2}
            placeholder="Mandungan, Widang, Tuban, Jawa Timur"
            className={`${INPUT} resize-none h-full min-h-20`}
          />
        </Field>
      </div>

      <SectionHeading>Pembayaran QRIS</SectionHeading>
      <Field
        label="Gambar QRIS"
        icon={QrCode}
        hint="Gambar akan ditampilkan di halaman konfirmasi pesanan. Maks. 2MB."
      >
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          {/* Preview */}
          <div className="w-40 h-40 rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 flex items-center justify-center overflow-hidden bg-zinc-50 dark:bg-zinc-900 shrink-0">
            {qrisPreview ? (
              <img
                src={qrisPreview}
                alt="QRIS"
                className="w-full h-full object-contain p-2"
              />
            ) : (
              <div className="text-center text-zinc-400 dark:text-zinc-500">
                <ImageIcon size={28} className="mx-auto mb-1" />
                <p className="text-[11px]">Belum ada QRIS</p>
              </div>
            )}
          </div>

          {/* Tombol aksi */}
          <div className="flex flex-col gap-2">
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleQrisUpload}
                disabled={uploadingQris}
              />
              <span
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-md border text-sm font-semibold transition-colors duration-150 ${
                  uploadingQris
                    ? "bg-zinc-100 dark:bg-zinc-900 text-zinc-400 border-zinc-200 dark:border-zinc-800 cursor-not-allowed"
                    : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-[#49bfb4] hover:text-[#49bfb4] cursor-pointer"
                }`}
              >
                {uploadingQris ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Mengupload...
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    {qrisPreview ? "Ganti Gambar" : "Upload QRIS"}
                  </>
                )}
              </span>
            </label>

            {qrisPreview && (
              <button
                onClick={handleQrisDelete}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors duration-150"
              >
                <Trash2 size={14} />
                Hapus QRIS
              </button>
            )}

            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 max-w-[200px]">
              Format: JPG, PNG, atau WebP. Upload langsung tersimpan otomatis.
            </p>
          </div>
        </div>
      </Field>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 bg-[#124540] hover:bg-[#0d332f] text-white py-3 rounded-md font-semibold text-sm disabled:opacity-40 transition-colors duration-150 md:w-auto md:px-8 md:ml-auto"
      >
        <Save size={14} /> {saving ? "Menyimpan..." : "Simpan Semua Pengaturan"}
      </button>

      <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500 md:justify-end">
        <Clock size={11} /> Terakhir diperbarui:{" "}
        <span className="font-mono tabular-nums">
          {new Date(setting.updated_at || new Date()).toLocaleString("id-ID")}
        </span>
      </div>
    </div>
  );
}
