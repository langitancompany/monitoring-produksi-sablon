// lib/menuAccess.ts
//
// Satu sumber kebenaran: menu (tab) mana yang boleh dibuka user. Urutannya sama
// dengan Sidebar, jadi tab pertama yang lolos = menu paling atas yang terlihat.
// "about" (Tentang App) selalu ada untuk semua user dan tidak diatur lewat izin.

import type { UserPermissions } from "@/types";

export type TabId =
  | "dashboard"
  | "orders"
  | "merchandise"
  | "calendar"
  | "completed_orders"
  | "finance"
  | "po_management"
  | "logs"
  | "weekly_notes"
  | "kalkulator"
  | "config_harga"
  | "salary"
  | "nota"
  | "settings"
  | "trash"
  | "about";

const RULES: Record<TabId, (p: UserPermissions) => boolean> = {
  dashboard: (p) => !!p?.dashboard?.view,
  orders: (p) => !!p?.orders?.view,
  merchandise: (p) => !!p?.merchandise?.view,
  calendar: (p) => !!p?.calendar?.view,
  completed_orders: (p) => !!p?.orders?.view,
  finance: (p) => !!p?.keuangan?.view,
  po_management: (p) => !!p?.po_management?.view,
  logs: (p) => !!p?.logs?.view,
  // Sidebar memakai izin Log Aktivitas untuk menu ini; dijaga sama di sini.
  weekly_notes: (p) => !!p?.logs?.view,
  kalkulator: (p) => !!p?.kalkulator?.view,
  config_harga: (p) => !!p?.config_harga?.view,
  salary: (p) => !!p?.salary?.view,
  nota: (p) => !!p?.nota?.view,
  settings: (p) => !!p?.settings?.view,
  trash: (p) => !!p?.trash?.view,
  about: () => true,
};

/** Urutan prioritas halaman awal. */
export const TAB_ORDER = Object.keys(RULES) as TabId[];

export function canAccessTab(p: UserPermissions | undefined, tab: string): boolean {
  const rule = RULES[tab as TabId];
  return !!rule && rule(p as UserPermissions);
}

/** Menu pertama yang boleh dibuka; bila tidak ada satu pun, "about". */
export function firstAccessibleTab(p: UserPermissions | undefined): TabId {
  return TAB_ORDER.find((t) => canAccessTab(p, t)) ?? "about";
}
