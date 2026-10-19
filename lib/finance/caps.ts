// lib/finance/caps.ts
// Hak akses menu Keuangan (aman dipakai di browser maupun server).
//
// Pemetaan permission `keuangan` (tabel Pengguna di Pengaturan):
//   view   -> melihat tagihan, transaksi & laporan
//   create -> menerbitkan/merevisi tagihan & mencatat pembayaran
//   edit   -> memverifikasi / menolak pembayaran
//   delete -> void (koreksi) transaksi
// Super Admin memiliki semua hak. UI hanya memakai ini untuk menampilkan tombol;
// penegakan sebenarnya ada di server (requireFinance) dan RLS database.

import type { UserData } from '@/types';

export type FinAction = 'view' | 'create' | 'edit' | 'delete';
export type FinCaps = Record<FinAction, boolean> & { isSuperAdmin: boolean };

type PermLike = Partial<Record<FinAction, boolean>> | null | undefined;

export function resolveFinanceCaps(
  user: { role?: string | null; roles?: string[] | null } | null | undefined,
  perm: PermLike,
): FinCaps {
  const isSuperAdmin =
    user?.role === 'super_admin' || (Array.isArray(user?.roles) && user!.roles!.includes('super_admin'));
  const p = perm ?? {};
  const create = isSuperAdmin || p.create === true;
  const edit = isSuperAdmin || p.edit === true;
  const del = isSuperAdmin || p.delete === true;
  const view = isSuperAdmin || p.view === true || create || edit || del;
  return { view, create, edit, delete: del, isSuperAdmin };
}

export function getFinanceCaps(user: UserData | null | undefined): FinCaps {
  return resolveFinanceCaps(user, (user?.permissions as { keuangan?: PermLike } | undefined)?.keuangan);
}