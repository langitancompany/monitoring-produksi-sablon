// lib/roles.ts
//
// Satu user boleh punya BEBERAPA role sekaligus (mis. Admin + Designer).
//  - kolom `roles` (text[]) menyimpan semua role yang dipilih
//  - kolom `role` (lama) tetap diisi satu "role utama" — dipakai pengecekan
//    akses yang membandingkan `role === 'super_admin'` dll, supaya tidak ada
//    yang rusak. Role utama dipilih otomatis lewat primaryRole().
// User lama yang kolom `roles`-nya masih kosong dianggap punya satu role:
// isi kolom `role`-nya.

export const ROLE_OPTIONS = [
  { value: "super_admin", label: "Super Admin" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
  { value: "produksi", label: "Produksi" },
  { value: "qc", label: "QC" },
  { value: "designer", label: "Designer" },
] as const;

// Urutan prioritas untuk memilih role utama (kolom `role`). 'designer' tidak
// masuk karena bukan role lama; kalau hanya Designer yang dipilih, role
// utamanya 'produksi' (hak akses tetap diatur per user di tabel permission).
const PRIMARY_PRIORITY = ["super_admin", "manager", "admin", "produksi", "qc"];

type RoleHolder = { role?: string | null; roles?: string[] | null };

export function getUserRoles(user: RoleHolder | null | undefined): string[] {
  if (!user) return [];
  if (user.roles && user.roles.length > 0) return user.roles;
  return user.role ? [user.role] : [];
}

export function hasRole(user: RoleHolder | null | undefined, role: string) {
  return getUserRoles(user).includes(role);
}

export function primaryRole(roles: string[]): string {
  return PRIMARY_PRIORITY.find((r) => roles.includes(r)) ?? "produksi";
}

export function roleLabel(role: string): string {
  return ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role;
}