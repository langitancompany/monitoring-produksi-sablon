// hooks/useFinanceApi.ts
// Pemanggil API keuangan. Semua operasi uang lewat /api/finance/* (server), tidak langsung ke Supabase.

import { useCallback, useEffect, useState } from "react";
import type { FinanceMeta } from "@/lib/finance/types";

export class FinanceApiError extends Error {
  status: number;
  code?: string;
  data?: Record<string, unknown>;
  constructor(message: string, status: number, data?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = typeof data?.code === "string" ? data.code : undefined;
    this.data = data;
  }
}

export async function finFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new FinanceApiError(body?.error ?? `Permintaan gagal (${res.status})`, res.status, body ?? undefined);
  }
  return body as T;
}

export const postJson = <T,>(url: string, payload: unknown) =>
  finFetch<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Terjadi kesalahan");

/** Akun kas/bank, pengaturan, dan jumlah transaksi menunggu verifikasi. */
export function useFinanceMeta() {
  const [meta, setMeta] = useState<FinanceMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setMeta(await finFetch<FinanceMeta>("/api/finance/meta"));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { meta, error, reload };
}