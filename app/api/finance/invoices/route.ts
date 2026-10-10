// GET  /api/finance/invoices  -> posisi keuangan semua order (tagihan, terbayar, sisa, status)
// POST /api/finance/invoices  -> terbitkan / revisi tagihan (total DIHITUNG ULANG di server)
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFinance, finFail, bad, isUuid, isMoney, isDate } from '@/lib/finance/server';
import { computeInvoice } from '@/lib/finance/pricing';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireFinance(req, 'view');
  if (!guard.ok) return guard.response;

  const { data, error } = await getSupabaseAdmin()
    .from('v_order_finance')
    .select('*')
    .order('tanggal_masuk', { ascending: false, nullsFirst: false })
    .limit(2000);
  if (error) return finFail(error);
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: NextRequest) {
  const guard = await requireFinance(req, 'create');
  if (!guard.ok) return guard.response;
  const { actor } = guard;

  const body = await req.json().catch(() => null);
  if (!body || !isUuid(body.order_id)) return bad('Order tidak valid');

  const hargaDasar = body.harga_dasar;
  const biayaUkuran = body.biaya_ukuran_besar ?? 0;
  const biayaLengan = body.biaya_lengan_panjang ?? 0;
  const discount = body.discount ?? 0;
  if (!isMoney(hargaDasar) || hargaDasar <= 0) return bad('Harga dasar harus lebih dari 0');
  if (!isMoney(biayaUkuran) || !isMoney(biayaLengan) || !isMoney(discount)) return bad('Nominal tidak valid');
  if (body.due_date != null && !isDate(body.due_date)) return bad('Tanggal jatuh tempo tidak valid');
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';

  const admin = getSupabaseAdmin();
  const { data: order, error: oErr } = await admin
    .from('orders')
    .select('id, jumlah, detail_ukuran, deleted_at')
    .eq('id', body.order_id)
    .maybeSingle();
  if (oErr) return finFail(oErr);
  if (!order || order.deleted_at) return bad('Order tidak ditemukan', 404);

  // Sumber kebenaran total: dihitung di sini dari data order, bukan dari angka kiriman browser.
  const calc = computeInvoice({
    detailUkuran: order.detail_ukuran,
    jumlah: order.jumlah ?? 0,
    hargaDasar,
    biayaUkuranBesar: biayaUkuran,
    biayaLenganPanjang: biayaLengan,
    discount,
  });

  if (!calc.isLegacy && calc.totalPcs !== order.jumlah && body.acknowledge_mismatch !== true) {
    return bad(
      `Jumlah pcs pada rincian ukuran (${calc.totalPcs}) berbeda dengan qty order (${order.jumlah}). Periksa kembali, atau konfirmasi untuk melanjutkan.`,
      409,
      { code: 'PCS_MISMATCH', total_pcs: calc.totalPcs, jumlah: order.jumlah },
    );
  }
  if (calc.subtotal <= 0) return bad('Total tagihan harus lebih dari 0');
  if (discount > calc.subtotal) return bad('Diskon tidak boleh melebihi subtotal');

  const { data: id, error } = await admin.rpc('fin_issue_invoice', {
    p_order: order.id,
    p_actor: actor.userId,
    p_actor_name: actor.name,
    p_harga_dasar: hargaDasar,
    p_biaya_ukuran_besar: biayaUkuran,
    p_biaya_lengan_panjang: biayaLengan,
    p_total_pcs: calc.totalPcs,
    p_subtotal: calc.subtotal,
    p_discount: discount,
    p_snapshot: calc.entries,
    p_reason: reason || null,
    p_due_date: body.due_date ?? null,
  });
  if (error) return finFail(error);
  return NextResponse.json({ id, total: calc.total });
}