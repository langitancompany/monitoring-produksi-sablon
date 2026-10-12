// GET  /api/finance/expenses?status=&from=&to=&category_id=&vendor_id=&order_id=  -> daftar pengeluaran
// POST /api/finance/expenses (multipart/form-data)                                -> catat pengeluaran (+ bukti)
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  requireFinance, finFail, bad, isUuid, isDate, loadSettings, sniffProof, PROOF_BUCKET, MAX_PROOF_BYTES,
} from '@/lib/finance/server';
import { EXPENSE_SELECT, toExpenseRow } from '@/lib/finance/expenses';

export const dynamic = 'force-dynamic';

const STATUSES = ['pending', 'approved', 'rejected', 'void'];

export async function GET(req: NextRequest) {
  const guard = await requireFinance(req, 'view');
  if (!guard.ok) return guard.response;

  const sp = req.nextUrl.searchParams;
  const status = sp.get('status');
  const from = sp.get('from');
  const to = sp.get('to');
  const categoryId = sp.get('category_id');
  const vendorId = sp.get('vendor_id');
  const orderId = sp.get('order_id');
  if (status && !STATUSES.includes(status)) return bad('Status tidak valid');
  if ((from && !isDate(from)) || (to && !isDate(to))) return bad('Tanggal tidak valid');
  for (const id of [categoryId, vendorId, orderId]) if (id && !isUuid(id)) return bad('Filter tidak valid');

  let q = getSupabaseAdmin().from('finance_expenses').select(EXPENSE_SELECT);
  if (status) q = q.eq('status', status);
  if (from) q = q.gte('spent_at', from);
  if (to) q = q.lte('spent_at', to);
  if (categoryId) q = q.eq('category_id', categoryId);
  if (vendorId) q = q.eq('vendor_id', vendorId);
  if (orderId) q = q.eq('order_id', orderId);

  const { data, error } = await q
    .order('spent_at', { ascending: false })
    .order('recorded_at', { ascending: false })
    .limit(1000);
  if (error) return finFail(error);
  return NextResponse.json({ rows: (data ?? []).map(toExpenseRow) });
}

export async function POST(req: NextRequest) {
  const guard = await requireFinance(req, 'create');
  if (!guard.ok) return guard.response;
  const { actor } = guard;

  const form = await req.formData().catch(() => null);
  if (!form) return bad('Data tidak valid');
  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };

  const categoryId = str('category_id');
  const accountId = str('account_id');
  const vendorId = str('vendor_id');
  const orderId = str('order_id');
  const description = str('description');
  const spentAt = str('spent_at');
  if (!isUuid(categoryId)) return bad('Pilih kategori pengeluaran');
  if (!isUuid(accountId)) return bad('Pilih akun kas/bank');
  if (vendorId && !isUuid(vendorId)) return bad('Vendor tidak valid');
  if (orderId && !isUuid(orderId)) return bad('Order tidak valid');
  if (description.length < 3) return bad('Keterangan wajib diisi (minimal 3 karakter)');
  if (!isDate(spentAt)) return bad('Tanggal tidak valid');
  if (!/^\d{1,12}$/.test(str('amount')) || Number(str('amount')) <= 0) return bad('Nominal tidak valid');

  // Bukti (opsional di sini; wajib-tidaknya diputuskan database sesuai ambang pengaturan)
  let proofPath: string | null = null;
  const file = form.get('proof');
  const admin = getSupabaseAdmin();
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_PROOF_BYTES) return bad('Ukuran bukti maksimal 4 MB');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kindOfFile = sniffProof(bytes);
    if (!kindOfFile) return bad('Format bukti harus JPG, PNG, WEBP, atau PDF');

    proofPath = `expenses/${randomUUID()}.${kindOfFile.ext}`;
    const up = await admin.storage.from(PROOF_BUCKET).upload(proofPath, bytes, {
      contentType: kindOfFile.mime,
      upsert: false,
    });
    if (up.error) return finFail(up.error, 'Gagal mengunggah bukti');
  }

  const settings = await loadSettings();
  // Sama seperti pembayaran: default SEMUA pengeluaran masuk antrean persetujuan. Langsung 'approved'
  // hanya bila pengaturan `auto_approve_own_expense` dinyalakan, pencatatnya berhak menyetujui, dan aturan
  // "pencatat harus beda dengan penyetuju" tidak aktif.
  const autoApprove =
    settings.auto_approve_own_expense && actor.caps.edit && !settings.require_separate_verifier;

  const { data: id, error } = await admin.rpc('fin_record_expense', {
    p_actor: actor.userId,
    p_actor_name: actor.name,
    p_category: categoryId,
    p_account: accountId,
    p_vendor: vendorId || null,
    p_order: orderId || null,
    p_source: 'manual',
    p_source_ref: null,
    p_description: description.slice(0, 200),
    p_amount: Number(str('amount')),
    p_spent_at: spentAt,
    p_proof_path: proofPath,
    p_note: str('note').slice(0, 500) || null,
    p_auto_approve: autoApprove,
  });

  if (error) {
    if (proofPath) await admin.storage.from(PROOF_BUCKET).remove([proofPath]);
    return finFail(error);
  }
  return NextResponse.json({ id, status: autoApprove ? 'approved' : 'pending' });
}
