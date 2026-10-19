// GET /api/finance/invoice-settings -> pengaturan tampilan invoice (header, rekening, TTD)
// PUT /api/finance/invoice-settings -> simpan (HANYA Super Admin: rekening pembayaran rawan disalahgunakan)
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFinance, finFail, bad } from '@/lib/finance/server';
import {
  INVOICE_SETTINGS_KEY,
  readInvoiceSettings,
  sanitizeInvoiceSettings,
} from '@/lib/finance/invoiceSettings';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireFinance(req, 'view');
  if (!guard.ok) return guard.response;

  const { data, error } = await getSupabaseAdmin()
    .from('finance_settings')
    .select('value')
    .eq('key', INVOICE_SETTINGS_KEY)
    .maybeSingle();
  if (error) return finFail(error);

  return NextResponse.json({ settings: readInvoiceSettings(data?.value) });
}

export async function PUT(req: NextRequest) {
  const guard = await requireFinance(req, 'view');
  if (!guard.ok) return guard.response;
  if (!guard.actor.caps.isSuperAdmin) {
    return bad('Hanya Super Admin yang boleh mengubah pengaturan invoice', 403);
  }

  const body = await req.json().catch(() => null);
  const res = sanitizeInvoiceSettings(body?.settings);
  if (!res.ok) return bad(res.error, 422);

  const value = {
    ...res.value,
    updated_by: guard.actor.name,
    updated_at: new Date().toISOString(),
  };

  const { error } = await getSupabaseAdmin()
    .from('finance_settings')
    .upsert({ key: INVOICE_SETTINGS_KEY, value }, { onConflict: 'key' });
  if (error) return finFail(error);

  return NextResponse.json({ settings: readInvoiceSettings(value) });
}