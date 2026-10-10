import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  buildFallbackPoNumber,
  checkPoOpen,
  priceOrderItems,
  validateCustomer,
} from '@/lib/po/order-validation';
import type { POProduct, POSetting } from '@/types/po';

const fail = (error: string, status: number) =>
  NextResponse.json({ success: false, error }, { status });

type Admin = ReturnType<typeof getSupabaseAdmin>;

/** Ambil pengaturan PO + produk aktifnya langsung dari database. */
async function loadPoContext(admin: Admin, poSettingId: string) {
  const { data: setting } = await admin
    .from('po_setting')
    .select('*')
    .eq('id', poSettingId)
    .maybeSingle();
  if (!setting) return { error: fail('PO tidak ditemukan.', 404) } as const;

  const closed = checkPoOpen(setting as POSetting);
  if (closed) return { error: fail(closed, 403) } as const;

  const { data: products, error } = await admin
    .from('po_products')
    .select('*')
    .eq('po_setting_id', poSettingId)
    .eq('is_active', true);
  if (error) return { error: fail('Gagal memuat data produk.', 500) } as const;

  return {
    setting: setting as POSetting,
    products: (products ?? []) as POProduct[],
  } as const;
}

/**
 * Nomor PO dibuat di server: utamanya lewat RPC `generate_po_number`
 * (sama seperti sebelumnya). Kalau RPC gagal / kosong, pakai format cadangan.
 * Nomor yang sudah dipakai tidak akan dikembalikan (dicek ke database).
 */
async function nextPoNumber(
  admin: Admin,
  type: 'PUBLIC' | 'RESELLER',
  attempt: number,
): Promise<string> {
  if (attempt === 0) {
    try {
      const { data, error } = await admin.rpc('generate_po_number', {
        p_type: type,
      });
      if (!error && typeof data === 'string' && data.trim()) return data.trim();
    } catch {
      /* lanjut ke cadangan */
    }
  }
  return buildFallbackPoNumber(randomInt(1000, 10000));
}

// POST /api/po/orders — buat pesanan baru (publik & reseller)
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail('Permintaan tidak valid.', 400);
  }

  const poSettingId =
    typeof body?.po_setting_id === 'string' ? body.po_setting_id : '';
  const payload = body?.payload;
  if (!poSettingId || !payload) return fail('Parameter kurang.', 400);

  const admin = getSupabaseAdmin(); // service role — bypass RLS

  const ctx = await loadPoContext(admin, poSettingId);
  if ('error' in ctx) return ctx.error;

  const customer = validateCustomer(payload);
  if (!customer.ok) return fail(customer.error, 400);
  const c = customer.value;

  // Reseller: pastikan terdaftar & aktif, nama diambil dari database.
  if (c.customer_type === 'RESELLER') {
    const { data: reseller } = await admin
      .from('po_resellers')
      .select('id, nama, is_active')
      .eq('id', c.reseller_id)
      .maybeSingle();
    if (!reseller || reseller.is_active === false) {
      return fail('Akun reseller tidak ditemukan atau tidak aktif.', 403);
    }
    c.customer_name = reseller.nama;
  }

  // Harga dihitung ulang dari data database — harga dari browser diabaikan.
  const priced = priceOrderItems(
    payload.order_items,
    ctx.setting,
    ctx.products,
  );
  if (!priced.ok) return fail(priced.error, 400);

  // Insert dengan nomor PO dari server; ulangi bila bentrok.
  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const po_number = await nextPoNumber(admin, c.customer_type, attempt);

    const { data: dupe } = await admin
      .from('po_orders')
      .select('id')
      .eq('po_number', po_number)
      .limit(1);
    if (dupe && dupe.length > 0) continue;

    const { error } = await admin.from('po_orders').insert({
      po_number,
      customer_type: c.customer_type,
      reseller_id: c.reseller_id,
      customer_name: c.customer_name,
      customer_wa: c.customer_wa,
      delivery_method: c.delivery_method,
      shipping_address: c.shipping_address,
      order_items: priced.items,
      notes: c.notes,
      total_amount: priced.total,
      po_setting_id: ctx.setting.id,
    });

    if (!error) {
      return NextResponse.json({
        success: true,
        po_number,
        total_amount: priced.total,
      });
    }
    // 23505 = unique violation (nomor PO bentrok) → coba nomor lain.
    if (error.code !== '23505') {
      console.error('[po/orders POST] insert gagal:', error.message);
      return fail('Gagal menyimpan pesanan. Silakan coba lagi.', 500);
    }
  }

  return fail('Gagal membuat nomor PO unik. Silakan coba lagi.', 500);
}

// DELETE /api/po/orders?po_number=POR-xxx&reseller_id=xxx
export async function DELETE(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin(); // lazy — service role, bypass RLS
  const { searchParams } = new URL(req.url);
  const po_number = searchParams.get('po_number');
  const reseller_id = searchParams.get('reseller_id');

  if (!po_number || !reseller_id) {
    return NextResponse.json({ error: 'Parameter kurang' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('po_orders')
    .delete()
    .eq('po_number', po_number)
    .eq('reseller_id', reseller_id)
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'Data tidak ditemukan' }, { status: 404 });

  return NextResponse.json({ success: true });
}

// PATCH /api/po/orders — reseller mengedit pesanannya.
// Harga & total dihitung ulang di server; `total_amount` dari browser diabaikan.
export async function PATCH(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail('Permintaan tidak valid.', 400);
  }
  const { po_number, reseller_id, notes, order_items } = body ?? {};

  if (!po_number || !reseller_id) {
    return fail('Parameter kurang', 400);
  }

  const admin = getSupabaseAdmin(); // lazy — service role, bypass RLS

  const { data: existing } = await admin
    .from('po_orders')
    .select('id, po_setting_id')
    .eq('po_number', po_number)
    .eq('reseller_id', reseller_id)
    .maybeSingle();
  if (!existing) return fail('Data tidak ditemukan', 404);
  if (!existing.po_setting_id) {
    return fail('Pesanan ini tidak terhubung ke PO manapun.', 400);
  }

  // Edit juga ditolak kalau PO sudah ditutup / di luar periode.
  const ctx = await loadPoContext(admin, existing.po_setting_id);
  if ('error' in ctx) return ctx.error;

  const priced = priceOrderItems(order_items, ctx.setting, ctx.products);
  if (!priced.ok) return fail(priced.error, 400);

  const cleanNotes =
    typeof notes === 'string' ? notes.trim().slice(0, 1000) || null : null;

  const { data, error } = await admin
    .from('po_orders')
    .update({
      notes: cleanNotes,
      order_items: priced.items,
      total_amount: priced.total,
    })
    .eq('id', existing.id)
    .select('id');

  if (error) return fail(error.message, 500);
  if (!data?.length) return fail('Data tidak ditemukan', 404);

  return NextResponse.json({ success: true, total_amount: priced.total });
}