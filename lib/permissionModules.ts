// lib/permissionModules.ts
//
// Definisi modul untuk layar Hak Akses + operasi murni (tanpa React) untuk
// menambah / mencabut / mengubah izin. Dipakai PermissionMatrix & UsersTab.
//
// Konsep tampilan: sebuah modul "punya akses" bila ada izin yang aktif di dalamnya.
// Baris modul hanya tampil bila punya akses. "Tambah Akses Modul" menyalakan `view`
// plus izin awal yang dipilih; ikon sampah mencabut semua izin modul itu.
//
// Tambah modul baru: tambah di UserPermissions + DEFAULT_PERMISSIONS (types/index.ts),
// lalu satu objek di MODULE_DEFS di bawah.

import { DEFAULT_PERMISSIONS, type UserPermissions } from "@/types";

export type PermKey = keyof UserPermissions;

/** Kolom aksi di matriks. `view` tidak punya kolom: ia berarti "modul ada di daftar". */
export type PermColumn = "maker" | "approver" | "create" | "edit" | "delete";
export const PERM_COLUMNS: PermColumn[] = ["maker", "approver", "create", "edit", "delete"];

export interface ModuleDef {
  key: PermKey;
  label: string;
  /** Kolom yang tersedia untuk modul ini; isinya = keterangan (tooltip). */
  columns: Partial<Record<PermColumn, string>>;
  /** Izin tambahan di luar kolom (mis. view_all di Pesanan). */
  extras?: { field: string; label: string; hint: string }[];
}

export const MODULE_DEFS: ModuleDef[] = [
  { key: "dashboard", label: "Dashboard", columns: {} },
  {
    key: "orders",
    label: "Pesanan",
    columns: { create: "Buat pesanan", edit: "Edit pesanan", delete: "Hapus pesanan" },
  },
  {
    key: "merchandise",
    label: "Merchandise",
    columns: {
      create: "Buat pesanan merchandise",
      edit: "Edit pesanan merchandise",
      delete: "Hapus pesanan merchandise",
    },
  },
  {
    key: "produksi",
    label: "Produksi",
    columns: { create: "Upload approval", edit: "Update step & kendala", delete: "Hapus file bukti" },
  },
  {
    key: "finishing",
    label: "Finishing & QC",
    columns: { create: "Reset QC", edit: "Cek QC, packing, kirim", delete: "Hapus file finishing" },
  },
  {
    key: "salary",
    label: "Gaji & Upah",
    columns: { create: "Cetak slip gaji", edit: "Edit pesanan dari halaman Gaji" },
  },
  {
    key: "keuangan",
    label: "Keuangan",
    columns: {
      maker: "Maker: menerbitkan/merevisi tagihan, mencatat pembayaran, pengeluaran & refund",
      approver: "Approver: memverifikasi atau menolak pembayaran & pengeluaran, melihat Laporan",
      delete: "Void (batalkan) transaksi",
    },
  },
  {
    key: "harga_pesanan",
    label: "Harga & Pembayaran (Order)",
    columns: { edit: "Isi harga, DP, status & upload bukti bayar", delete: "Hapus bukti pembayaran" },
  },
  { key: "logs", label: "Log Aktivitas", columns: {} },
  {
    key: "settings",
    label: "Pengaturan",
    columns: { create: "Tambah user/tipe", edit: "Edit user/tipe", delete: "Hapus user/tipe" },
  },
  { key: "kalkulator", label: "Kalkulator", columns: {} },
  { key: "config_harga", label: "Config Harga", columns: { edit: "Edit harga" } },
  { key: "trash", label: "Sampah", columns: { delete: "Hapus permanen" } },
  { key: "weekly_notes", label: "Catatan Rapat", columns: {} },
  { key: "nota", label: "Generator Nota", columns: {} },
  {
    key: "po_management",
    label: "PO Management",
    columns: {
      create: "Tambah produk & reseller",
      edit: "Edit setting PO, produk, aktif/nonaktif",
      delete: "Hapus produk & reseller",
    },
  },
];

export const defOf = (key: PermKey): ModuleDef => MODULE_DEFS.find((d) => d.key === key)!;

/** Callback pembatas (Admin tidak boleh memberi izin yang ia sendiri tidak punya). */
export type CanGrant = (key: PermKey, field: string) => boolean;

const modOf = (p: UserPermissions, key: PermKey) => (p[key] ?? {}) as unknown as Record<string, boolean>;

export function getField(p: UserPermissions, key: PermKey, field: string): boolean {
  return modOf(p, key)[field] === true;
}

/** Modul punya akses bila ada satu saja izin yang aktif. */
export function moduleHasAccess(p: UserPermissions, key: PermKey): boolean {
  return Object.values(modOf(p, key)).some((v) => v === true);
}

export function grantedModules(p: UserPermissions): ModuleDef[] {
  return MODULE_DEFS.filter((d) => moduleHasAccess(p, d.key));
}

function withField(p: UserPermissions, key: PermKey, field: string, value: boolean): UserPermissions {
  return { ...p, [key]: { ...modOf(p, key), [field]: value } } as unknown as UserPermissions;
}

/**
 * Ubah satu izin. Menyalakan izin apa pun juga menyalakan `view` modulnya (bila boleh),
 * sehingga baris tidak hilang dan menu bisa dibuka.
 */
export function setField(
  p: UserPermissions,
  key: PermKey,
  field: string,
  value: boolean,
  canGrant?: CanGrant,
): UserPermissions {
  let next = withField(p, key, field, value);
  if (value && field !== "view" && !getField(next, key, "view") && (!canGrant || canGrant(key, "view"))) {
    next = withField(next, key, "view", true);
  }
  return next;
}

/** Cabut semua izin satu modul (kembali ke semua false). */
export function revokeModule(p: UserPermissions, key: PermKey): UserPermissions {
  const base = DEFAULT_PERMISSIONS[key] as unknown as Record<string, boolean>;
  const off: Record<string, boolean> = {};
  for (const f of Object.keys(base)) off[f] = false;
  return { ...p, [key]: off } as unknown as UserPermissions;
}

/** Izin awal yang dipilih di modal "Tambah Akses Modul". */
export interface InitialGrant {
  create: boolean;
  edit: boolean;
  delete: boolean;
  maker: boolean;
  approver: boolean;
}

/**
 * Tambah akses beberapa modul sekaligus. Tiap modul: `view` menyala, ditambah izin awal
 * yang memang ada di kolom modul itu. Izin yang tidak boleh diberikan `canGrant` dilewati;
 * modul yang `view`-nya tidak boleh diberikan dilewati seluruhnya.
 */
export function grantModules(
  p: UserPermissions,
  keys: PermKey[],
  initial: InitialGrant,
  canGrant?: CanGrant,
): UserPermissions {
  let next = p;
  const ok = (k: PermKey, f: string) => !canGrant || canGrant(k, f);
  for (const key of keys) {
    if (!ok(key, "view")) continue;
    next = withField(next, key, "view", true);
    for (const col of PERM_COLUMNS) {
      if (defOf(key).columns[col] === undefined) continue;
      if (initial[col] && ok(key, col)) next = withField(next, key, col, true);
    }
  }
  return next;
}

/** Ringkasan singkat untuk daftar user: ["Keuangan · Maker", "Pesanan", ...]. */
export function summarizeAccess(p: UserPermissions): { label: string; tone: "plain" | "role" }[] {
  const out: { label: string; tone: "plain" | "role" }[] = [];
  for (const d of grantedModules(p)) {
    out.push({ label: d.label, tone: "plain" });
    if (d.key === "keuangan") {
      if (getField(p, "keuangan", "maker")) out.push({ label: "Keuangan · Maker", tone: "role" });
      if (getField(p, "keuangan", "approver")) out.push({ label: "Keuangan · Approver", tone: "role" });
    }
  }
  return out;
}

/**
 * Normalisasi `permissions` dari database untuk layar Hak Akses.
 *  - modul yang belum ada di data user lama → semua false (sama seperti perilaku aplikasi:
 *    `p?.modul?.view` kosong = tidak punya akses),
 *  - `merchandise` yang belum ada diwarisi dari `orders` (dulu menu Merchandise ikut Pesanan),
 *  - Keuangan lama: create → maker, edit → approver (hanya bila kunci barunya belum tertulis),
 *    kunci create/edit lama dibuang.
 */
export function normalizePermissions(raw: unknown): UserPermissions {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown> | undefined>;
  const out: Record<string, Record<string, boolean>> = {};
  for (const [mod, defaults] of Object.entries(DEFAULT_PERMISSIONS) as [string, Record<string, boolean>][]) {
    const base = mod === "merchandise" && !src.merchandise ? src.orders : src[mod];
    out[mod] = {};
    for (const f of Object.keys(defaults)) out[mod][f] = base?.[f] === true;
  }
  const k = src.keuangan;
  if (k) {
    if (typeof k.maker !== "boolean") out.keuangan.maker = k.create === true;
    if (typeof k.approver !== "boolean") out.keuangan.approver = k.edit === true;
  }
  return out as unknown as UserPermissions;
}

/** Dua set izin sama persis? (izin yang tidak ada dianggap false) */
export function permissionsEqual(a: unknown, b: unknown): boolean {
  const A = (a && typeof a === "object" ? a : {}) as Record<string, Record<string, unknown> | undefined>;
  const B = (b && typeof b === "object" ? b : {}) as Record<string, Record<string, unknown> | undefined>;
  for (const m of new Set([...Object.keys(A), ...Object.keys(B)])) {
    for (const f of new Set([...Object.keys(A[m] ?? {}), ...Object.keys(B[m] ?? {})])) {
      if ((A[m]?.[f] === true) !== (B[m]?.[f] === true)) return false;
    }
  }
  return true;
}
