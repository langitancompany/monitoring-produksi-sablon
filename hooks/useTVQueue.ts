// hooks/useTVQueue.ts
//
// Mengambil data antrian untuk TV dan menyegarkannya otomatis.
//  - "Total antri"        = jumlah order yang belum selesai
//  - "Masuk bulan ini"    = order dengan tanggal_masuk di bulan berjalan
//                           (termasuk yang sudah selesai, tidak termasuk sampah)

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildQueue, monthRange, type TVOrder } from "@/lib/tvQueue";

const SELECT_COLUMNS = `
  id, kode_produksi, nama_pemesan, jumlah, jenis_produksi, status,
  tanggal_masuk, deadline, link_approval, steps_manual, steps_dtf, steps_merchandise, jenis_merchandise, varian_merchandise,
  finishing_qc, finishing_packing, shipping, kendala,
  assigned_user:users!assigned_to ( name, avatar_url ),
  helper_user:users!helper_id ( name, avatar_url )
`;

export type TVAuthState = "checking" | "ok" | "no-session";

export function useTVQueue(refreshSeconds = 30) {
  // Dibuat SEKALI (lazy initializer), bukan tiap render.
  const [supabase] = useState(() => createClient());

  const [queue, setQueue] = useState<TVOrder[]>([]);
  const [monthTotal, setMonthTotal] = useState(0);
  const [auth, setAuth] = useState<TVAuthState>("checking");
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setAuth("no-session");
        return;
      }
      setAuth("ok");

      const [from, to] = monthRange();

      const [activeRes, monthRes] = await Promise.all([
        supabase
          .from("orders")
          .select(SELECT_COLUMNS)
          .is("deleted_at", null)
          .neq("status", "Selesai"),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .gte("tanggal_masuk", from)
          .lt("tanggal_masuk", to),
      ]);

      if (activeRes.error) throw activeRes.error;
      if (monthRes.error) throw monthRes.error;

      const rows = (activeRes.data ?? []).map((o: any) => ({
        ...o,
        kendala: Array.isArray(o.kendala) ? o.kendala : [],
      })) as TVOrder[];

      setQueue(buildQueue(rows));
      setMonthTotal(monthRes.count ?? 0);
      setOffline(false);
      setUpdatedAt(new Date());
      setLoaded(true);
    } catch (err) {
      // Data lama tetap ditampilkan; cukup tandai koneksi bermasalah.
      console.error("[TV] gagal memuat antrian:", err);
      setOffline(true);
    }
  }, [supabase]);

  // Muat pertama + polling berkala
  useEffect(() => {
    load();
    const id = setInterval(load, refreshSeconds * 1000);
    return () => clearInterval(id);
  }, [load, refreshSeconds]);

  // Segarkan saat tab/layar aktif lagi
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  return { queue, monthTotal, auth, loaded, offline, updatedAt };
}