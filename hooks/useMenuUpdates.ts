// hooks/useMenuUpdates.ts
//
// Melacak kapan user pertama kali membuka menu yang punya update baru.
// Penanda tetap tampil sampai MENU_BADGE_GRACE_MINUTES menit setelah
// pembukaan pertama, lalu hilang. Data disimpan di localStorage per user.
import { useCallback, useEffect, useState } from "react";
import {
  getActiveMenuUpdate,
  MenuUpdate,
  MENU_BADGE_GRACE_MINUTES,
} from "@/lib/menuUpdates";

const storageKey = (userId: string) => `menu_updates_seen:${userId}`;

interface OpenedInfo {
  id: string; // id update yang dibuka
  openedAt: number; // epoch ms, pembukaan PERTAMA untuk id tersebut
}
type OpenedMap = Record<string, OpenedInfo | string>; // string = format lama

const GRACE_MS = MENU_BADGE_GRACE_MINUTES * 60_000;
const TICK_MS = 30_000;

function normalize(v: OpenedInfo | string | undefined): OpenedInfo | undefined {
  if (!v) return undefined;
  // Format lama (hanya id) dianggap sudah dibuka lama → penanda tidak tampil.
  return typeof v === "string" ? { id: v, openedAt: 0 } : v;
}

export function useMenuUpdates(userId: string | undefined, activeTab: string) {
  // null = belum dibaca dari localStorage (cegah penanda berkedip saat load)
  const [opened, setOpened] = useState<OpenedMap | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!userId) return;
    try {
      const raw = localStorage.getItem(storageKey(userId));
      setOpened(raw ? (JSON.parse(raw) as OpenedMap) : {});
    } catch {
      setOpened({});
    }
  }, [userId]);

  // Detak berkala agar penanda hilang sendiri saat batas waktunya lewat.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, []);

  // Catat waktu pembukaan pertama menu yang punya update aktif.
  useEffect(() => {
    if (!userId || opened === null) return;
    const update = getActiveMenuUpdate(activeTab);
    if (!update) return;
    if (normalize(opened[activeTab])?.id === update.id) return; // sudah tercatat
    const next: OpenedMap = {
      ...opened,
      [activeTab]: { id: update.id, openedAt: Date.now() },
    };
    setOpened(next);
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(next));
    } catch {
      /* penyimpanan penuh/diblokir — penanda hanya berlaku selama sesi ini */
    }
  }, [activeTab, opened, userId]);

  /** Update yang masih perlu ditandai untuk menu ini, atau undefined. */
  const getBadge = useCallback(
    (menuId: string): MenuUpdate | undefined => {
      if (opened === null) return undefined;
      const update = getActiveMenuUpdate(menuId);
      if (!update) return undefined;
      const info = normalize(opened[menuId]);
      if (!info || info.id !== update.id) return update; // belum pernah dibuka
      return now - info.openedAt < GRACE_MS ? update : undefined;
    },
    [opened, now],
  );

  return { getBadge };
}