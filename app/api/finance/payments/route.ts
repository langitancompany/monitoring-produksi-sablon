// GET  /api/finance/payments?status=&from=&to=&order_id=  -> daftar transaksi
// POST /api/finance/payments (multipart/form-data)         -> catat pembayaran (+ bukti)
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  requireFinance, finFail, bad, isUuid, isDate, loadSettings, sniffProof, PROOF_BUCKET, MAX_PROOF_BYTES,
} from '@/lib/finance/server';
import { PAYMENT_SELECT, toPaymentRow } from '@/lib/finance/payments';

export const dynamic = 'force-dynamic';

const STATUSES = ['pending', 'verified', 'rejected', 'void'];
const METHODS = ['transfer', 'tunai', 'qris', 'lainnya'];

export async function GET(req: NextRequest) {
  const guard = await requireFinance(req, 'view');
  if (!guard.ok) return guard.response;

  const sp = req.nextUrl.searchParams;
  const status = sp.get('status');
  const from = sp.get('from');
  const to = sp.get('to');
  const orderId = sp.get('order_id');
  if (status && !STATUSES.includes(status)) return bad('Status tidak valid');
  if ((from && !isDate(from)) || (to && !isDate(to))) return bad('Tanggal tidak valid');
  if (orderId && !isUuid(orderId)) return bad('Order tidak valid');

  let q = getSupabaseAdmin().from('order_payments').select(PAYMENT_SELECT);
  if (status) q = q.eq('status', status);
  if (from) q = q.gte('paid_at', from);
  if (to) q = q.lte('paid_at', to);
  if (orderId) q = q.eq('order_id', orderId);

  const { data, error } = await q
    .order('paid_at', { ascending: false })
    .order('recorded_at', { ascending: false })
    .limit(1000);
  if (error) return finFail(error);
  return NextResponse.json({ rows: (data ?? []).map(toPaymentRow) });
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

  const orderId = str('order_id');
  const accountId = str('account_id');
  const method = str('method');
  const paidAt = str('paid_at');
  const kind = str('kind') || null;
  if (!isUuid(orderId)) return bad('Order tidak valid');
  if (!isUuid(accountId)) return bad('Pilih akun kas/bank');
  if (!METHODS.includes(method)) return bad('Metode pembayaran tidak valid');
  if (!isDate(paidAt)) return bad('Tanggal pembayaran tidak valid');
  if (!/^\d{1,12}$/.test(str('amount')) || Number(str('amount')) <= 0) return bad('Nominal tidak valid');
  if (kind !== null && kind !== 'refund') return bad('Jenis pembayaran tidak valid');
  // Refund = uang keluar ke pelanggan -> hanya yang berhak memverifikasi.
  if (kind === 'refund' && !actor.caps.edit) return bad('Refund hanya dapat dicatat oleh yang berhak memverifikasi', 403);

  // Bukti (opsional di sini; wajib-tidaknya diputuskan database sesuai pengaturan)
  let proofPath: string | null = null;
  const file = form.get('proof');
  const admin = getSupabaseAdmin();
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_PROOF_BYTES) return bad('Ukuran bukti maksimal 4 MB');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kindOfFile = sniffProof(bytes);
    if (!kindOfFile) return bad('Format bukti harus JPG, PNG, WEBP, atau PDF');

    proofPath = `${orderId}/${randomUUID()}.${kindOfFile.ext}`;
    const up = await admin.storage.from(PROOF_BUCKET).upload(proofPath, bytes, {
      contentType: kindOfFile.mime,
      upsert: false,
    });
    if (up.error) return finFail(up.error, 'Gagal mengunggah bukti');
  }

  const settings = await loadSettings();
  // Default: SEMUA pembayaran masuk antrean verifikasi (status 'pending'), termasuk yang dicatat
  // oleh supervisor / user yang punya hak verifikasi. Langsung 'verified' hanya bila pengaturan
  // `auto_verify_own_payment` sengaja dinyalakan, pencatatnya berhak verifikasi, dan aturan
  // "pencatat harus beda dengan pemverifikasi" tidak aktif.
  const autoVerify =
    settings.auto_verify_own_payment && actor.caps.edit && !settings.require_separate_verifier;

  const { data: id, error } = await admin.rpc('fin_record_payment', {
    p_order: orderId,
    p_actor: actor.userId,
    p_actor_name: actor.name,
    p_amount: Number(str('amount')),
    p_kind: kind,
    p_method: method,
    p_account: accountId,
    p_paid_at: paidAt,
    p_reference: str('reference_no').slice(0, 100) || null,
    p_payer: str('payer_name').slice(0, 100) || null,
    p_proof_path: proofPath,
    p_note: str('note').slice(0, 500) || null,
    p_auto_verify: autoVerify,
  });

  if (error) {
    // Jangan tinggalkan file yatim bila pencatatan ditolak.
    if (proofPath) await admin.storage.from(PROOF_BUCKET).remove([proofPath]);
    return finFail(error);
  }
  return NextResponse.json({ id, status: autoVerify ? 'verified' : 'pending' });
}