// hooks/useInvoiceSettings.ts
// Pengaturan invoice (header, rekening, TTD) dari server.

import { useCallback, useEffect, useState } from "react";
import { finFetch, errMsg } from "@/hooks/useFinanceApi";
import {
  DEFAULT_INVOICE_SETTINGS,
  type InvoiceSettings,
} from "@/lib/finance/invoiceSettings";

export function useInvoiceSettings() {
  const [settings, setSettings] = useState<InvoiceSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  // true hanya bila data asli dari server berhasil dimuat (melindungi dari menimpa dengan nilai bawaan).
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const r = await finFetch<{ settings: InvoiceSettings }>(
        "/api/finance/invoice-settings",
      );
      setSettings(r.settings);
      setLoaded(true);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
      // Gagal memuat tidak boleh menghalangi invoice: pakai bawaan.
      setSettings((s) => s ?? DEFAULT_INVOICE_SETTINGS);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(async (next: InvoiceSettings) => {
    const r = await finFetch<{ settings: InvoiceSettings }>(
      "/api/finance/invoice-settings",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: next }),
      },
    );
    setSettings(r.settings);
    setLoaded(true);
    return r.settings;
  }, []);

  return { settings, loaded, error, reload, save };
}