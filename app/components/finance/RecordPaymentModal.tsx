"use client";

import React, { useState } from "react";
import { Upload } from "lucide-react";
import imageCompression from "browser-image-compression";
import { useDialog } from "@/app/components/ui/DialogProvider";
import { finFetch, errMsg, useFinanceMeta } from "@/hooks/useFinanceApi";
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from "@/lib/finance/types";
import { CurrencyInput } from "./CurrencyInput";
import { ModalShell, Field, inputCls, PrimaryButton, GhostButton } from "./ui";
import { formatRupiah, todayYmd } from "./utils";

export interface RecordTarget {
  order_id: string;
  kode_produksi: string;
  nama_pemesan: string;
  total: number;
  balance: number;
  paid_verified: number;
}

export default function RecordPaymentModal({
  target,
  canRefund,
  onClose,
  onDone,
}: {
  target: RecordTarget;
  canRefund: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { notify } = useDialog();
  const { meta, error: metaError } = useFinanceMeta();

  const [isRefund, setIsRefund] = useState(false);
  const [amount, setAmount] = useState(target.balance);
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  const [accountId, setAccountId] = useState("");
  const [paidAt, setPaidAt] = useState(todayYmd());
  const [reference, setReference] = useState("");
  const [payer, setPayer] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const needProof =
    method !== "tunai" && (meta?.settings.require_proof_non_cash ?? true);
  const maxAmount = isRefund ? target.paid_verified : target.balance;
  const overLimit = !meta?.settings.allow_overpayment && amount > maxAmount;
  const canSubmit =
    amount > 0 &&
    !!accountId &&
    !!paidAt &&
    (!needProof || !!file) &&
    !overLimit;

  const pickFile = async (f: File | null) => {
    if (!f) return setFile(null);
    try {
      // Foto dikompres di browser; PDF dikirim apa adanya. Server tetap memvalidasi isi file.
      const out: Blob = f.type.startsWith("image/")
        ? await imageCompression(f, {
            maxSizeMB: 1,
            maxWidthOrHeight: 1800,
            useWebWorker: true,
          })
        : f;
      setFile(
        out instanceof File
          ? out
          : new File([out], f.name, { type: out.type || f.type }),
      );
    } catch {
      setFile(f);
    }
  };

  const submit = async () => {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("order_id", target.order_id);
      fd.append("amount", String(amount));
      fd.append("method", method);
      fd.append("account_id", accountId);
      fd.append("paid_at", paidAt);
      if (isRefund) fd.append("kind", "refund");
      if (reference) fd.append("reference_no", reference);
      if (payer) fd.append("payer_name", payer);
      if (note) fd.append("note", note);
      if (file) fd.append("proof", file);

      const r = await finFetch<{ status: string }>("/api/finance/payments", {
        method: "POST",
        body: fd,
      });
      notify(
        r.status === "verified"
          ? "Pembayaran tercatat dan terverifikasi."
          : "Pembayaran tercatat, menunggu verifikasi.",
        { type: "success", title: "Berhasil" },
      );
      onDone();
      onClose();
    } catch (e) {
      notify(errMsg(e), { title: "Gagal mencatat pembayaran" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title={isRefund ? "Catat refund" : "Catat pembayaran"}
      subtitle={`${target.kode_produksi} · ${target.nama_pemesan}`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ["Tagihan", target.total],
            ["Terbayar", target.paid_verified],
            ["Sisa", target.balance],
          ].map(([l, v]) => (
            <div
              key={l as string}
              className="rounded-md bg-zinc-50 dark:bg-zinc-900 py-2"
            >
              <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em]">
                {l}
              </p>
              <p className="text-xs font-semibold font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                {formatRupiah(v as number)}
              </p>
            </div>
          ))}
        </div>

        {metaError && (
          <p className="text-xs text-red-600 dark:text-red-400">{metaError}</p>
        )}

        {canRefund && (
          <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={isRefund}
              onChange={(e) => {
                setIsRefund(e.target.checked);
                setAmount(0);
              }}
            />
            Ini refund (uang dikembalikan ke pelanggan)
          </label>
        )}

        <CurrencyInput
          key={isRefund ? "r" : "p"}
          label="Nominal"
          value={amount}
          onChange={setAmount}
          required
        />
        {overLimit && (
          <p className="text-[11px] text-red-600 dark:text-red-400 -mt-2">
            Melebihi {isRefund ? "total yang sudah terbayar" : "sisa tagihan"} (
            {formatRupiah(maxAmount)}).
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Metode" required>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className={inputCls}
            >
              {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map(
                (m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABEL[m]}
                  </option>
                ),
              )}
            </select>
          </Field>
          <Field label="Akun kas/bank" required>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className={inputCls}
            >
              <option value="">Pilih…</option>
              {meta?.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Tanggal diterima" required>
          <input
            type="date"
            value={paidAt}
            max={todayYmd()}
            onChange={(e) => setPaidAt(e.target.value)}
            className={inputCls}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="No. referensi">
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              maxLength={100}
              className={inputCls}
              placeholder="No. transaksi"
            />
          </Field>
          <Field label="Nama pengirim">
            <input
              value={payer}
              onChange={(e) => setPayer(e.target.value)}
              maxLength={100}
              className={inputCls}
            />
          </Field>
        </div>

        <Field
          label="Bukti pembayaran"
          required={needProof}
          hint={
            needProof
              ? "Wajib untuk transfer/QRIS. JPG, PNG, WEBP, atau PDF (maks 4 MB)."
              : "Opsional untuk tunai."
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
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            className={inputCls}
          />
        </Field>

        <div className="flex gap-2 pt-1">
          <GhostButton onClick={onClose} className="flex-1">
            Batal
          </GhostButton>
          <PrimaryButton
            onClick={submit}
            loading={saving}
            disabled={!canSubmit}
            className="flex-1"
          >
            Simpan
          </PrimaryButton>
        </div>
      </div>
    </ModalShell>
  );
}
