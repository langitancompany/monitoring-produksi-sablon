"use client";

import React, { useMemo, useState } from "react";
import type { SizeEntry } from "@/types";
import { useDialog } from "@/app/components/ui/DialogProvider";
import { FinanceApiError, postJson, errMsg } from "@/hooks/useFinanceApi";
import { computeInvoice } from "@/lib/finance/pricing";
import type { OrderFinanceDetail } from "@/lib/finance/types";
import { CurrencyInput } from "./CurrencyInput";
import { ModalShell, Field, inputCls, PrimaryButton, GhostButton } from "./ui";
import { formatRupiah } from "./utils";

/** Terbitkan tagihan baru, atau revisi tagihan aktif (wajib alasan). Total final dihitung ulang di server. */
export default function InvoiceModal({
  detail,
  onClose,
  onDone,
}: {
  detail: OrderFinanceDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  const { notify } = useDialog();
  const active = detail.invoices.find((i) => i.status === "active") ?? null;
  const isRevision = !!active;

  const [harga, setHarga] = useState(active?.harga_dasar ?? 0);
  const [besar, setBesar] = useState(active?.biaya_ukuran_besar ?? 0);
  const [lengan, setLengan] = useState(active?.biaya_lengan_panjang ?? 0);
  const [discount, setDiscount] = useState(active?.discount ?? 0);
  const [dueDate, setDueDate] = useState(active?.due_date ?? "");
  const [reason, setReason] = useState("");
  const [mismatch, setMismatch] = useState<{
    total_pcs: number;
    jumlah: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const calc = useMemo(
    () =>
      computeInvoice({
        detailUkuran: detail.order.detail_ukuran as SizeEntry[] | null,
        jumlah: detail.order.jumlah,
        hargaDasar: harga,
        biayaUkuranBesar: besar,
        biayaLenganPanjang: lengan,
        discount,
      }),
    [detail.order, harga, besar, lengan, discount],
  );

  const pcsDiffers = !calc.isLegacy && calc.totalPcs !== detail.order.jumlah;
  const canSubmit =
    harga > 0 &&
    calc.subtotal > 0 &&
    discount <= calc.subtotal &&
    (!isRevision || reason.trim().length >= 3);

  const submit = async (acknowledge: boolean) => {
    setSaving(true);
    try {
      await postJson("/api/finance/invoices", {
        order_id: detail.order.id,
        harga_dasar: harga,
        biaya_ukuran_besar: besar,
        biaya_lengan_panjang: lengan,
        discount,
        due_date: dueDate || undefined,
        reason: reason.trim() || undefined,
        acknowledge_mismatch: acknowledge || undefined,
      });
      notify(isRevision ? "Tagihan direvisi." : "Tagihan diterbitkan.", {
        type: "success",
        title: "Berhasil",
      });
      onDone();
      onClose();
    } catch (e) {
      if (e instanceof FinanceApiError && e.code === "PCS_MISMATCH") {
        setMismatch({
          total_pcs: Number(e.data?.total_pcs),
          jumlah: Number(e.data?.jumlah),
        });
      } else {
        notify(errMsg(e), { title: "Gagal menyimpan tagihan" });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title={
        isRevision
          ? `Revisi tagihan (v${(active?.version ?? 0) + 1})`
          : "Terbitkan tagihan"
      }
      subtitle={`${detail.order.kode_produksi} · ${detail.order.nama_pemesan} · ${detail.order.jumlah} pcs`}
      onClose={onClose}
      wide
    >
      <div className="space-y-4">
        <CurrencyInput
          label="Harga dasar per pcs"
          value={harga}
          onChange={setHarga}
          required
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <CurrencyInput
              label="Tambahan ukuran besar (per tingkat, mulai XXL)"
              value={besar}
              onChange={setBesar}
            />
            {!calc.isLegacy && !calc.hasUkuranBesar && (
              <p className="text-[10px] text-zinc-400 mt-1">
                Tidak ada ukuran XXL ke atas pada order ini.
              </p>
            )}
          </div>
          <div>
            <CurrencyInput
              label="Tambahan lengan panjang (per pcs)"
              value={lengan}
              onChange={setLengan}
            />
            {!calc.isLegacy && !calc.hasLenganPanjang && (
              <p className="text-[10px] text-zinc-400 mt-1">
                Tidak ada lengan panjang pada order ini.
              </p>
            )}
          </div>
        </div>

        <CurrencyInput label="Diskon" value={discount} onChange={setDiscount} />
        {discount > calc.subtotal && (
          <p className="text-[11px] text-red-600 dark:text-red-400 -mt-2">
            Diskon melebihi subtotal.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="Jatuh tempo"
            hint="Kosongkan untuk memakai default pengaturan (14 hari)."
          >
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={inputCls}
            />
          </Field>
          {isRevision && (
            <Field label="Alasan revisi" required>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                className={inputCls}
                placeholder="Mis. tambah item / koreksi harga"
              />
            </Field>
          )}
        </div>

        {!calc.isLegacy && calc.entries.length > 0 && (
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="text-left text-[10px] uppercase tracking-[0.08em] font-semibold px-3 py-2">
                    Rincian
                  </th>
                  <th className="text-right text-[10px] uppercase tracking-[0.08em] font-semibold px-3 py-2">
                    Pcs
                  </th>
                  <th className="text-right text-[10px] uppercase tracking-[0.08em] font-semibold px-3 py-2">
                    Subtotal
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {calc.entries.map((e) => (
                  <tr key={e.entryId}>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">
                      {e.warna} · lengan {e.lengan}
                      <span className="block text-[10px] text-zinc-400">
                        {e.sizes.map((s) => `${s.ukuran}×${s.qty}`).join("  ")}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {e.totalPcs}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {formatRupiah(e.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="rounded-md bg-zinc-50 dark:bg-zinc-900 p-3 space-y-1 text-xs">
          <div className="flex justify-between text-zinc-500">
            <span>Subtotal ({calc.totalPcs} pcs)</span>
            <span className="font-mono tabular-nums">
              {formatRupiah(calc.subtotal)}
            </span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-zinc-500">
              <span>Diskon</span>
              <span className="font-mono tabular-nums">
                − {formatRupiah(discount)}
              </span>
            </div>
          )}
          <div className="flex justify-between text-sm font-semibold text-zinc-900 dark:text-zinc-100 pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <span>Total tagihan</span>
            <span className="font-mono tabular-nums">
              {formatRupiah(calc.total)}
            </span>
          </div>
          <p className="text-[10px] text-zinc-400 pt-1">
            Ini pratinjau. Total resmi dihitung ulang oleh server saat disimpan.
          </p>
        </div>

        {pcsDiffers && !mismatch && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-md px-3 py-2">
            Jumlah pcs pada rincian ukuran ({calc.totalPcs}) berbeda dengan qty
            order ({detail.order.jumlah}).
          </p>
        )}

        {mismatch && (
          <div className="rounded-md border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Rincian ukuran berjumlah <b>{mismatch.total_pcs} pcs</b>,
              sedangkan qty order <b>{mismatch.jumlah} pcs</b>. Total dihitung
              dari rincian ukuran. Lanjutkan?
            </p>
            <div className="flex gap-2">
              <GhostButton
                onClick={() => setMismatch(null)}
                className="flex-1 !py-2"
              >
                Periksa lagi
              </GhostButton>
              <PrimaryButton
                onClick={() => submit(true)}
                loading={saving}
                className="flex-1 !py-2"
              >
                Ya, lanjutkan
              </PrimaryButton>
            </div>
          </div>
        )}

        {!mismatch && (
          <div className="flex gap-2 pt-1">
            <GhostButton onClick={onClose} className="flex-1">
              Batal
            </GhostButton>
            <PrimaryButton
              onClick={() => submit(false)}
              loading={saving}
              disabled={!canSubmit}
              className="flex-1"
            >
              {isRevision ? "Simpan revisi" : "Terbitkan"}
            </PrimaryButton>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
