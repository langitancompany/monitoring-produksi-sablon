"use client";

import React, { useEffect, useState } from "react";
import { Upload, X, Plus } from "lucide-react";
import imageCompression from "browser-image-compression";
import { useDialog } from "@/app/components/ui/DialogProvider";
import { finFetch, postJson, errMsg } from "@/hooks/useFinanceApi";
import { useExpenseMeta } from "@/hooks/useExpenseMeta";
import type { FinanceVendor, OrderLookupRow } from "@/lib/finance/types";
import { CurrencyInput } from "./CurrencyInput";
import { ModalShell, Field, inputCls, PrimaryButton, GhostButton } from "./ui";
import { formatRupiah, todayYmd } from "./utils";

/** Cari order (kode / nama pemesan) untuk mengaitkan biaya langsung. Opsional. */
function OrderPicker({
  value,
  onChange,
}: {
  value: OrderLookupRow | null;
  onChange: (o: OrderLookupRow | null) => void;
}) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<OrderLookupRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) {
      setRows([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await finFetch<{ rows: OrderLookupRow[] }>(
          `/api/finance/order-lookup?q=${encodeURIComponent(q.trim())}`,
        );
        if (!cancelled) setRows(r.rows);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 py-2">
        <p className="text-xs text-zinc-700 dark:text-zinc-200 truncate">
          <span className="font-mono font-semibold">{value.kode_produksi}</span>
          <span className="text-zinc-400"> · {value.nama_pemesan}</span>
        </p>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Lepas order"
          className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className={inputCls}
        placeholder="Ketik kode produksi / nama pemesan…"
        maxLength={60}
      />
      {q.trim().length >= 2 && (
        <div className="absolute z-10 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-sm">
          {loading && <p className="px-3 py-2 text-xs text-zinc-500">Mencari…</p>}
          {!loading && rows.length === 0 && (
            <p className="px-3 py-2 text-xs text-zinc-500">Tidak ada order yang cocok.</p>
          )}
          {rows.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                onChange(o);
                setQ("");
              }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150"
            >
              <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-100">{o.kode_produksi}</span>
              <span className="text-zinc-400"> · {o.nama_pemesan}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RecordExpenseModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const { notify } = useDialog();
  const { meta, error: metaError, addVendor } = useExpenseMeta();

  const [amount, setAmount] = useState(0);
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [spentAt, setSpentAt] = useState(todayYmd());
  const [description, setDescription] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [order, setOrder] = useState<OrderLookupRow | null>(null);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const [addingVendor, setAddingVendor] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const [savingVendor, setSavingVendor] = useState(false);

  const threshold = meta?.settings.expense_proof_required_above ?? 0;
  const needProof = threshold > 0 && amount >= threshold;
  const canSubmit =
    amount > 0 &&
    !!categoryId &&
    !!accountId &&
    !!spentAt &&
    description.trim().length >= 3 &&
    (!needProof || !!file);

  const pickFile = async (f: File | null) => {
    if (!f) return setFile(null);
    try {
      // Foto dikompres di browser; PDF dikirim apa adanya. Server tetap memvalidasi isi file.
      const out: Blob = f.type.startsWith("image/")
        ? await imageCompression(f, { maxSizeMB: 1, maxWidthOrHeight: 1800, useWebWorker: true })
        : f;
      setFile(out instanceof File ? out : new File([out], f.name, { type: out.type || f.type }));
    } catch {
      setFile(f);
    }
  };

  const saveVendor = async () => {
    setSavingVendor(true);
    try {
      const r = await postJson<{ vendor: FinanceVendor }>("/api/finance/vendors", { name: vendorName });
      addVendor(r.vendor);
      setVendorId(r.vendor.id);
      setAddingVendor(false);
      setVendorName("");
    } catch (e) {
      notify(errMsg(e), { title: "Gagal menambah vendor" });
    } finally {
      setSavingVendor(false);
    }
  };

  const submit = async () => {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("amount", String(amount));
      fd.append("category_id", categoryId);
      fd.append("account_id", accountId);
      fd.append("spent_at", spentAt);
      fd.append("description", description.trim());
      if (vendorId) fd.append("vendor_id", vendorId);
      if (order) fd.append("order_id", order.id);
      if (note) fd.append("note", note);
      if (file) fd.append("proof", file);

      const r = await finFetch<{ status: string }>("/api/finance/expenses", { method: "POST", body: fd });
      notify(
        r.status === "approved"
          ? "Pengeluaran tercatat dan disetujui."
          : "Pengeluaran tercatat, menunggu persetujuan.",
        { type: "success", title: "Berhasil" },
      );
      onDone();
      onClose();
    } catch (e) {
      notify(errMsg(e), { title: "Gagal mencatat pengeluaran" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Catat pengeluaran" subtitle="Uang keluar dari kas / bank" onClose={onClose}>
      <div className="space-y-4">
        {metaError && <p className="text-xs text-red-600 dark:text-red-400">{metaError}</p>}

        <CurrencyInput label="Nominal" value={amount} onChange={setAmount} required />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Kategori" required>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
              <option value="">Pilih…</option>
              {meta?.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Dibayar dari" required>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputCls}>
              <option value="">Pilih…</option>
              {meta?.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Tanggal" required>
          <input
            type="date"
            value={spentAt}
            max={todayYmd()}
            onChange={(e) => setSpentAt(e.target.value)}
            className={inputCls}
          />
        </Field>

        <Field label="Keterangan" required hint="Apa yang dibeli / dibayar.">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
            className={inputCls}
            placeholder="Contoh: Kaos polos cotton combed 30s ×100 pcs"
          />
        </Field>

        <Field label="Vendor / pemasok">
          {addingVendor ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                maxLength={80}
                className={inputCls}
                placeholder="Nama vendor baru"
              />
              <PrimaryButton
                type="button"
                onClick={saveVendor}
                loading={savingVendor}
                disabled={vendorName.trim().length < 2}
              >
                Simpan
              </PrimaryButton>
              <GhostButton type="button" onClick={() => setAddingVendor(false)}>
                Batal
              </GhostButton>
            </div>
          ) : (
            <div className="flex gap-2">
              <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={inputCls}>
                <option value="">Tanpa vendor</option>
                {meta?.vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              <GhostButton type="button" onClick={() => setAddingVendor(true)} aria-label="Tambah vendor baru">
                <Plus className="w-4 h-4" />
              </GhostButton>
            </div>
          )}
        </Field>

        <Field label="Biaya langsung untuk order" hint="Opsional. Dipakai untuk menghitung laba per order.">
          <OrderPicker value={order} onChange={setOrder} />
        </Field>

        <Field
          label="Bukti / nota"
          required={needProof}
          hint={
            needProof
              ? `Wajib untuk pengeluaran ${formatRupiah(threshold)} atau lebih. JPG, PNG, WEBP, atau PDF (maks 4 MB).`
              : threshold > 0
                ? `Opsional di bawah ${formatRupiah(threshold)}.`
                : "Opsional."
          }
        >
          <label className="flex items-center gap-2 cursor-pointer border border-dashed border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-3 text-xs text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150">
            <Upload className="w-4 h-4 shrink-0" />
            <span className="truncate">{file ? file.name : "Pilih file…"}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </Field>

        <Field label="Catatan">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={inputCls} />
        </Field>

        <div className="flex gap-2 pt-1">
          <GhostButton onClick={onClose} className="flex-1">
            Batal
          </GhostButton>
          <PrimaryButton onClick={submit} loading={saving} disabled={!canSubmit} className="flex-1">
            Simpan
          </PrimaryButton>
        </div>
      </div>
    </ModalShell>
  );
}
