"use client";

import React, { useCallback, useState } from "react";
import { useDialog } from "@/app/components/ui/DialogProvider";
import { finFetch, postJson, errMsg } from "@/hooks/useFinanceApi";
import type { PaymentRow } from "@/lib/finance/types";
import { ModalShell, Field, inputCls, PrimaryButton, GhostButton } from "./ui";
import { formatRupiah } from "./utils";

type Pending = { type: "reject" | "void"; payment: PaymentRow } | null;

/**
 * Aksi atas satu transaksi: verifikasi, tolak (+alasan), void (+alasan), buka bukti.
 * `node` harus dirender oleh pemakai agar dialog alasan muncul.
 */
export function usePaymentActions(onDone: () => void) {
  const { notify } = useDialog();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState("");

  const run = useCallback(
    async (id: string, fn: () => Promise<unknown>, okMsg?: string) => {
      setBusyId(id);
      try {
        await fn();
        if (okMsg) notify(okMsg, { type: "success", title: "Berhasil" });
        onDone();
        return true;
      } catch (e) {
        notify(errMsg(e), { title: "Gagal" });
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [notify, onDone],
  );

  const verify = (p: PaymentRow) =>
    run(
      p.id,
      () =>
        postJson(`/api/finance/payments/${p.id}/verify`, { action: "verify" }),
      "Pembayaran diverifikasi",
    );

  const openProof = async (p: PaymentRow) => {
    // Buka tab dulu (sinkron) supaya tidak diblokir popup blocker, lalu arahkan setelah URL siap.
    const w = window.open("about:blank", "_blank");
    setBusyId(p.id);
    try {
      const r = await finFetch<{ url: string | null; legacy: string[] }>(
        `/api/finance/payments/${p.id}/proof`,
      );
      const target = r.url ?? r.legacy[0];
      if (!target) throw new Error("Bukti tidak tersedia");
      if (w) w.location.href = target;
      else window.location.href = target;
    } catch (e) {
      w?.close();
      notify(errMsg(e), { title: "Gagal membuka bukti" });
    } finally {
      setBusyId(null);
    }
  };

  const submitReason = async () => {
    if (!pending) return;
    const { type, payment } = pending;
    const ok = await run(
      payment.id,
      () =>
        type === "reject"
          ? postJson(`/api/finance/payments/${payment.id}/verify`, {
              action: "reject",
              reason,
            })
          : postJson(`/api/finance/payments/${payment.id}/void`, { reason }),
      type === "reject" ? "Pembayaran ditolak" : "Transaksi dibatalkan (void)",
    );
    if (ok) {
      setPending(null);
      setReason("");
    }
  };

  const close = () => {
    setPending(null);
    setReason("");
  };

  const node = pending ? (
    <ModalShell
      title={
        pending.type === "reject"
          ? "Tolak pembayaran"
          : "Batalkan transaksi (void)"
      }
      subtitle={`${formatRupiah(pending.payment.amount)} · ${pending.payment.orders?.kode_produksi ?? ""}`}
      onClose={close}
    >
      <div className="space-y-4">
        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
          {pending.type === "reject"
            ? "Pembayaran ini tidak akan dihitung sebagai uang masuk."
            : "Transaksi tidak dihapus: statusnya menjadi Dibatalkan dan saldo order dihitung ulang. Tindakan ini tercatat di log audit."}
        </p>
        <Field label="Alasan" required hint="Minimal 5 karakter">
          <textarea
            autoFocus
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            className={inputCls}
            placeholder="Contoh: nominal pada bukti tidak sesuai / salah input nominal"
          />
        </Field>
        <div className="flex gap-2">
          <GhostButton onClick={close} className="flex-1">
            Batal
          </GhostButton>
          <PrimaryButton
            onClick={submitReason}
            loading={busyId === pending.payment.id}
            disabled={reason.trim().length < 5}
            className="flex-1 !bg-red-600 hover:!bg-red-700"
          >
            {pending.type === "reject" ? "Tolak" : "Void"}
          </PrimaryButton>
        </div>
      </div>
    </ModalShell>
  ) : null;

  return {
    busyId,
    verify,
    openProof,
    reject: (p: PaymentRow) => setPending({ type: "reject", payment: p }),
    voidPayment: (p: PaymentRow) => setPending({ type: "void", payment: p }),
    node,
  };
}
