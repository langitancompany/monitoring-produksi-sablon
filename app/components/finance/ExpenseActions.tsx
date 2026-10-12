"use client";

import React, { useCallback, useState } from "react";
import { useDialog } from "@/app/components/ui/DialogProvider";
import { finFetch, postJson, errMsg } from "@/hooks/useFinanceApi";
import type { ExpenseRow } from "@/lib/finance/types";
import { ModalShell, Field, inputCls, PrimaryButton, GhostButton } from "./ui";
import { formatRupiah } from "./utils";

type Pending = { type: "reject" | "void"; expense: ExpenseRow } | null;

/**
 * Aksi atas satu pengeluaran: setujui, tolak (+alasan), void (+alasan), buka bukti.
 * `node` harus dirender oleh pemakai agar dialog alasan muncul.
 */
export function useExpenseActions(onDone: () => void) {
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

  const approve = (x: ExpenseRow) =>
    run(
      x.id,
      () => postJson(`/api/finance/expenses/${x.id}/decide`, { action: "approve" }),
      "Pengeluaran disetujui",
    );

  const openProof = async (x: ExpenseRow) => {
    // Buka tab dulu (sinkron) supaya tidak diblokir popup blocker, lalu arahkan setelah URL siap.
    const w = window.open("about:blank", "_blank");
    setBusyId(x.id);
    try {
      const r = await finFetch<{ url: string }>(`/api/finance/expenses/${x.id}/proof`);
      if (w) w.location.href = r.url;
      else window.location.href = r.url;
    } catch (e) {
      w?.close();
      notify(errMsg(e), { title: "Gagal membuka bukti" });
    } finally {
      setBusyId(null);
    }
  };

  const submitReason = async () => {
    if (!pending) return;
    const { type, expense } = pending;
    const ok = await run(
      expense.id,
      () =>
        type === "reject"
          ? postJson(`/api/finance/expenses/${expense.id}/decide`, { action: "reject", reason })
          : postJson(`/api/finance/expenses/${expense.id}/void`, { reason }),
      type === "reject" ? "Pengeluaran ditolak" : "Pengeluaran dibatalkan (void)",
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
      title={pending.type === "reject" ? "Tolak pengeluaran" : "Batalkan pengeluaran (void)"}
      subtitle={`${formatRupiah(pending.expense.amount)} · ${pending.expense.expense_no ?? ""}`}
      onClose={close}
    >
      <div className="space-y-4">
        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
          {pending.type === "reject"
            ? "Pengeluaran ini tidak akan dihitung sebagai uang keluar."
            : "Pengeluaran tidak dihapus: statusnya menjadi Dibatalkan dan tidak lagi dihitung di buku kas. Tindakan ini tercatat di log audit."}
        </p>
        <Field label="Alasan" required hint="Minimal 5 karakter">
          <textarea
            autoFocus
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            className={inputCls}
            placeholder="Contoh: nota tidak sesuai / salah input nominal / pembelian dibatalkan"
          />
        </Field>
        <div className="flex gap-2">
          <GhostButton onClick={close} className="flex-1">
            Batal
          </GhostButton>
          <PrimaryButton
            onClick={submitReason}
            loading={busyId === pending.expense.id}
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
    approve,
    openProof,
    reject: (x: ExpenseRow) => setPending({ type: "reject", expense: x }),
    voidExpense: (x: ExpenseRow) => setPending({ type: "void", expense: x }),
    node,
  };
}
