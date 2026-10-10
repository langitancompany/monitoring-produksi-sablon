// lib/po/admin.ts
// Fungsi Supabase khusus untuk admin PO — semua perlu auth

import { thumbPath } from './images';
import { submitOrderViaApi } from './order-api';
import { createClient } from '@/lib/supabase/client';
import { POSetting, POProduct, POOrder, POResellerFull,POOrderItem } from '@/types/po';

// ─────────────────────────────────────────────
// SETTING
// ─────────────────────────────────────────────

// Ganti fungsi getPOSettingAdmin lama dengan ini
export async function getPOSettingAdmin(poId?: string) {
  const supabase = createClient();
  let query = supabase.from('po_setting').select('*');
  
  // Jika poId dikirim, filter berdasarkan ID tersebut
  if (poId) {
    query = query.eq('id', poId);
  } else {
    // Fallback: jika tidak ada poId, ambil baris pertama seperti sistem lama
    query = query.limit(1);
  }

  const { data, error } = await query.single();
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

export async function updatePOSetting(
  id: string,
  updates: Partial<Omit<POSetting, 'id' | 'updated_at'>>
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from('po_setting')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─────────────────────────────────────────────
// PRODUK
// ─────────────────────────────────────────────

// Ganti fungsi getAllPOProducts lama dengan ini
export async function getAllPOProducts(poId?: string): Promise<POProduct[]> {
  const supabase = createClient();
  let query = supabase.from('po_products').select('*');
  
  // Filter berdasarkan PO tertentu jika parameter tersedia
  if (poId) {
    query = query.eq('po_setting_id', poId);
  }

  const { data } = await query.order('sort_order', { ascending: true });
  return data || [];
}

export async function createPOProduct(
  product: Omit<POProduct, 'id'>
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from('po_products').insert(product);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function updatePOProduct(
  id: string,
  updates: Partial<Omit<POProduct, 'id'>>
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from('po_products')
    .update(updates)
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function deletePOProduct(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
 
  // 1. Ambil dulu image_urls produk ini sebelum row-nya dihapus
  const { data: product } = await supabase
    .from('po_products')
    .select('image_urls')
    .eq('id', id)
    .single();
 
  // 2. Hapus row dari database
  const { error } = await supabase.from('po_products').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
 
  // 3. Baru hapus file-file gambarnya dari storage (setelah row sukses terhapus)
  if (product?.image_urls?.length) {
    await deleteProductImages(product.image_urls);
  }
 
  return { success: true };
}

export async function togglePOProductActive(
  id: string,
  is_active: boolean
): Promise<{ success: boolean; error?: string }> {
  return updatePOProduct(id, { is_active });
}

// ─────────────────────────────────────────────
// RESELLER
// ─────────────────────────────────────────────

export async function getAllResellers(): Promise<POResellerFull[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('po_resellers')
    .select('*')
    .order('created_at', { ascending: false });
  return data || [];
}

export async function getPendingResellers(): Promise<POResellerFull[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('po_resellers')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  return data || [];
}
 
export async function confirmReseller(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from('po_resellers')
    .update({ status: 'confirmed', is_active: true })
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function createReseller(
  reseller: { kode: string; pin_hash: string; nama: string; whatsapp?: string; kota?: string }
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from('po_resellers').insert(reseller);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function updateReseller(
  id: string,
  updates: Partial<Omit<POResellerFull, 'id' | 'created_at'>>
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from('po_resellers')
    .update(updates)
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function toggleResellerActive(
  id: string,
  is_active: boolean
): Promise<{ success: boolean; error?: string }> {
  return updateReseller(id, { is_active });
}

export async function deleteReseller(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from('po_resellers').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─────────────────────────────────────────────
// ORDERS
// ─────────────────────────────────────────────

/**
 * Kirim pesanan baru (dipakai halaman pesanan publik).
 * Harga, total, nomor PO, dan status PO (aktif/periode) divalidasi di server
 * lewat /api/po/orders — nilai harga dari browser tidak dipercaya.
 * Parameter `products` dipertahankan agar pemanggil lama tidak berubah,
 * tapi tidak dipakai lagi.
 */
export async function submitOrder(
  payload: any,
  setting: POSetting,
  _products?: POProduct[]
): Promise<{ success: boolean; po_number?: string; total_amount?: number; error?: string }> {
  return submitOrderViaApi(payload, setting.id);
}

export async function getAllPOOrders(poId?: string): Promise<POOrder[]> {
  const supabase = createClient();
  let query = supabase
    .from('po_orders')
    .select('*, po_resellers(nama, kode)');

  if (poId) {
    query = query.eq('po_setting_id', poId);
  }

  const { data } = await query.order('created_at', { ascending: false });
  return data || [];
}

export async function getPOOrderById(id: string): Promise<POOrder | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from('po_orders')
    .select('*, po_resellers(nama, kode)')
    .eq('id', id)
    .single();
  return data;
}

export async function deletePOOrder(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from('po_orders').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─── Ganti fungsi updatePaymentStatus di lib/po/admin.ts dengan ini ───

export async function updatePaymentStatus(
  id: string,
  payment_status: 'BELUM_BAYAR' | 'DP' | 'LUNAS',
  paid_amount?: number
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('po_orders')
    .update({
      payment_status,
      ...(paid_amount !== undefined ? { paid_amount } : {}),
      payment_updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id'); // ← WAJIB: supaya kita bisa tahu berapa baris yang benar-benar terupdate

  if (error) {
    return { success: false, error: error.message };
  }

  // Jika RLS menolak update, Supabase tidak melempar error,
  // tapi `data` akan jadi array kosong karena 0 baris ter-update.
  if (!data || data.length === 0) {
    return {
      success: false,
      error:
        'Update tidak diterapkan (kemungkinan diblokir oleh RLS policy, atau ID tidak ditemukan).',
    };
  }

  return { success: true };
}

export async function updatePOOrderFull(
  id: string,
  updates: {
    customer_name: string;
    customer_wa: string;
    delivery_method: 'Diambil' | 'Dikirim';
    shipping_address: string | null;
    notes: string | null;
    order_items: import('@/types/po').POOrderItem[];
    total_amount: number;
  }
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('po_orders')
    .update(updates)
    .eq('id', id)
    .select('id'); // wajib, supaya bisa deteksi RLS silent failure
 
  if (error) {
    return { success: false, error: error.message };
  }
 
  if (!data || data.length === 0) {
    return {
      success: false,
      error: 'Update tidak diterapkan (kemungkinan diblokir oleh RLS policy, atau ID tidak ditemukan).',
    };
  }
 
  return { success: true };
}

/**
 * Tandai status stok satu item pesanan saat pengemasan (tab Pengemasan).
 * shortageQty = 0 artinya stok lengkap/reset, >0 artinya kurang sekian pcs
 * dari qty yang dipesan pada item tersebut.
 *
 * order_items disimpan sebagai satu kolom JSONB di po_orders (bukan tabel
 * terpisah), jadi alurnya: ambil array order_items terkini, ubah 1 index,
 * lalu update kembali seluruh kolomnya — sama seperti pola updatePOOrderFull.
 */
export async function updateItemShortage(
  orderId: string,
  itemIndex: number,
  shortageQty: number
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const { data: order, error: fetchError } = await supabase
    .from('po_orders')
    .select('order_items')
    .eq('id', orderId)
    .single();

  if (fetchError || !order) {
    return { success: false, error: fetchError?.message || 'Pesanan tidak ditemukan.' };
  }

  const items: POOrderItem[] = [...(order.order_items || [])];
  if (!items[itemIndex]) {
    return { success: false, error: 'Item pesanan tidak ditemukan.' };
  }

  items[itemIndex] = { ...items[itemIndex], shortage_qty: shortageQty };

  const { data, error } = await supabase
    .from('po_orders')
    .update({ order_items: items })
    .eq('id', orderId)
    .select('id'); // wajib, supaya bisa deteksi RLS silent failure

  if (error) {
    return { success: false, error: error.message };
  }

  if (!data || data.length === 0) {
    return {
      success: false,
      error: 'Update tidak diterapkan (kemungkinan diblokir oleh RLS policy, atau ID tidak ditemukan).',
    };
  }

  return { success: true };
}

// ─────────────────────────────────────────────
// STATISTIK
// ─────────────────────────────────────────────

export async function getPOStats(poId?: string): Promise<{
  totalOrders: number;
  totalPublic: number;
  totalReseller: number;
  totalAmount: number;
  totalProducts: number;
}> {
  const supabase = createClient();

  let ordersQuery = supabase
    .from('po_orders')
    .select('customer_type, total_amount, order_items');
  if (poId) {
    ordersQuery = ordersQuery.eq('po_setting_id', poId);
  }
  const { data } = await ordersQuery;

  if (!data) return { 
    totalOrders: 0, 
    totalPublic: 0, 
    totalReseller: 0, 
    totalAmount: 0,
    totalProducts: 0 
  };

  let productsQuery = supabase
    .from('po_products')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);
  if (poId) {
    productsQuery = productsQuery.eq('po_setting_id', poId);
  }
  const { count: totalProducts } = await productsQuery;

  // Jumlahkan qty semua item dalam satu pesanan
  const sumQty = (items: POOrderItem[] | null | undefined) =>
    (items || []).reduce((s, item) => s + (item.qty || 0), 0);

  return {
    // ← sekarang total PCS terinput, bukan jumlah baris pesanan
    totalOrders: data.reduce((sum, o) => sum + sumQty(o.order_items), 0),
    totalPublic: data
      .filter((o) => o.customer_type === 'PUBLIC')
      .reduce((sum, o) => sum + sumQty(o.order_items), 0),
    totalReseller: data
      .filter((o) => o.customer_type === 'RESELLER')
      .reduce((sum, o) => sum + sumQty(o.order_items), 0),
    totalAmount: data.reduce((sum, o) => sum + (o.total_amount || 0), 0),
    totalProducts: totalProducts || 0,
  };
}

// ─── Tambahkan ke lib/po/admin.ts ───
// (pastikan import createClient sudah ada di paling atas file, biasanya sudah ada)
 
/**
 * Ekstrak path relatif di dalam bucket dari public URL Supabase Storage.
 * Contoh input:
 *   https://xxxx.supabase.co/storage/v1/object/public/po_assets/products/123-abc.jpg
 * Contoh output:
 *   products/123-abc.jpg
 *
 * Mengembalikan null jika format URL tidak dikenali (misal sudah berupa path biasa,
 * atau bukan URL Supabase Storage sama sekali) — supaya pemanggil bisa skip dengan aman.
 */
function extractStoragePath(url: string, bucket: string = 'po_assets'): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}
 
/**
 * Hapus satu atau lebih file gambar produk dari bucket 'po_assets'
 * berdasarkan public URL-nya. Aman dipanggil dengan array kosong.
 * Tidak melempar error ke pemanggil — kegagalan hapus file di storage
 * tidak boleh menggagalkan operasi utama (hapus produk / update produk).
 */
export async function deleteProductImages(imageUrls: string[]): Promise<void> {
  if (!imageUrls || imageUrls.length === 0) return;
 
  const supabase = createClient();
  const paths = imageUrls
    .map((url) => extractStoragePath(url))
    .filter((p): p is string => Boolean(p));
 
  if (paths.length === 0) return;
 
  // Foto yang sudah dioptimasi punya thumbnail terpisah → ikut dihapus
  const thumbPaths = paths
    .map((p) => thumbPath(p))
    .filter((p): p is string => Boolean(p));
  const allPaths = [...paths, ...thumbPaths];
 
  const { error } = await supabase.storage.from('po_assets').remove(allPaths);
  if (error) {
    // Sengaja hanya log, tidak throw — supaya hapus produk tetap berhasil
    // walau file di storage gagal terhapus (misal sudah terhapus manual sebelumnya).
    console.error('Gagal menghapus file gambar dari storage:', error.message);
  }
}

// ─────────────────────────────────────────────
// LIST & CREATE PO (untuk multi-PO management)
// ─────────────────────────────────────────────

export async function getAllPOSettings(): Promise<POSetting[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('po_setting')
    .select('*')
    .order('updated_at', { ascending: false });
  return data || [];
}

export async function createPOSetting(
  input: { title: string; url_slug: string }
): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('po_setting')
    .insert({
      title: input.title,
      url_slug: input.url_slug,
      is_active: false,
    })
    .select('id')
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

/**
 * Hapus SATU PO secara total: semua produk, semua order, setting-nya
 * sendiri, DAN semua file gambar terkait (foto produk, logo toko, QRIS)
 * dari storage — supaya benar-benar bersih, tidak menimbun di database.
 *
 * SENGAJA TIDAK menghapus `po_resellers` — data reseller bersifat
 * global/lintas-PO (dipakai berulang di PO lain), jadi hanya ORDER-nya
 * yang ikut terhapus, reseller-nya sendiri tetap ada.
 *
 * Urutan hapus (anak dulu baru induk) untuk menghindari konflik FK:
 * 1) baca image_urls produk + logo/qris setting (butuh sebelum row hilang)
 * 2) hapus po_orders
 * 3) hapus po_products
 * 4) hapus po_setting
 * 5) baru bersihkan file-file di storage (pola sama seperti deletePOProduct)
 */
export async function deletePOSetting(
  poId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  try {
    // 1. Ambil data yang dibutuhkan untuk pembersihan storage SEBELUM
    // baris-barisnya dihapus dari database.
    const { data: setting } = await supabase
      .from('po_setting')
      .select('logo_image_url, qris_image_url')
      .eq('id', poId)
      .single();

    const { data: products } = await supabase
      .from('po_products')
      .select('image_urls')
      .eq('po_setting_id', poId);

    const allImageUrls: string[] = [
      ...(products || []).flatMap((p) => p.image_urls || []),
      ...(setting?.logo_image_url ? [setting.logo_image_url] : []),
      ...(setting?.qris_image_url ? [setting.qris_image_url] : []),
    ];

    // 2. Hapus semua order milik PO ini (reseller-nya TIDAK ikut dihapus).
    const { error: orderErr } = await supabase
      .from('po_orders')
      .delete()
      .eq('po_setting_id', poId);
    if (orderErr) return { success: false, error: orderErr.message };

    // 3. Hapus semua produk milik PO ini.
    const { error: productErr } = await supabase
      .from('po_products')
      .delete()
      .eq('po_setting_id', poId);
    if (productErr) return { success: false, error: productErr.message };

    // 4. Hapus setting PO itu sendiri.
    const { error: settingErr } = await supabase
      .from('po_setting')
      .delete()
      .eq('id', poId);
    if (settingErr) return { success: false, error: settingErr.message };

    // 5. Baru bersihkan file-file di storage. Sengaja paling akhir &
    // tidak boleh menggagalkan proses di atas kalau ada file yang gagal
    // terhapus (mis. sudah hilang manual sebelumnya) — sama seperti pola
    // di deletePOProduct/deleteProductImages.
    if (allImageUrls.length > 0) {
      await deleteProductImages(allImageUrls);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Gagal menghapus PO' };
  }
}