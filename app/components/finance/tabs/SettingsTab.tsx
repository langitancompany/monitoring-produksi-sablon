"use client";

import React, { useMemo, useRef, useState } from "react";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { useDialog } from "@/app/components/ui/DialogProvider";
import { errMsg } from "@/hooks/useFinanceApi";
import { useInvoiceSettings } from "@/hooks/useInvoiceSettings";
import { buildSampleInvoiceModel } from "@/lib/finance/invoiceDoc";
import { fileToDataUrl } from "@/lib/finance/imageUtil";
import {
  HEADER_SPEC,
  MAX_ACCOUNTS,
  MAX_HEADER_DATAURL,
  MAX_SIGNATURE_DATAURL,
  SIGNATURE_SPEC,
  type InvoiceSettings,
} from "@/lib/finance/invoiceSettings";
import InvoiceDocument from "../InvoiceDocument";
import ScaledDoc from "../ScaledDoc";
import {
  Field,
  GhostButton,
  PrimaryButton,
  cardCls,
  inputCls,
  sectionLabelCls,
} from "../ui";

/** Keuangan > Pengaturan: header, rekening pembayaran, dan tanda tangan untuk invoice customer. Hanya Super Admin. */
export default function SettingsTab() {
  const { notify } = useDialog();
  const { settings, loaded, error, save } = useInvoiceSettings();
  const [draft, setDraft] = useState<InvoiceSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [sampleLunas, setSampleLunas] = useState(false);
  const headerInput = useRef<HTMLInputElement>(null);
  const signInput = useRef<HTMLInputElement>(null);

  // Salin dari server sekali, lalu edit di draft lokal.
  if (settings && !draft) setDraft(settings);

  const dirty = useMemo(() => {
    if (!settings || !draft) return false;
    const strip = ({ updated_at, updated_by, ...rest }: InvoiceSettings) => {
      void updated_at;
      void updated_by;
      return JSON.stringify(rest);
    };
    return strip(settings) !== strip(draft);
  }, [settings, draft]);

  const sample = useMemo(
    () => buildSampleInvoiceModel(sampleLunas),
    [sampleLunas],
  );

  if (!draft) {
    return (
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {error ?? "Memuat pengaturan…"}
      </p>
    );
  }

  const set = <K extends keyof InvoiceSettings>(k: K, v: InvoiceSettings[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  const setAccount = (
    i: number,
    patch: Partial<InvoiceSettings["accounts"][number]>,
  ) =>
    set(
      "accounts",
      draft.accounts.map((a, idx) => (idx === i ? { ...a, ...patch } : a)),
    );

  const pickImage = async (
    file: File | undefined,
    key: "header_image" | "signature_image",
  ) => {
    if (!file) return;
    try {
      const isHeader = key === "header_image";
      set(
        key,
        await fileToDataUrl(file, {
          maxWidth: isHeader ? HEADER_SPEC.pxW : SIGNATURE_SPEC.pxW,
          maxChars: isHeader ? MAX_HEADER_DATAURL : MAX_SIGNATURE_DATAURL,
        }),
      );
    } catch (e) {
      notify(errMsg(e), { title: "Gambar tidak bisa dipakai" });
    }
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const saved = await save(draft);
      setDraft(saved);
      notify("Pengaturan invoice disimpan.", {
        type: "success",
        title: "Berhasil",
      });
    } catch (e) {
      notify(errMsg(e), { title: "Gagal menyimpan" });
    } finally {
      setSaving(false);
    }
  };

  const previewHeader =
    draft.header_image ??
    (typeof window !== "undefined"
      ? `${window.location.origin}/header-nota.png`
      : null);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-5 items-start">
      <div className="space-y-4 md:space-y-5">
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">
            {error}
            {!loaded &&
              " Pengaturan tersimpan tidak berhasil dimuat, jadi penyimpanan dikunci agar data lama tidak tertimpa. Muat ulang halaman."}
          </p>
        )}

        {/* ── Header ── */}
        <section className={`${cardCls} p-4 md:p-5 space-y-4`}>
          <h3 className={sectionLabelCls}>Header invoice</h3>

          <div className="rounded-md bg-zinc-50 dark:bg-zinc-900 p-3 text-[11px] text-zinc-600 dark:text-zinc-300 space-y-1">
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">
              Ukuran yang disarankan: {HEADER_SPEC.pxW} × {HEADER_SPEC.pxH} px
            </p>
            <p>
              = {HEADER_SPEC.widthMm} × {HEADER_SPEC.heightMm} mm pada 300 dpi
              (rasio ±8,7 : 1, memanjang dan ramping). Format PNG/JPG/WebP.
              Letakkan isi penting minimal 5 mm dari tepi kiri dan kanan agar
              aman dari batas cetak printer. Ukuran lain dengan rasio serupa
              tetap bisa dipakai; tinggi header dibatasi 24 mm.
            </p>
          </div>

          <div className="rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 bg-white p-2">
            {draft.header_image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={draft.header_image}
                alt="Header"
                className="w-full h-auto block"
                style={{
                  maxHeight: 90,
                  objectFit: "contain",
                  objectPosition: "left",
                }}
              />
            ) : (
              <p className="text-[11px] text-zinc-400 py-3 text-center">
                Belum ada header khusus. Invoice memakai kop bawaan aplikasi.
              </p>
            )}
          </div>
          <input
            ref={headerInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              void pickImage(e.target.files?.[0], "header_image");
              e.target.value = "";
            }}
          />
          <div className="flex gap-2">
            <GhostButton onClick={() => headerInput.current?.click()}>
              <span className="flex items-center gap-2">
                <ImagePlus className="w-4 h-4" />
                {draft.header_image ? "Ganti header" : "Unggah header"}
              </span>
            </GhostButton>
            {draft.header_image && (
              <GhostButton onClick={() => set("header_image", null)}>
                Hapus
              </GhostButton>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              label="Nama usaha"
              hint="Dipakai di catatan kaki, pesan WhatsApp, dan kop teks bila tanpa gambar."
            >
              <input
                value={draft.store_name}
                onChange={(e) => set("store_name", e.target.value)}
                maxLength={120}
                className={inputCls}
              />
            </Field>
            <Field
              label="Alamat"
              hint="Tampil di kop teks bila header gambar kosong."
            >
              <input
                value={draft.store_address}
                onChange={(e) => set("store_address", e.target.value)}
                maxLength={250}
                className={inputCls}
              />
            </Field>
          </div>
        </section>

        {/* ── Rekening ── */}
        <section className={`${cardCls} p-4 md:p-5 space-y-4`}>
          <div className="flex items-center justify-between">
            <h3 className={sectionLabelCls}>Rekening pembayaran</h3>
            <span className="text-[10px] text-zinc-400">
              maks. {MAX_ACCOUNTS} rekening
            </span>
          </div>

          {draft.accounts.length === 0 && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Belum ada rekening. Invoice yang belum lunas tidak akan memuat
              cara pembayaran.
            </p>
          )}

          {draft.accounts.map((a, i) => (
            <div
              key={i}
              className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3 space-y-2"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Field label="Bank / e-wallet" required>
                  <input
                    value={a.bank}
                    onChange={(e) => setAccount(i, { bank: e.target.value })}
                    maxLength={60}
                    placeholder="BCA"
                    className={inputCls}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Nomor rekening" required>
                    <input
                      value={a.number}
                      onChange={(e) =>
                        setAccount(i, { number: e.target.value })
                      }
                      maxLength={40}
                      inputMode="numeric"
                      className={`${inputCls} font-mono tabular-nums`}
                    />
                  </Field>
                </div>
              </div>
              <Field label="Atas nama">
                <input
                  value={a.holder}
                  onChange={(e) => setAccount(i, { holder: e.target.value })}
                  maxLength={120}
                  placeholder="KOPERASI PONDOK PESANTREN LANGITAN JAWA TIMUR"
                  className={inputCls}
                />
              </Field>
              <button
                onClick={() =>
                  set(
                    "accounts",
                    draft.accounts.filter((_, idx) => idx !== i),
                  )
                }
                className="flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400 hover:underline"
              >
                <Trash2 className="w-3 h-3" /> Hapus rekening
              </button>
            </div>
          ))}

          {draft.accounts.length < MAX_ACCOUNTS && (
            <GhostButton
              onClick={() =>
                set("accounts", [
                  ...draft.accounts,
                  { bank: "", number: "", holder: "" },
                ])
              }
            >
              <span className="flex items-center gap-2">
                <Plus className="w-4 h-4" /> Tambah rekening
              </span>
            </GhostButton>
          )}

          <Field label="Catatan di bawah rekening">
            <input
              value={draft.payment_note}
              onChange={(e) => set("payment_note", e.target.value)}
              maxLength={300}
              className={inputCls}
            />
          </Field>
        </section>

        {/* ── TTD ── */}
        <section className={`${cardCls} p-4 md:p-5 space-y-4`}>
          <div className="flex items-center justify-between gap-3">
            <h3 className={sectionLabelCls}>Tanda tangan</h3>
            <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.show_signature}
                onChange={(e) => set("show_signature", e.target.checked)}
                className="w-4 h-4 accent-[#124540]"
              />
              Tampilkan di invoice
            </label>
          </div>

          {draft.show_signature && (
            <>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Gambar TTD disarankan PNG berlatar transparan,{" "}
                {SIGNATURE_SPEC.pxW} × {SIGNATURE_SPEC.pxH} px (
                {SIGNATURE_SPEC.widthMm} × {SIGNATURE_SPEC.heightMm} mm). Boleh
                dikosongkan bila hanya ingin nama dan jabatan (untuk
                ditandatangani basah setelah dicetak).
              </p>

              <div className="rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 bg-white p-2 flex items-center justify-center min-h-[64px]">
                {draft.signature_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={draft.signature_image}
                    alt="Tanda tangan"
                    style={{
                      maxHeight: 70,
                      maxWidth: "100%",
                      objectFit: "contain",
                    }}
                  />
                ) : (
                  <p className="text-[11px] text-zinc-400">
                    Tanpa gambar tanda tangan
                  </p>
                )}
              </div>
              <input
                ref={signInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  void pickImage(e.target.files?.[0], "signature_image");
                  e.target.value = "";
                }}
              />
              <div className="flex gap-2">
                <GhostButton onClick={() => signInput.current?.click()}>
                  <span className="flex items-center gap-2">
                    <ImagePlus className="w-4 h-4" />
                    {draft.signature_image ? "Ganti TTD" : "Unggah TTD"}
                  </span>
                </GhostButton>
                {draft.signature_image && (
                  <GhostButton onClick={() => set("signature_image", null)}>
                    Hapus
                  </GhostButton>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Nama penandatangan">
                  <input
                    value={draft.signature_name}
                    onChange={(e) => set("signature_name", e.target.value)}
                    maxLength={100}
                    className={inputCls}
                  />
                </Field>
                <Field label="Jabatan">
                  <input
                    value={draft.signature_title}
                    onChange={(e) => set("signature_title", e.target.value)}
                    maxLength={100}
                    placeholder="Bendahara"
                    className={inputCls}
                  />
                </Field>
              </div>
            </>
          )}
        </section>

        <div className="flex items-center gap-3">
          <PrimaryButton
            onClick={onSave}
            loading={saving}
            disabled={!dirty || !loaded}
          >
            Simpan pengaturan
          </PrimaryButton>
          {dirty && (
            <span className="text-[11px] text-amber-600 dark:text-amber-400">
              Ada perubahan yang belum disimpan
            </span>
          )}
          {!dirty && settings?.updated_at && (
            <span className="text-[10px] text-zinc-400">
              Terakhir diubah {settings.updated_by ?? "-"} ·{" "}
              {new Date(settings.updated_at).toLocaleString("id-ID", {
                day: "numeric",
                month: "short",
                year: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
      </div>

      {/* ── Pratinjau ── */}
      <section className={`${cardCls} p-4 md:p-5 space-y-3 xl:sticky xl:top-4`}>
        <div className="flex items-center justify-between gap-3">
          <h3 className={sectionLabelCls}>Pratinjau (data contoh)</h3>
          <div className="flex gap-1">
            {[
              [false, "Belum lunas"],
              [true, "Lunas"],
            ].map(([v, l]) => (
              <button
                key={String(l)}
                onClick={() => setSampleLunas(v as boolean)}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors duration-150 ${
                  sampleLunas === v
                    ? "bg-[#124540] text-white border-[#124540]"
                    : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                }`}
              >
                {l as string}
              </button>
            ))}
          </div>
        </div>
        <ScaledDoc>
          <InvoiceDocument
            model={sample}
            settings={draft}
            headerUrl={previewHeader}
          />
        </ScaledDoc>
        <p className="text-[10px] text-zinc-400">
          Pratinjau langsung mengikuti isian di kiri, sebelum disimpan.
        </p>
      </section>
    </div>
  );
}
