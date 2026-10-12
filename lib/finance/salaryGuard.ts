// lib/finance/salaryGuard.ts  (SERVER ONLY)
// Akses untuk memposting gaji ke Keuangan. Yang boleh: supervisor, atau pengguna yang memang
// punya akses menu Gaji & Upah (permission `salary`). Mereka sudah bisa menandai gaji "dibayar"
// di menu Gaji, jadi tidak diminta punya izin `keuangan` terpisah. Pengeluaran yang dibuat selalu
// berstatus PENDING sehingga tetap perlu disetujui pemegang izin `keuangan.edit`.

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export interface SalaryActor {
  userId: string;
  name: string;
  isSupervisor: boolean;
  /** boleh membatalkan (void) pengeluaran yang SUDAH disetujui: supervisor atau keuangan.delete */
  canVoidApproved: boolean;
}

type Result = { ok: true; actor: SalaryActor } | { ok: false; response: NextResponse };

export async function requireSalaryAccess(req: NextRequest): Promise<Result> {
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

  const isSupervisor =
    row.role === 'supervisor' || (Array.isArray(row.roles) && row.roles.includes('supervisor'));
  const p = row.permissions?.salary;
  const allowed = isSupervisor || p?.view === true || p?.edit === true || p?.create === true;
  if (!allowed) {
    return { ok: false, response: NextResponse.json({ error: 'Anda tidak memiliki akses ke menu Gaji' }, { status: 403 }) };
  }
  const canVoidApproved = isSupervisor || row.permissions?.keuangan?.delete === true;
  return { ok: true, actor: { userId: auth.userId, name: row.name || 'User', isSupervisor, canVoidApproved } };
}
