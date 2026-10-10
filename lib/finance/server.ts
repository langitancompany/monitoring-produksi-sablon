// lib/finance/server.ts
// Helper khusus API route keuangan (SERVER ONLY).

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveFinanceCaps, type FinAction, type FinCaps } from './caps';

export interface FinActor {
  userId: string;
  name: string;
  caps: FinCaps;
}

type GuardResult = { ok: true; actor: FinActor } | { ok: false; response: NextResponse };

/** Wajib login + punya hak `action` pada menu Keuangan. Dicek ke database, bukan ke klien. */
export async function requireFinance(req: NextRequest, action: FinAction): Promise<GuardResult> {
  const auth = await requireUser(req);
  if (!auth.ok) return auth;

  const { data: row, error } = await getSupabaseAdmin()
    .from('users')
    .select('name, role, roles, permissions')
    .eq('id', auth.userId)
    .maybeSingle();

  if (error || !row) {
    return { ok: false, response: NextResponse.json({ error: 'Pengguna tidak ditemukan' }, { status: 403 }) };
  }

  const caps = resolveFinanceCaps(row, row.permissions?.keuangan);
  if (!caps[action]) {
    return { ok: false, response: NextResponse.json({ error: 'Anda tidak memiliki hak akses untuk aksi ini' }, { status: 403 }) };
  }
  return { ok: true, actor: { userId: auth.userId, name: row.name || 'User', caps } };
}

/** Error "FIN: ..." dari fungsi database diteruskan ke pengguna; error lain disamarkan. */
export function finFail(error: { message?: string } | null | undefined, fallback = 'Terjadi kesalahan pada server') {
  const msg = error?.message ?? '';
  if (msg.startsWith('FIN:')) {
    return NextResponse.json({ error: msg.slice(4).trim() }, { status: 422 });
  }
  console.error('[finance]', error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export const bad = (error: string, status = 400, extra?: Record<string, unknown>) =>
  NextResponse.json({ error, ...extra }, { status });

export const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Rupiah bulat, tidak negatif, batas wajar (Rp 100 miliar). */
export const isMoney = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 100_000_000_000;

export const isDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** Hari ini (WIB) format YYYY-MM-DD. */
export function todayWib(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

export async function loadSettings() {
  const { data } = await getSupabaseAdmin().from('finance_settings').select('key, value');
  const m = new Map<string, unknown>((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
  const b = (k: string, d: boolean) => (typeof m.get(k) === 'boolean' ? (m.get(k) as boolean) : d);
  return {
    require_proof_non_cash: b('require_proof_non_cash', true),
    require_separate_verifier: b('require_separate_verifier', false),
    allow_overpayment: b('allow_overpayment', false),
    auto_verify_own_payment: b('auto_verify_own_payment', false),
  };
}

/** Kenali tipe file dari isinya (magic bytes), bukan dari nama/ekstensi yang bisa dipalsukan. */
export function sniffProof(buf: Uint8Array): { ext: string; mime: string } | null {
  const is = (...b: number[]) => b.every((v, i) => buf[i] === v);
  if (is(0xff, 0xd8, 0xff)) return { ext: 'jpg', mime: 'image/jpeg' };
  if (is(0x89, 0x50, 0x4e, 0x47)) return { ext: 'png', mime: 'image/png' };
  if (is(0x25, 0x50, 0x44, 0x46)) return { ext: 'pdf', mime: 'application/pdf' };
  if (is(0x52, 0x49, 0x46, 0x46) && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

export const PROOF_BUCKET = 'finance-proofs';
export const MAX_PROOF_BYTES = 4 * 1024 * 1024; // di bawah batas body 4,5 MB Vercel