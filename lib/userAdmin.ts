// lib/userAdmin.ts
//
// Pembantu SERVER untuk mengelola user (dipakai app/api/users/route.ts).
// Login memakai Supabase Auth yang DIPAKAI BERSAMA semua unit (Sablon,
// Konveksi, ...), sedangkan tabel `users` ada per unit. Karena itu:
//  - email yang sudah punya akun login di unit lain → akun DITAUTKAN
//    (hanya membuat profil Sablon), password-nya tidak diubah;
//  - menghapus user hanya menghapus akun login bila tidak dipakai unit lain.

import type { SupabaseClient } from '@supabase/supabase-js';
import { ROLE_OPTIONS } from '@/lib/roles';
import { DEFAULT_PERMISSIONS, type UserPermissions } from '@/types';

/** Role yang boleh menambah/ubah/hapus user (selaras dengan policy RLS tabel users). */
export const USER_MANAGER_ROLES = ['admin', 'super_admin'];

/**
 * Schema unit LAIN yang berbagi Supabase Auth ini (dipisah koma).
 * Dipakai untuk memastikan akun login tidak dihapus bila masih dipakai unit lain.
 * Isi lewat env OTHER_UNIT_SCHEMAS, mis. "monitoring_konveksi,monitoring_percetakan".
 */
export function otherUnitSchemas(): string[] {
  return (process.env.OTHER_UNIT_SCHEMAS ?? 'monitoring_konveksi')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const VALID_ROLES: string[] = ROLE_OPTIONS.map((r) => r.value);

export interface CleanUser {
  name: string;
  email: string;
  roles: string[];
  no_wa: string | null;
  permissions: UserPermissions;
  password: string | null;
}

/** Ambil hanya field yang dikenal; semua izin dipaksa boolean murni. */
export function sanitizePermissions(raw: unknown): UserPermissions {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const out: Record<string, Record<string, boolean>> = {};
  for (const [mod, defaults] of Object.entries(DEFAULT_PERMISSIONS) as [
    string,
    Record<string, boolean>,
  ][]) {
    out[mod] = {};
    for (const action of Object.keys(defaults)) {
      const v = src?.[mod]?.[action];
      out[mod][action] = typeof v === 'boolean' ? v : defaults[action];
    }
  }
  // User lama (sebelum Maker/Approver): create -> maker, edit -> approver. Sama dengan
  // normalizePermissions (UI) & resolveFinanceCaps, supaya data lama tidak hilang saat disimpan.
  const k = src?.keuangan;
  if (k && typeof k === 'object') {
    if (typeof k.maker !== 'boolean') out.keuangan.maker = k.create === true;
    if (typeof k.approver !== 'boolean') out.keuangan.approver = k.edit === true;
  }
  return out as unknown as UserPermissions;
}

export function validateUserInput(
  body: any,
  opts: { emailRequired: boolean },
): { ok: true; value: CleanUser } | { ok: false; error: string } {
  const name = String(body?.name ?? '').trim();
  if (name.length < 2 || name.length > 100) {
    return { ok: false, error: 'Nama wajib diisi (2–100 karakter)' };
  }

  const email = String(body?.username ?? body?.email ?? '').trim().toLowerCase();
  if (opts.emailRequired && (!EMAIL_RE.test(email) || email.length > 254)) {
    return { ok: false, error: 'Email login tidak valid' };
  }

  const roles: string[] = Array.isArray(body?.roles)
    ? Array.from(new Set(body.roles.map(String)))
    : [];
  if (roles.length === 0 || roles.some((r) => !VALID_ROLES.includes(r))) {
    return { ok: false, error: 'Pilih minimal satu role yang valid' };
  }

  const waRaw = String(body?.no_wa ?? '').replace(/[^\d+]/g, '');
  if (waRaw.length > 20) return { ok: false, error: 'Nomor WhatsApp terlalu panjang' };

  const passRaw = typeof body?.password === 'string' ? body.password : '';
  if (passRaw && (passRaw.length < 8 || passRaw.length > 72)) {
    return { ok: false, error: 'Password minimal 8 karakter (maksimal 72)' };
  }

  return {
    ok: true,
    value: {
      name,
      email,
      roles,
      no_wa: waRaw || null,
      permissions: sanitizePermissions(body?.permissions),
      password: passRaw || null,
    },
  };
}

export function rolesOf(row: { role?: string | null; roles?: string[] | null } | null) {
  if (!row) return [] as string[];
  const set = new Set<string>(Array.isArray(row.roles) ? row.roles : []);
  if (row.role) set.add(row.role);
  return Array.from(set);
}

/** Cari akun login (Supabase Auth) berdasarkan email. */
export async function findAuthUserByEmail(admin: SupabaseClient<any, any, any>, email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 1000) break;
  }
  return null;
}

/** Jumlah Super Admin di unit ini, tidak termasuk `exceptId`. */
export async function countOtherSuperAdmins(
  admin: SupabaseClient<any, any, any>,
  exceptId: string,
): Promise<number> {
  const { data } = await admin.from('users').select('id, role, roles').neq('id', exceptId);
  return (data ?? []).filter((u: any) => rolesOf(u).includes('super_admin')).length;
}

/**
 * Apakah akun login ini masih dipakai unit lain? `unknown` = tidak bisa dipastikan
 * (schema tidak terbaca) → perlakukan sebagai "masih dipakai" demi keamanan.
 */
export async function usedByOtherUnit(
  getAdmin: (schema: string) => SupabaseClient<any, any, any>,
  userId: string,
): Promise<{ used: boolean; unknown: boolean }> {
  let unknown = false;
  for (const schema of otherUnitSchemas()) {
    try {
      const { data, error } = await getAdmin(schema)
        .from('users')
        .select('id')
        .eq('id', userId)
        .maybeSingle();
      if (error) unknown = true;
      else if (data) return { used: true, unknown };
    } catch {
      unknown = true;
    }
  }
  return { used: unknown, unknown };
}
