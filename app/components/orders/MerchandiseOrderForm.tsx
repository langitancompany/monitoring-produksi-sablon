// app/components/orders/MerchandiseOrderForm.tsx
//
// Form pesanan MERCHANDISE (lanyard, totebag, gantungan kunci, dst.) — dipakai
// untuk Buat (tanpa prop `order`) dan Edit (dengan prop `order`), jadi tampilan
// keduanya selalu sama. Tata letak dan gaya mengikuti CreateOrder.tsx.
//
// Isian: detail pelanggan, jenis merchandise (+ varian bila produknya punya),
// jumlah, deadline, PJ & helper, catatan tambahan.
// Daftar produk & variasi diatur di MERCHANDISE_PRODUCTS (types/index.ts).

import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { Order, UserData, MERCHANDISE_PRODUCTS } from "@/types";
import { hasRole, getUserRoles } from "@/lib/roles";
import { toLocalISODate } from "@/lib/utils";

// Lama pengerjaan standar (hari) untuk mengisi deadline default saat Buat.
const DEFAULT_DEADLINE_DAYS = 3;

interface MerchandiseOrderFormProps {
  /** Ada = mode Edit. Tidak ada = mode Buat. */
  order?: Order;
  users: UserData[];
  onCancel: () => void;
  onSubmit: (data: any) => void | Promise<void>;
  isSubmitting?: boolean; // loading (spinner) di tombol Simpan / Update
}

export default function MerchandiseOrderForm({
  order,
  users,
  onCancel,
  onSubmit,
  isSubmitting = false,
}: MerchandiseOrderFormProps) {
  const isEdit = !!order;

  const [form, setForm] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + DEFAULT_DEADLINE_DAYS);
    return {
      nama: order?.nama_pemesan ?? "",
      hp: order?.no_hp ?? "",
      alamat_pemesan: order?.alamat_pemesan || "",
      jenis_merchandise: order?.jenis_merchandise || "",
      varian_merchandise: order?.varian_merchandise || "",
      // disimpan sebagai teks supaya kolom boleh dikosongkan saat mengetik
      jumlah: order?.jumlah ? String(order.jumlah) : "",
      assigned_to: order?.assigned_to || "",
      helper_id: order?.helper_id || "",
      deadline: order?.deadline || toLocalISODate(d),
      catatan_pesanan: order?.catatan_pesanan || "",
    };
  });

  // Hanya user yang SEMATA-MATA QC yang dikecualikan dari pilihan PJ/Helper
  // (sama seperti CreateOrder); user ber-role ganda tetap boleh dipilih.
  const picUsers = users.filter(
    (u) => !(hasRole(u, "qc") && getUserRoles(u).length === 1),
  );

  // Pesanan lama bisa memakai produk/varian yang sudah dihapus dari daftar —
  // tetap tampilkan agar dropdown tidak kosong & data tidak hilang diam-diam.
  const productOptions = MERCHANDISE_PRODUCTS.some(
    (p) => p.value === form.jenis_merchandise,
  ) || !form.jenis_merchandise
    ? MERCHANDISE_PRODUCTS
    : [
        ...MERCHANDISE_PRODUCTS,
        {
          value: form.jenis_merchandise,
          label: `${form.jenis_merchandise} (tidak ada di daftar)`,
          variants: [],
        },
      ];
  const selectedProduct = productOptions.find(
    (p) => p.value === form.jenis_merchandise,
  );
  const baseVariants = selectedProduct?.variants ?? [];
  const variantOptions =
    form.varian_merchandise &&
    !baseVariants.some((v) => v.value === form.varian_merchandise)
      ? [
          ...baseVariants,
          {
            value: form.varian_merchandise,
            label: `${form.varian_merchandise} (tidak ada di daftar)`,
          },
        ]
      : baseVariants;
  const hasVariants = variantOptions.length > 0;

  // Produk dikunci bila produksi sudah berjalan (langkah produksi disalin dari
  // template produk saat pesanan dibuat; mengganti produk akan mengacaukannya).
  const productLocked =
    isEdit && (order?.steps_merchandise ?? []).some((st) => st.isCompleted);

  const jumlahNumber = parseInt(form.jumlah, 10) || 0;

  const isDisabled =
    !form.nama.trim() ||
    !form.hp.trim() ||
    !form.deadline ||
    !form.jenis_merchandise ||
    (hasVariants && !form.varian_merchandise) ||
    jumlahNumber <= 0 ||
    !form.assigned_to;

  // Normalisasi nomor HP ke format WA internasional (tanpa + atau spasi)
  const normalizePhone = (raw: string): string => {
    const cleaned = raw.replace(/[^\d+]/g, "");
    if (cleaned.startsWith("+")) return cleaned.slice(1);
    if (cleaned.startsWith("0")) return "62" + cleaned.slice(1);
    return cleaned;
  };

  const handleHpBlur = () => {
    if (!form.hp) return;
    setForm((f) => ({ ...f, hp: normalizePhone(f.hp) }));
  };

  const handleSubmit = () => {
    if (isDisabled || isSubmitting) return;
    onSubmit({ ...form, jumlah: jumlahNumber });
  };

  const LABEL =
    "block text-[10px] md:text-xs font-semibold text-zinc-700 dark:text-zinc-400 uppercase mb-1 md:mb-1.5";
  const OPT = "normal-case font-normal text-zinc-400";
  const INPUT =
    "w-full border border-zinc-200 dark:border-zinc-700 p-2 md:p-2.5 rounded-md focus:ring-2 focus:ring-[#124540] outline-none font-medium bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm placeholder-zinc-400 dark:placeholder-zinc-500";
  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  // Textarea berisi data lama (mode Edit) perlu dihitung tingginya sejak render pertama.
  const autoGrowRef = (el: HTMLTextAreaElement | null) => {
    if (el) autoGrow(el);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 flex flex-col bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        {/* Header */}
        <div className="px-5 md:px-8 py-3 md:py-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
          <h2 className="font-semibold text-lg md:text-xl text-zinc-900 dark:text-white">
            {isEdit ? "Edit Pesanan Merchandise" : "Buat Pesanan Merchandise"}
          </h2>
          {isEdit && (
            <p className="text-xs text-zinc-400 mt-0.5">{order?.kode_produksi}</p>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
          <div className="grid grid-cols-12 gap-3 md:gap-4 items-start">
            {/* ── Baris 1: Nama · No HP · Alamat ── */}
            <div className="col-span-12 md:col-span-4">
              <label className={LABEL}>Nama Pemesan</label>
              <input
                className={INPUT}
                placeholder="Masukkan nama pemesan"
                value={form.nama}
                onChange={(e) => setForm({ ...form, nama: e.target.value })}
              />
            </div>
            <div className="col-span-12 sm:col-span-6 md:col-span-3">
              <label className={LABEL}>No HP</label>
              <input
                className={INPUT}
                placeholder="08xx / +62xx"
                value={form.hp}
                onChange={(e) => setForm({ ...form, hp: e.target.value })}
                onBlur={handleHpBlur}
              />
            </div>
            <div className="col-span-12 sm:col-span-6 md:col-span-5">
              <label className={LABEL}>
                Alamat <span className={OPT}>(Opsional, untuk Label Kirim)</span>
              </label>
              <textarea
                ref={autoGrowRef}
                rows={1}
                className={`${INPUT} resize-none overflow-hidden`}
                placeholder="Alamat lengkap pengiriman..."
                value={form.alamat_pemesan}
                onChange={(e) => {
                  setForm({ ...form, alamat_pemesan: e.target.value });
                  autoGrow(e.currentTarget);
                }}
              />
            </div>

            {/* ── Baris 2: Jenis Merchandise · Varian · Jumlah ── */}
            <div className="col-span-12 sm:col-span-4">
              <label className={LABEL}>
                Jenis Merchandise <span className="text-red-500">(Wajib)</span>
              </label>
              <select
                className={`${INPUT} disabled:opacity-60 disabled:cursor-not-allowed`}
                value={form.jenis_merchandise}
                disabled={productLocked}
                onChange={(e) =>
                  // ganti produk → varian direset (tiap produk punya variasi sendiri)
                  setForm({
                    ...form,
                    jenis_merchandise: e.target.value,
                    varian_merchandise: "",
                  })
                }
              >
                <option value="" className="dark:bg-zinc-800">
                  Pilih jenis merchandise
                </option>
                {productOptions.map((p) => (
                  <option
                    key={p.value}
                    value={p.value}
                    className="dark:bg-zinc-800"
                  >
                    {p.label}
                  </option>
                ))}
              </select>
              {productLocked && (
                <p className="text-[10px] text-zinc-400 mt-1">
                  Produksi sudah berjalan, jenis tidak bisa diganti.
                </p>
              )}
            </div>
            {hasVariants && (
              <div className="col-span-12 sm:col-span-4">
                <label className={LABEL}>
                  Varian <span className="text-red-500">(Wajib)</span>
                </label>
                <select
                  className={INPUT}
                  value={form.varian_merchandise}
                  onChange={(e) =>
                    setForm({ ...form, varian_merchandise: e.target.value })
                  }
                >
                  <option value="" className="dark:bg-zinc-800">
                    Pilih varian
                  </option>
                  {variantOptions.map((v) => (
                    <option
                      key={v.value}
                      value={v.value}
                      className="dark:bg-zinc-800"
                    >
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="col-span-12 sm:col-span-4">
              <label className={LABEL}>
                Jumlah (pcs) <span className="text-red-500">(Wajib)</span>
              </label>
              <input
                inputMode="numeric"
                className={INPUT}
                placeholder="mis. 100"
                value={form.jumlah}
                onChange={(e) =>
                  setForm({ ...form, jumlah: e.target.value.replace(/\D/g, "") })
                }
              />
            </div>

            {/* ── Baris 3: Deadline · PJ · Helper ── */}
            <div className="col-span-12 sm:col-span-4">
              <label className={LABEL}>Deadline</label>
              <input
                type="date"
                className={INPUT}
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              />
            </div>
            <div className="col-span-12 sm:col-span-4">
              <label className="block text-[10px] md:text-xs font-semibold text-[#124540] dark:text-[#42938b] uppercase mb-1 md:mb-1.5">
                Penanggung Jawab <span className="text-red-500">(Wajib)</span>
              </label>
              <select
                className={INPUT}
                value={form.assigned_to}
                onChange={(e) =>
                  setForm({ ...form, assigned_to: e.target.value })
                }
              >
                <option value="" className="dark:bg-zinc-800">
                  Pilih PIC Produksi
                </option>
                {picUsers.map((user) => (
                  <option
                    key={user.id}
                    value={user.id}
                    className="dark:bg-zinc-800"
                  >
                    {user.name} ({user.role})
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-12 sm:col-span-4">
              <label className="block text-[10px] md:text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase mb-1 md:mb-1.5">
                Helper <span className={OPT}>(Opsional)</span>
              </label>
              <select
                className={INPUT}
                value={form.helper_id}
                onChange={(e) =>
                  setForm({ ...form, helper_id: e.target.value })
                }
              >
                <option value="" className="dark:bg-zinc-800">
                  -- Tidak Ada Helper --
                </option>
                {picUsers.map((user) => (
                  <option
                    key={user.id}
                    value={user.id}
                    className="dark:bg-zinc-800"
                  >
                    {user.name} ({user.role})
                  </option>
                ))}
              </select>
            </div>

            {/* ── Baris 4: Catatan Tambahan ── */}
            <div className="col-span-12">
              <label className={LABEL}>
                Catatan Tambahan <span className={OPT}>(Opsional)</span>
              </label>
              <textarea
                ref={autoGrowRef}
                rows={2}
                className={`${INPUT} resize-none overflow-hidden`}
                placeholder="mis. Warna, ukuran, bahan, permintaan khusus customer..."
                value={form.catatan_pesanan}
                onChange={(e) => {
                  setForm({ ...form, catatan_pesanan: e.target.value });
                  autoGrow(e.currentTarget);
                }}
              />
            </div>
          </div>
        </div>

        {/* Footer aksi — selalu terlihat */}
        <div className="shrink-0 border-t border-zinc-100 dark:border-zinc-800 px-4 md:px-6 py-3 flex gap-3 md:justify-end">
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 md:flex-none md:min-w-[140px] border border-zinc-200 dark:border-zinc-700 py-2 md:py-2.5 rounded-md font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 text-sm"
          >
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={isDisabled || isSubmitting}
            className="flex-1 md:flex-none md:min-w-[160px] bg-[#124540] text-white py-2 md:py-2.5 rounded-md font-semibold hover:bg-[#0d332f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 text-sm flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />{" "}
                {isEdit ? "Mengupdate..." : "Menyimpan..."}
              </>
            ) : isEdit ? (
              "Update"
            ) : (
              "Simpan"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
