// lib/finance/caps.ts
// Hak akses menu Keuangan (aman dipakai di browser maupun server).
//
// Pemetaan permission `keuangan` (tabel Pengguna di Pengaturan):
//   view     -> melihat tagihan, transaksi & laporan
//   maker    -> menerbitkan/merevisi tagihan & mencatat pembayaran/pengeluaran/refund
//   approver -> memverifikasi / menolak pembayaran & pengeluaran, melihat laporan
//   delete   -> void (koreksi) transaksi
// Maker dan Approver DIPISAH: punya satu tidak otomatis punya yang lain. Hak "Lihat"
// tidak memberi keduanya. Super Admin memiliki semua hak. UI hanya memakai ini untuk
// menampilkan tombol; penegakan sebenarnya ada di server (requireFinance).
//
// Kompatibilitas: user lama yang belum punya kunci `maker`/`approver` memakai nilai
// `create`/`edit`-nya (migration 013 mengisi permanen; cadangan ini hanya jaga-jaga
// bila kode sudah di-deploy lebih dulu daripada migration).

import type { UserData } from '@/types';

export type FinAction = 'view' | 'maker' | 'approver' | 'delete';
export type FinCaps = Record<FinAction, boolean> & { isSuperAdmin: boolean };

type PermLike =
  | (Partial<Record<FinAction, boolean>> & { create?: boolean; edit?: boolean })
  | null
  | undefined;

export function resolveFinanceCaps(
  user: { role?: string | null; roles?: string[] | null } | null | undefined,
  perm: PermLike,
): FinCaps {
  const isSuperAdmin =
    user?.role === 'super_admin' || (Array.isArray(user?.roles) && user!.roles!.includes('super_admin'));
  const p = perm ?? {};
  const makerFlag = typeof p.maker === 'boolean' ? p.maker : p.create === true;
  const approverFlag = typeof p.approver === 'boolean' ? p.approver : p.edit === true;
  const maker = isSuperAdmin || makerFlag;
  const approver = isSuperAdmin || approverFlag;
  const del = isSuperAdmin || p.delete === true;
  const view = isSuperAdmin || p.view === true || maker || approver || del;
  return { view, maker, approver, delete: del, isSuperAdmin };
}

export function getFinanceCaps(user: UserData | null | undefined): FinCaps {
  return resolveFinanceCaps(user, (user?.permissions as { keuangan?: PermLike } | undefined)?.keuangan);
}
