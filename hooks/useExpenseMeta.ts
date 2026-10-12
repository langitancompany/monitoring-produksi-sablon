// hooks/useExpenseMeta.ts
// Kategori, vendor, akun kas/bank, dan pengaturan untuk form & filter pengeluaran.

import { useCallback, useEffect, useState } from "react";
import { finFetch, errMsg } from "@/hooks/useFinanceApi";
import type { ExpenseMeta, FinanceVendor } from "@/lib/finance/types";

export function useExpenseMeta() {
  const [meta, setMeta] = useState<ExpenseMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setMeta(await finFetch<ExpenseMeta>("/api/finance/expense-meta"));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Tambahkan vendor yang baru dibuat ke daftar tanpa memuat ulang semuanya. */
  const addVendor = useCallback((v: FinanceVendor) => {
    setMeta((m) =>
      m
        ? { ...m, vendors: [...m.vendors, v].sort((a, b) => a.name.localeCompare(b.name)) }
        : m,
    );
  }, []);

  return { meta, error, reload, addVendor };
}
