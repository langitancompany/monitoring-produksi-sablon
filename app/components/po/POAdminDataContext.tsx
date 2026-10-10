"use client";

// Data bersama untuk tab-tab admin PO (Pesanan, Pengemasan, Pengiriman, Rekap).
// Sebelumnya tiap tab mengambil ulang semua pesanan sendiri-sendiri setiap
// kali dibuka. Sekarang diambil sekali per PO dan dipakai bersama, jadi
// pindah tab langsung tampil, dan perubahan di satu tab (mis. status stok
// di Pengemasan) langsung terlihat di tab lain.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  getAllPOOrders,
  getAllPOProducts,
  getPOSettingAdmin,
} from "@/lib/po/admin";
import type { POOrder, POProduct, POSetting } from "@/types/po";

// Data lebih tua dari ini dianggap perlu disegarkan saat tab dibuka
// (untuk kasus ada admin lain yang mengubah data di waktu yang sama).
const STALE_AFTER_MS = 60_000;

interface POAdminData {
  orders: POOrder[];
  setOrders: Dispatch<SetStateAction<POOrder[]>>;
  products: POProduct[];
  setting: POSetting | null;
  /** true hanya saat pemuatan pertama (belum ada data sama sekali). */
  loading: boolean;
  /** true saat tombol Refresh ditekan. */
  refreshing: boolean;
  /** Ambil ulang dari server (dipakai tombol Refresh & rollback). */
  reload: () => Promise<void>;
  /** Tandai data basi; akan diambil ulang saat tab data dibuka lagi. */
  markStale: () => void;
  ensureFresh: () => void;
}

const POAdminDataContext = createContext<POAdminData | null>(null);

export function POAdminDataProvider({
  poId,
  children,
}: {
  poId: string;
  children: ReactNode;
}) {
  const [orders, setOrders] = useState<POOrder[]>([]);
  const [products, setProducts] = useState<POProduct[]>([]);
  const [setting, setSetting] = useState<POSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const staleRef = useRef(true);
  const loadedAtRef = useRef(0);
  const inflightRef = useRef<Promise<void> | null>(null);

  const fetchAll = useCallback(
    (showRefreshing: boolean): Promise<void> => {
      if (inflightRef.current) return inflightRef.current;
      if (showRefreshing) setRefreshing(true);

      const run = (async () => {
        try {
          const [ords, prods, st] = await Promise.all([
            getAllPOOrders(poId),
            getAllPOProducts(poId),
            getPOSettingAdmin(poId),
          ]);
          setOrders(ords || []);
          setProducts(prods || []);
          setSetting(st);
          staleRef.current = false;
          loadedAtRef.current = Date.now();
        } finally {
          setLoading(false);
          setRefreshing(false);
          inflightRef.current = null;
        }
      })();

      inflightRef.current = run;
      return run;
    },
    [poId],
  );

  const ensureFresh = useCallback(() => {
    const tooOld = Date.now() - loadedAtRef.current > STALE_AFTER_MS;
    if (staleRef.current || tooOld) void fetchAll(false);
  }, [fetchAll]);

  const markStale = useCallback(() => {
    staleRef.current = true;
  }, []);

  const reload = useCallback(() => fetchAll(true), [fetchAll]);

  const value = useMemo<POAdminData>(
    () => ({
      orders,
      setOrders,
      products,
      setting,
      loading,
      refreshing,
      reload,
      markStale,
      ensureFresh,
    }),
    [
      orders,
      products,
      setting,
      loading,
      refreshing,
      reload,
      markStale,
      ensureFresh,
    ],
  );

  return (
    <POAdminDataContext.Provider value={value}>
      {children}
    </POAdminDataContext.Provider>
  );
}

/** Dipakai tab yang butuh pesanan/produk/pengaturan. Otomatis memastikan data segar. */
export function usePOAdminData(): POAdminData {
  const ctx = useContext(POAdminDataContext);
  if (!ctx) {
    throw new Error(
      "usePOAdminData harus dipakai di dalam POAdminDataProvider",
    );
  }
  const { ensureFresh } = ctx;
  useEffect(() => {
    ensureFresh();
  }, [ensureFresh]);
  return ctx;
}

/**
 * Dipakai tab yang MENGUBAH data master (Produk, Reseller, Pengaturan):
 * begitu tab ditinggalkan, data bersama ditandai basi dan diambil ulang
 * saat tab Pesanan/Rekap/dll dibuka berikutnya.
 */
export function useMarkPODataStaleOnLeave() {
  const ctx = useContext(POAdminDataContext);
  const markStale = ctx?.markStale;
  useEffect(() => {
    return () => markStale?.();
  }, [markStale]);
}
