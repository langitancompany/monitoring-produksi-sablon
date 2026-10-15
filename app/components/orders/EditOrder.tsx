// app/components/orders/EditOrder.tsx

import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Order,
  ProductionTypeData,
  UserData,
  GesutEntry,
  JenisAplikasiArt,
  JENIS_APLIKASI_OPTIONS,
  JenisPakaian,
  JENIS_PAKAIAN_OPTIONS,
} from "@/types";
import { hasRole, getUserRoles } from "@/lib/roles";
import MultiSelectDropdown from "./MultiSelectDropdown"; // ── TAMBAHAN ──
import SizeInputForm, { SizeEntry } from "./SizeInputForm";
import GesutInputForm from "./GesutInputForm"; // ── TAMBAHAN ──

interface EditOrderProps {
  order: Order;
  productionTypes: ProductionTypeData[];
  users: UserData[];
  onCancel: () => void;
  onSubmit: (data: any) => void | Promise<void>;
  isSubmitting?: boolean; // ── TAMBAHAN ── loading (spinner) di tombol Update
}

export default function EditOrder({
  order,
  productionTypes,
  users,
  onCancel,
  onSubmit,
  isSubmitting = false,
}: EditOrderProps) {
  const [showSizeForm, setShowSizeForm] = useState(false);
  const [showGesutForm, setShowGesutForm] = useState(false); // ── TAMBAHAN ──

  const [form, setForm] = useState({
    nama: order.nama_pemesan,
    hp: order.no_hp,
    alamat_pemesan: order.alamat_pemesan || "",
    jumlah: order.jumlah || 0,
    detail_ukuran: (order.detail_ukuran as SizeEntry[] | null) ?? null,
    detail_gesut: (order.detail_gesut as GesutEntry | null) ?? null, // ── TAMBAHAN ──
    deadline: order.deadline,
    type: order.jenis_produksi,
    assigned_to: order.assigned_to || "",
    helper_id: order.helper_id || "",
    ukuran_desain_depan: order.ukuran_desain_depan || "", // ── TAMBAHAN ── opsional
    ukuran_desain_belakang: order.ukuran_desain_belakang || "", // ── TAMBAHAN ── opsional
    catatan_pesanan: order.catatan_pesanan || "", // ── TAMBAHAN ── opsional
    jenis_aplikasi_art: (order.jenis_aplikasi_art ?? {}) as JenisAplikasiArt, // ── TAMBAHAN ── opsional, multi
    jenis_pakaian: (order.jenis_pakaian || "kaos") as JenisPakaian, // ── TAMBAHAN ──
  });

  // ── KOREKSI ── Gesut hanya relevan untuk jenis produksi Manual/Sablon.
  // Tim QC (role 'qc' — kerjanya QC + finishing + packing DTF sekaligus)
  // dihitung agregat per tim di SalaryView, jadi tidak boleh dipilih
  // sebagai PJ/Helper per-order di sini.
  const isManualType = ["manual", "sablon"].includes(
    form.type?.toLowerCase() || "",
  );
  // Hanya user yang SEMATA-MATA QC yang dikecualikan; user ber-role ganda
  // (mis. QC + Produksi) tetap boleh dipilih.
  const picUsers = users.filter(
    (u) => !(hasRole(u, "qc") && getUserRoles(u).length === 1),
  );

  // ── TAMBAHAN ── ganti jenis pakaian. Ke Sweater/Hoodie → semua varian
  // yang sudah diinput otomatis jadi lengan panjang.
  const handlePakaianChange = (value: JenisPakaian) => {
    setForm((f) => ({
      ...f,
      jenis_pakaian: value,
      detail_ukuran:
        value === "sweater_hoodie" && f.detail_ukuran
          ? f.detail_ukuran.map((e) => ({ ...e, lengan: "panjang" as const }))
          : f.detail_ukuran,
    }));
  };

  const handleSizeSave = (detail: SizeEntry[], totalJumlah: number) => {
    setForm((f) => ({ ...f, detail_ukuran: detail, jumlah: totalJumlah }));
    setShowSizeForm(false);
  };

  // ── TAMBAHAN ──
  const handleGesutSave = (detail: GesutEntry) => {
    setForm((f) => ({ ...f, detail_gesut: detail }));
    setShowGesutForm(false);
  };

  const handleTypeChange = (value: string) => {
    const nowManual = ["manual", "sablon"].includes(value.toLowerCase());
    setForm((f) => ({
      ...f,
      type: value,
      // Reset gesut & PIC kalau pindah ke DTF supaya tidak nyangkut data lama
      detail_gesut: nowManual ? f.detail_gesut : null,
      assigned_to: nowManual ? f.assigned_to : "",
      helper_id: nowManual ? f.helper_id : "",
    }));
  };

  const isDisabled =
    !form.nama ||
    !form.hp ||
    !form.deadline ||
    !form.jumlah ||
    !form.assigned_to ||
    !form.detail_ukuran ||
    (isManualType && !form.detail_gesut); // ── TAMBAHAN ── wajib untuk Manual

  // ── SizeInputForm ──────────────────────────────────────────────────────────
  if (showSizeForm) {
    return (
      <SizeInputForm
        initialData={form.detail_ukuran ?? undefined}
        jenisPakaian={form.jenis_pakaian}
        onSave={handleSizeSave}
        onCancel={() => setShowSizeForm(false)}
      />
    );
  }

  // ── GesutInputForm ── ── TAMBAHAN ──
  if (showGesutForm) {
    return (
      <GesutInputForm
        initialData={form.detail_gesut ?? undefined}
        onSave={handleGesutSave}
        onCancel={() => setShowGesutForm(false)}
      />
    );
  }

  // Normalisasi nomor HP ke format WA internasional (tanpa + atau spasi)
  const normalizePhone = (raw: string): string => {
    // Hapus semua karakter selain angka dan +
    let cleaned = raw.replace(/[^\d+]/g, "");
    // Jika diawali +, hapus + saja
    if (cleaned.startsWith("+")) return cleaned.slice(1);
    // Jika diawali 0, ganti dengan 62 (Indonesia)
    if (cleaned.startsWith("0")) return "62" + cleaned.slice(1);
    // Sudah pakai kode negara langsung (62xxx, 1xxx, 44xxx, dll)
    return cleaned;
  };

  const handleHpBlur = () => {
    if (!form.hp) return;
    setForm((f) => ({ ...f, hp: normalizePhone(f.hp) }));
  };

  // ── Form Utama ─────────────────────────────────────────────────────────────
  // Layout sama persis dengan CreateOrder.
  // Urutan: Nama, No HP, Alamat → Jenis, Jenis Pakaian, Jumlah → Detail Ukuran,
  // Komposisi Gesut (Manual) → PJ, Helper, Deadline → Art → Ukuran Desain, Catatan.
  // Layout 12 kolom di desktop: field pendek disejajarkan satu baris.
  const LABEL =
    "block text-[10px] md:text-xs font-semibold text-zinc-700 dark:text-zinc-400 uppercase mb-1 md:mb-1.5";
  const OPT = "normal-case font-normal text-zinc-400";
  const INPUT =
    "w-full border border-zinc-200 dark:border-zinc-700 p-2 md:p-2.5 rounded-md focus:ring-2 focus:ring-[#124540] outline-none font-medium bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm placeholder-zinc-400 dark:placeholder-zinc-500";
  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  // ── TAMBAHAN ── di mode edit textarea sudah berisi teks sejak awal, jadi
  // tingginya perlu dihitung saat render pertama (bukan hanya saat mengetik).
  const autoGrowRef = (el: HTMLTextAreaElement | null) => {
    if (el) autoGrow(el);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 flex flex-col bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        {/* Header */}
        <div className="px-5 md:px-8 py-3 md:py-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
          <h2 className="font-semibold text-lg md:text-xl text-zinc-900 dark:text-white">
            Edit Pesanan
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">{order.kode_produksi}</p>
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
                Alamat{" "}
                <span className={OPT}>(Opsional, untuk Label Kirim)</span>
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

            {/* ── Baris 2: Jenis · Jenis Pakaian · Jumlah ── */}
            <div className="col-span-12 sm:col-span-4">
              <label className={LABEL}>Jenis Pesanan</label>
              <select
                className={INPUT}
                value={form.type}
                onChange={(e) => handleTypeChange(e.target.value)}
              >
                {productionTypes.map((pt) => (
                  <option
                    key={pt.id}
                    value={pt.value}
                    className="dark:bg-zinc-800"
                  >
                    {pt.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-12 sm:col-span-4">
              <label className={LABEL}>Jenis Pakaian</label>
              <select
                className={INPUT}
                title="Sweater/Hoodie: lengan otomatis panjang"
                value={form.jenis_pakaian}
                onChange={(e) =>
                  handlePakaianChange(e.target.value as JenisPakaian)
                }
              >
                {JENIS_PAKAIAN_OPTIONS.map((o) => (
                  <option
                    key={o.value}
                    value={o.value}
                    className="dark:bg-zinc-800"
                  >
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-12 sm:col-span-4">
              <label className={LABEL}>Jumlah</label>
              <input
                readOnly
                className="w-full border border-zinc-200 dark:border-zinc-700 p-2 md:p-2.5 rounded-md font-medium bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 text-sm cursor-not-allowed placeholder-[#124540] dark:placeholder-[#49BFB4]"
                value={form.jumlah > 0 ? `${form.jumlah} pcs` : ""}
                placeholder="Otomatis dari ukuran"
              />
            </div>

            {/* ── Baris 3: Detail Ukuran · Komposisi Gesut (Manual) ── */}
            <div
              className={`col-span-12 ${isManualType ? "md:col-span-8" : ""}`}
            >
              <label className={LABEL}>
                Detail Ukuran <span className="text-red-500">(Wajib)</span>
              </label>
              {!form.detail_ukuran ? (
                <button
                  onClick={() => setShowSizeForm(true)}
                  className="w-full py-3 border border-dashed border-zinc-300 dark:border-zinc-600 rounded-xl text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:border-[#124540] hover:text-[#49BFB4] transition-colors duration-150"
                >
                  + Isi Detail Ukuran
                </button>
              ) : (
                <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden">
                  <div className="p-3 grid gap-x-8 gap-y-2 md:grid-cols-2 max-h-44 overflow-y-auto">
                    {form.detail_ukuran.map((e) => {
                      const total = Object.values(e.ukuran).reduce(
                        (a: number, b) => a + (b ?? 0),
                        0,
                      );
                      const ukuranList = Object.entries(e.ukuran)
                        .filter(([, v]) => (v ?? 0) > 0)
                        .map(([k, v]) => `${k}:${v}`)
                        .join(", ");
                      return (
                        <div
                          key={e.id}
                          className="flex justify-between items-start gap-2"
                        >
                          <div className="min-w-0">
                            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                              {e.warna} &middot; Lengan {e.lengan}
                            </span>
                            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 break-words">
                              {ukuranList}
                            </p>
                          </div>
                          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                            {total} pcs
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="border-t border-zinc-200 dark:border-zinc-700 px-3 py-1.5 flex items-center justify-between">
                    <span className="font-mono tabular-nums text-xs font-semibold text-[#2589ff]">
                      Total: {form.jumlah.toLocaleString("id-ID")} pcs
                    </span>
                    <button
                      onClick={() => setShowSizeForm(true)}
                      className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-[#2589ff] transition-colors duration-150 underline underline-offset-2"
                    >
                      Ubah
                    </button>
                  </div>
                </div>
              )}
            </div>

            {isManualType && (
              <div className="col-span-12 md:col-span-4">
                <label className={LABEL}>
                  Komposisi Gesut <span className="text-red-500">(Wajib)</span>
                </label>
                {!form.detail_gesut ? (
                  <button
                    onClick={() => setShowGesutForm(true)}
                    className="w-full py-3 border border-dashed border-zinc-300 dark:border-zinc-600 rounded-xl text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:border-[#124540] hover:text-[#49BFB4] transition-colors duration-150"
                  >
                    + Isi Komposisi Gesut
                  </button>
                ) : (
                  <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2">
                    <div className="flex gap-3 text-xs text-zinc-600 dark:text-zinc-300">
                      <span>
                        Kecil:{" "}
                        <span className="font-mono font-semibold">
                          {form.detail_gesut.kecil}
                        </span>
                      </span>
                      <span>
                        Sedang:{" "}
                        <span className="font-mono font-semibold">
                          {form.detail_gesut.sedang}
                        </span>
                      </span>
                      <span>
                        Besar:{" "}
                        <span className="font-mono font-semibold">
                          {form.detail_gesut.besar}
                        </span>
                      </span>
                    </div>
                    <button
                      onClick={() => setShowGesutForm(true)}
                      className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-[#2589ff] transition-colors duration-150 underline underline-offset-2 shrink-0"
                    >
                      Ubah
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Baris 4: PJ · Helper · Deadline ── */}
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
                Helper{" "}
                <span className="normal-case font-normal text-zinc-400">
                  (Opsional)
                </span>
              </label>
              <select
                className={INPUT}
                title="Helper akan ikut terhitung di menu gaji jika dipilih."
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
            <div className="col-span-12 sm:col-span-4">
              <label className={LABEL}>Deadline</label>
              <input
                type="date"
                className={INPUT}
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              />
            </div>

            {/* ── Baris 5: Jenis Aplikasi per Art (pilihan ganda) ── */}
            <div className="col-span-12">
              <label className={LABEL}>
                Jenis Aplikasi per Art{" "}
                <span className={OPT}>
                  (Opsional, boleh pilih lebih dari satu)
                </span>
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                {(
                  [
                    ["depan", "Art Depan"],
                    ["belakang", "Art Belakang"],
                    ["kanan", "Art Kanan"],
                    ["kiri", "Art Kiri"],
                  ] as const
                ).map(([key, lbl]) => (
                  <MultiSelectDropdown
                    key={key}
                    label={lbl}
                    options={JENIS_APLIKASI_OPTIONS}
                    value={form.jenis_aplikasi_art[key] ?? []}
                    onChange={(next) =>
                      setForm({
                        ...form,
                        jenis_aplikasi_art: {
                          ...form.jenis_aplikasi_art,
                          [key]: next,
                        },
                      })
                    }
                    ringClass="focus:ring-[#124540]"
                  />
                ))}
              </div>
            </div>

            {/* ── Baris 6: Ukuran Desain · Catatan ── */}
            <div className="col-span-12 sm:col-span-6 md:col-span-3">
              <label className={LABEL}>
                Ukuran Desain Depan <span className={OPT}>(Opsional)</span>
              </label>
              <input
                className={INPUT}
                placeholder="mis. 28 x 35 cm"
                value={form.ukuran_desain_depan}
                onChange={(e) =>
                  setForm({ ...form, ukuran_desain_depan: e.target.value })
                }
              />
            </div>
            <div className="col-span-12 sm:col-span-6 md:col-span-3">
              <label className={LABEL}>
                Ukuran Desain Belakang <span className={OPT}>(Opsional)</span>
              </label>
              <input
                className={INPUT}
                placeholder="mis. 28 x 35 cm"
                value={form.ukuran_desain_belakang}
                onChange={(e) =>
                  setForm({ ...form, ukuran_desain_belakang: e.target.value })
                }
              />
            </div>
            <div className="col-span-12 md:col-span-6">
              <label className={LABEL}>
                Catatan Pesanan{" "}
                <span className={OPT}>(Opsional, mis. bahan sablon)</span>
              </label>
              <textarea
                ref={autoGrowRef}
                rows={1}
                className={`${INPUT} resize-none overflow-hidden`}
                placeholder="mis. Bahan: plastisol, kaos cotton combed 30s..."
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
            onClick={() => onSubmit(form)}
            disabled={isDisabled || isSubmitting}
            className="flex-1 md:flex-none md:min-w-[160px] bg-[#124540] text-white py-2 md:py-2.5 rounded-md font-semibold hover:bg-[#0d332f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 text-sm flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Mengupdate...
              </>
            ) : (
              "Update"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
