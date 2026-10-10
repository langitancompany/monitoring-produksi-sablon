// lib/po/supabase.ts
// Semua query Supabase untuk fitur PO dikumpulkan di sini

import { createClient } from '@/lib/supabase/client';
import { POSetting, POProduct, POOrderPayload } from '@/types/po';
import { submitOrderViaApi, updateOrderViaApi } from './order-api';

/**
 * Ambil setting PO aktif
 */
export async function getPOSetting(): Promise<POSetting | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('po_setting')
    .select('*')
    .single();

  if (error) return null;
  return data;
}

export async function getPOSettingBySlug(slug: string): Promise<POSetting | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('po_setting')
    .select('*')
    .eq('url_slug', slug)
    .single();
  if (error) return null;
  return data;
}

/**
 * Ambil semua produk aktif, diurutkan by sort_order
 */
export async function getPOProducts(poSettingId?: string): Promise<POProduct[]> {
  const supabase = createClient();
  let query = supabase.from('po_products').select('*').eq('is_active', true);

  if (poSettingId) {
    query = query.eq('po_setting_id', poSettingId);
  }

  const { data, error } = await query.order('sort_order', { ascending: true });
  if (error) return [];
  return data;
}

/**
 * Login reseller via Supabase RPC
 */
export async function loginReseller(kode: string, pin: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('login_reseller', {
    p_kode: kode,
    p_pin: pin,
  });

  if (error) return { sukses: false, pesan: 'Terjadi kesalahan server.' };
  return data;
}

/**
 * Ambil semua pesanan milik reseller tertentu, diurutkan dari terbaru
 */
export async function getResellerOrders(
  resellerId: string,
  poSettingId?: string,
): Promise<POResellerOrder[]> {
  const supabase = createClient();
  let query = supabase
    .from('po_orders')
    .select('id, po_number, created_at, total_amount, order_items, notes, delivery_method')
    .eq('reseller_id', resellerId);

  if (poSettingId) {
    query = query.eq('po_setting_id', poSettingId);
  }

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return [];
  return data as POResellerOrder[];
}

export interface POResellerOrder {
  id: string; // ✅ TAMBAH field ini
  po_number: string;
  created_at: string;
  total_amount: number;
  order_items: Array<{
    product_name: string;
    warna: string;
    lengan: string;
    ukuran: string;
    qty: number;
    harga_satuan: number;
    subtotal: number;
  }>;
  notes?: string;
  delivery_method?: string;
}

/**
 * Submit pesanan ke database (portal reseller).
 * Harga DIHITUNG ULANG di server (/api/po/orders) berdasarkan data DB —
 * bukan dari browser. Parameter `products` dipertahankan agar pemanggil
 * lama tidak berubah, tapi tidak dipakai lagi.
 */
export async function submitOrder(
  payload: POOrderPayload,
  setting: POSetting,
  _products?: POProduct[]
): Promise<{ success: boolean; po_number?: string; total_amount?: number; error?: string }> {
  return submitOrderViaApi(payload, setting.id);
}

// 1. Fungsi Hapus Order
// ✅ Fix: hapus kondisi if, langsung delete berdasarkan po_number
// Hapus DELETE & UPDATE ke Supabase langsung, ganti ke API route

export async function deleteResellerOrder(poNumber: string, resellerId: string) {
  const res = await fetch(
    `/api/po/orders?po_number=${encodeURIComponent(poNumber)}&reseller_id=${encodeURIComponent(resellerId)}`,
    { method: 'DELETE' }
  );
  const json = await res.json();
  if (!res.ok) return { success: false, error: json.error };
  return { success: true };
}

export async function updateResellerOrder(
  poNumber: string,
  payload: any,
  _setting?: POSetting,
  _products?: POProduct[]
): Promise<{ success: boolean; total_amount?: number; error?: string }> {
  // Total & harga item dihitung ulang di server; yang dikirim hanya varian + qty.
  return updateOrderViaApi({
    po_number: poNumber,
    reseller_id: payload.reseller_id,
    notes: payload.notes,
    order_items: payload.order_items,
  });
}