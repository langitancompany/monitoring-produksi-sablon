// lib/supabase/passkey.ts
// Pembungkus tipis untuk API passkey Supabase Auth
// (auth.registerPasskey / signInWithPasskey / passkey.*).
//
// Passkey = login dengan verifikasi biometrik atau kunci layar PERANGKAT:
// sidik jari di HP Android, Face ID/Touch ID di iPhone/Mac, Windows Hello di
// laptop. Aplikasi tidak pernah menerima data sidik jari/wajah, hanya bukti
// kriptografi dari perangkat.
//
// Semua fungsi menerima `supabase` dari pemanggil (bukan membuat client
// sendiri) karena createClient() di aplikasi ini membuat instance BARU tiap
// dipanggil; pemanggil sudah menyimpannya sekali lewat useState(() => createClient()).
//
// Antarmuka lokal dipakai alih-alih tipe bawaan supabase-js: API passkey
// masih beta dan bentuk tipenya bisa bergeser antar versi minor. Bentuk data
// mengikuti dokumentasi Supabase (Auth > Passkeys). Butuh supabase-js >= 2.117
// (passkey aktif tanpa opt-in); versi di package-lock sudah memenuhi.
//
// Syarat server: passkey diaktifkan di Supabase Auth dan situs diakses lewat
// HTTPS pada domain yang terdaftar di GOTRUE_WEBAUTHN_RP_ORIGINS.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface PasskeyRow {
  id: string;
  friendly_name: string | null;
  created_at: string;
  last_used_at?: string | null;
}

interface AuthResult<T> {
  data: T | null;
  error: unknown;
}

interface PasskeyAuthApi {
  registerPasskey: () => Promise<AuthResult<{ id: string }>>;
  signInWithPasskey: () => Promise<AuthResult<unknown>>;
  passkey: {
    list: () => Promise<AuthResult<PasskeyRow[]>>;
    update: (args: { passkeyId: string; friendlyName: string }) => Promise<AuthResult<unknown>>;
    delete: (args: { passkeyId: string }) => Promise<AuthResult<unknown>>;
  };
}

function authApi(supabase: SupabaseClient<any, any, any>): PasskeyAuthApi {
  return supabase.auth as unknown as PasskeyAuthApi;
}

/** true kalau browser punya API WebAuthn. Hanya boleh dipanggil di browser. */
export function isPasskeySupported(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined";
}

/** Login dengan passkey. Berhasil → sesi terbentuk. Gagal → lempar error. */
export async function signInWithPasskey(supabase: SupabaseClient<any, any, any>): Promise<void> {
  const { error } = await authApi(supabase).signInWithPasskey();
  if (error) throw error;
}

/** Daftarkan passkey untuk user yang SEDANG login. Mengembalikan id passkey baru. */
export async function registerPasskey(
  supabase: SupabaseClient<any, any, any>,
  friendlyName: string,
): Promise<string> {
  const { data, error } = await authApi(supabase).registerPasskey();
  if (error || !data) throw error ?? new Error("registerPasskey tidak mengembalikan data");
  // Nama bawaan itu kosmetik; kalau gagal disimpan, passkey-nya tetap sah.
  try {
    await authApi(supabase).passkey.update({ passkeyId: data.id, friendlyName });
  } catch {
    // diabaikan
  }
  return data.id;
}

export async function listPasskeys(supabase: SupabaseClient<any, any, any>): Promise<PasskeyRow[]> {
  const { data, error } = await authApi(supabase).passkey.list();
  if (error) throw error;
  return data ?? [];
}

export async function deletePasskey(
  supabase: SupabaseClient<any, any, any>,
  passkeyId: string,
): Promise<void> {
  const { error } = await authApi(supabase).passkey.delete({ passkeyId });
  if (error) throw error;
}
