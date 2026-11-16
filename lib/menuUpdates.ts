// lib/menuUpdates.ts
//
// Penanda "BARU" / "UPDATE" pada menu sidebar.
//
// CARA PAKAI — tiap kali ada menu baru atau fitur menu diperbarui, tambahkan
// SATU baris di MENU_UPDATES di bawah ini:
//   - menuId : id menu di Sidebar (mis. "calendar", "salary", "finance")
//   - id     : kode unik rilis ini, bebas tapi harus BERBEDA dari yang lama
//              (mis. "calendar-18.7"). Mengganti id = penanda muncul lagi
//              untuk semua user, walau menu itu sudah pernah mereka buka.
//   - type   : "new" (menu baru) atau "update" (fitur diperbarui)
//   - date   : tanggal rilis (YYYY-MM-DD). Penanda otomatis berhenti tampil
//              setelah MENU_UPDATE_DAYS hari, supaya user/perangkat baru tidak
//              melihat penanda yang sudah basi.
//   - note   : keterangan singkat (tampil sebagai tooltip saat disorot)
// Cukup satu entri per menu; hapus/ganti entri lama milik menu yang sama.
//
// Penanda hilang MENU_BADGE_GRACE_MINUTES menit (default 60) setelah user
// pertama kali membuka menu tersebut. Waktu buka disimpan per user di
// perangkat yang dipakai (localStorage).

export type MenuUpdateType = "new" | "update";

export interface MenuUpdate {
  menuId: string;
  id: string;
  type: MenuUpdateType;
  date: string;
  note: string;
}

export const MENU_UPDATE_DAYS = 30;

/**
 * Penanda tidak hilang seketika saat menu dibuka, tapi tetap tampil selama
 * sekian menit sejak PERTAMA kali menu itu dibuka (supaya user sempat melihat
 * dan tidak langsung kehilangan petunjuk). Ubah angka ini untuk mengatur durasi.
 */
export const MENU_BADGE_GRACE_MINUTES = 60;

export const MENU_UPDATES: MenuUpdate[] = [
  {
    menuId: "calendar",
    id: "calendar-18.7",
    type: "update",
    date: "2026-11-16",
    note: "Baru: beban kerja petugas produksi di samping kalender",
  },
];

/** Update aktif (belum kedaluwarsa) untuk satu menu, atau undefined. */
export function getActiveMenuUpdate(
  menuId: string,
  now: Date = new Date(),
): MenuUpdate | undefined {
  const u = MENU_UPDATES.find((x) => x.menuId === menuId);
  if (!u) return undefined;
  const released = new Date(u.date + "T00:00:00");
  if (isNaN(released.getTime())) return u;
  const ageDays = (now.getTime() - released.getTime()) / 86_400_000;
  return ageDays <= MENU_UPDATE_DAYS ? u : undefined;
}