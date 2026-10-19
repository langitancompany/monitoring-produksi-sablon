// app/api/users/route.ts
//
// Kelola user dalam SATU langkah (akun login + profil), hanya admin/Super Admin.
//   POST   → tambah user    {name, username(email), password?, roles[], no_wa, permissions}
//   PATCH  → ubah user      {id, name, roles[], no_wa, permissions, password?}
//   DELETE → hapus user     {userId}
//
// Semua tulis ke tabel `users` terjadi DI SINI (service role) — bukan dari
// browser — sehingga password tidak pernah disimpan di tabel `users` dan
// aturan "hanya Super Admin yang boleh mengurus Super Admin" ditegakkan di server.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';
import { primaryRole } from '@/lib/roles';
import {
  USER_MANAGER_ROLES,
  validateUserInput,
  rolesOf,
  findAuthUserByEmail,
  countOtherSuperAdmins,
  usedByOtherUnit,
} from '@/lib/userAdmin';

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

async function authorize(req: NextRequest) {
  const guard = await requireUser(req, USER_MANAGER_ROLES);
  if (!guard.ok) return { response: guard.response } as const;

  const { data: caller } = await getSupabaseAdmin()
    .from('users')
    .select('role, roles')
    .eq('id', guard.userId)
    .single();

  return {
    callerId: guard.userId,
    callerIsSuperAdmin: rolesOf(caller).includes('super_admin'),
  } as const;
}

// ─── POST: tambah user ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await authorize(req);
  if ('response' in auth) return auth.response;

  let body: any;
  try { body = await req.json(); } catch { return fail('Permintaan tidak valid', 400); }

  const parsed = validateUserInput(body, { emailRequired: true });
  if (!parsed.ok) return fail(parsed.error, 400);
  const v = parsed.value;

  if (v.roles.includes('super_admin') && !auth.callerIsSuperAdmin) {
    return fail('Hanya Super Admin yang boleh membuat akun Super Admin', 403);
  }

  const admin = getSupabaseAdmin();

  // Email sudah punya profil di Sablon?
  const { data: dup } = await admin.from('users').select('id').eq('username', v.email).maybeSingle();
  if (dup) return fail('Email ini sudah terdaftar di Sablon', 409);

  // Akun login sudah ada (mis. dipakai di Konveksi)? → tautkan, jangan ubah password.
  let authId: string;
  let linked = false;
  let createdAuth = false;
  try {
    const existing = await findAuthUserByEmail(admin, v.email);
    if (existing) {
      authId = existing.id;
      linked = true;
    } else {
      if (!v.password) return fail('Password wajib diisi untuk akun baru (minimal 8 karakter)', 400);
      const { data, error } = await admin.auth.admin.createUser({
        email: v.email,
        password: v.password,
        email_confirm: true,
        user_metadata: { name: v.name },
      });
      if (error || !data.user) {
        return fail(error?.message ?? 'Gagal membuat akun login', 422);
      }
      authId = data.user.id;
      createdAuth = true;
    }
  } catch (e: any) {
    return fail(e?.message ?? 'Gagal memeriksa akun login', 500);
  }

  const { error: insertError } = await admin.from('users').insert([{
    id: authId,
    username: v.email,
    name: v.name,
    role: primaryRole(v.roles),
    roles: v.roles,
    permissions: v.permissions,
    no_wa: v.no_wa,
  }]);

  if (insertError) {
    // Batalkan akun login yang baru dibuat supaya tidak menggantung tanpa profil.
    if (createdAuth) await admin.auth.admin.deleteUser(authId);
    const dupId = insertError.code === '23505';
    return fail(dupId ? 'User ini sudah terdaftar di Sablon' : insertError.message, dupId ? 409 : 500);
  }

  return NextResponse.json({ success: true, id: authId, linked }, { status: 201 });
}

// ─── PATCH: ubah user ─────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const auth = await authorize(req);
  if ('response' in auth) return auth.response;

  let body: any;
  try { body = await req.json(); } catch { return fail('Permintaan tidak valid', 400); }

  const id = String(body?.id ?? '');
  if (!id) return fail('id user wajib', 400);

  const parsed = validateUserInput(body, { emailRequired: false });
  if (!parsed.ok) return fail(parsed.error, 400);
  const v = parsed.value;

  const admin = getSupabaseAdmin();
  const { data: target } = await admin.from('users').select('id, role, roles, username').eq('id', id).maybeSingle();
  if (!target) return fail('User tidak ditemukan', 404);

  const wasSuperAdmin = rolesOf(target).includes('super_admin');
  const willBeSuperAdmin = v.roles.includes('super_admin');

  if ((wasSuperAdmin || willBeSuperAdmin !== wasSuperAdmin) && !auth.callerIsSuperAdmin) {
    return fail('Hanya Super Admin yang boleh mengubah akun atau role Super Admin', 403);
  }
  if (wasSuperAdmin && !willBeSuperAdmin && (await countOtherSuperAdmins(admin, id)) === 0) {
    return fail('Tidak bisa menurunkan Super Admin terakhir', 409);
  }

  // Email login tidak bisa diubah di sini (akun login dipakai bersama semua unit).
  if (v.email && v.email !== String(target.username).toLowerCase()) {
    return fail('Email login tidak bisa diubah dari sini', 400);
  }

  if (v.password) {
    const { error } = await admin.auth.admin.updateUserById(id, { password: v.password });
    if (error) {
      const status = error.code === 'user_not_found' ? 409 : 422;
      return fail(
        error.code === 'user_not_found'
          ? 'Akun login user ini belum ada di Supabase Auth, password tidak bisa diubah'
          : error.message,
        status,
      );
    }
  }

  const { error: updateError } = await admin.from('users').update({
    name: v.name,
    role: primaryRole(v.roles),
    roles: v.roles,
    permissions: v.permissions,
    no_wa: v.no_wa,
  }).eq('id', id);
  if (updateError) return fail(updateError.message, 500);

  return NextResponse.json({ success: true, passwordChanged: !!v.password });
}

// ─── DELETE: hapus user ───────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const auth = await authorize(req);
  if ('response' in auth) return auth.response;

  let body: any;
  try { body = await req.json(); } catch { return fail('Permintaan tidak valid', 400); }

  const userId = String(body?.userId ?? '');
  if (!userId) return fail('userId wajib', 400);
  if (userId === auth.callerId) return fail('Tidak bisa menghapus akun sendiri', 400);

  const admin = getSupabaseAdmin();
  const { data: target } = await admin.from('users').select('id, role, roles').eq('id', userId).maybeSingle();

  if (target && rolesOf(target).includes('super_admin')) {
    if (!auth.callerIsSuperAdmin) return fail('Hanya Super Admin yang boleh menghapus akun Super Admin', 403);
    if ((await countOtherSuperAdmins(admin, userId)) === 0) {
      return fail('Tidak bisa menghapus Super Admin terakhir', 409);
    }
  }

  // Akun login hanya dihapus bila TIDAK dipakai unit lain (mis. Konveksi).
  const other = await usedByOtherUnit((schema) => getSupabaseAdmin(schema), userId);

  // Bersihkan data milik user di unit ini.
  await admin.from('direksi_access').delete().eq('user_id', userId);
  await admin.from('user_fcm_tokens').delete().eq('user_id', userId);
  await admin.from('notifications').delete().eq('user_id', userId);
  const { error: delError } = await admin.from('users').delete().eq('id', userId);
  if (delError) return fail(delError.message, 500);

  let authDeleted = false;
  if (!other.used) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error && error.code !== 'user_not_found') return fail(error.message, 500);
    authDeleted = !error;
  }

  return NextResponse.json({
    success: true,
    authDeleted,
    authKept: other.used,
    authKeptUnsure: other.used && other.unknown,
  });
}
