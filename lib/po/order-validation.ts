// lib/po/order-validation.ts
//
// Validasi + perhitungan harga pesanan PO yang dijalankan DI SERVER
// (dipanggil dari app/api/po/orders/route.ts). Fungsi di sini murni —
// tidak mengakses database — supaya mudah diuji.
//
// Prinsip: apa pun yang dikirim browser (harga, subtotal, total, nama
// produk) TIDAK dipercaya. Server hanya mengambil dari browser: id produk,
// varian (warna/lengan/ukuran), dan qty. Sisanya dihitung ulang dari data
// produk & pengaturan PO di database.

import { calculateItemPrice } from './pricing';
import type { POProduct, POSetting } from '@/types/po';

export const MAX_ITEMS_PER_ORDER = 200;
export const MAX_QTY_PER_ITEM = 1000;

export interface PricedOrderItem {
  product_id: string;
  product_name: string;
  warna: string;
  lengan: string;
  ukuran: string;
  qty: number;
  harga_satuan: number;
  subtotal: number;
}

export type PriceResult =
  | { ok: true; items: PricedOrderItem[]; total: number }
  | { ok: false; error: string };

// ─────────────────────────────────────────────
// Status PO (aktif + periode)
// ─────────────────────────────────────────────

/** Tanggal hari ini (YYYY-MM-DD) dalam zona waktu WIB. */
export function todayWIB(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function formatTanggal(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Cek apakah PO sedang menerima pesanan.
 * @returns pesan error kalau ditutup, atau null kalau boleh memesan.
 */
export function checkPoOpen(
  setting: Pick<POSetting, 'is_active' | 'periode_mulai' | 'periode_selesai'>,
  now: Date = new Date(),
): string | null {
  if (!setting.is_active) {
    return 'Pre-order sedang ditutup. Pesanan tidak dapat diproses.';
  }
  const today = todayWIB(now);
  const mulai = setting.periode_mulai?.slice(0, 10);
  const selesai = setting.periode_selesai?.slice(0, 10);

  if (mulai && today < mulai) {
    return `Pre-order belum dibuka. Periode dimulai ${formatTanggal(mulai)}.`;
  }
  if (selesai && today > selesai) {
    return `Periode pre-order sudah berakhir pada ${formatTanggal(selesai)}.`;
  }
  return null;
}

// ─────────────────────────────────────────────
// Item pesanan
// ─────────────────────────────────────────────

/**
 * Cocokkan nilai dari browser dengan daftar opsi produk (abaikan huruf
 * besar/kecil & spasi). Mengembalikan nilai "resmi" dari database.
 * Kalau produk memang tidak punya opsi (daftar kosong), katalog mengirim
 * "-", jadi nilai pendek apa pun diterima.
 */
function matchOption(
  list: string[] | null | undefined,
  value: unknown,
): string | null {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!list || list.length === 0) {
    return v && v.length <= 30 ? v : '-';
  }
  const found = list.find(
    (opt) => String(opt).trim().toLowerCase() === v.toLowerCase(),
  );
  return found !== undefined ? String(found) : null;
}

/**
 * Validasi item pesanan dari browser dan hitung ulang harganya
 * berdasarkan produk & pengaturan harga di database.
 */
export function priceOrderItems(
  rawItems: unknown,
  setting: Pick<
    POSetting,
    'sleeve_surcharge' | 'xxl_surcharge' | 'sweater_xxl_surcharge'
  >,
  products: POProduct[],
): PriceResult {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, error: 'Keranjang kosong.' };
  }
  if (rawItems.length > MAX_ITEMS_PER_ORDER) {
    return {
      ok: false,
      error: `Terlalu banyak item dalam satu pesanan (maksimal ${MAX_ITEMS_PER_ORDER}).`,
    };
  }

  const pricing = {
    sleeveSurcharge: Number(setting.sleeve_surcharge) || 0,
    xxlSurcharge: Number(setting.xxl_surcharge) || 0,
    sweaterXxlSurcharge: Number(setting.sweater_xxl_surcharge) || 0,
  };
  const productMap = new Map(products.map((p) => [p.id, p]));

  const items: PricedOrderItem[] = [];
  let total = 0;

  for (let i = 0; i < rawItems.length; i++) {
    const raw = rawItems[i] as Record<string, unknown> | null;
    const nomor = i + 1;

    if (!raw || typeof raw !== 'object') {
      return { ok: false, error: `Item #${nomor} tidak valid.` };
    }

    const product =
      typeof raw.product_id === 'string'
        ? productMap.get(raw.product_id)
        : undefined;
    if (!product) {
      return {
        ok: false,
        error: `Item #${nomor}: produk tidak ditemukan atau sudah tidak tersedia. Hapus dari keranjang lalu pilih ulang.`,
      };
    }

    const qty = raw.qty;
    if (
      typeof qty !== 'number' ||
      !Number.isInteger(qty) ||
      qty < 1 ||
      qty > MAX_QTY_PER_ITEM
    ) {
      return {
        ok: false,
        error: `Item #${nomor} (${product.name}): jumlah harus bilangan bulat 1–${MAX_QTY_PER_ITEM}.`,
      };
    }

    const warna = matchOption(product.colors, raw.warna);
    const lengan = matchOption(product.sleeve_types, raw.lengan);
    const ukuran = matchOption(product.available_sizes, raw.ukuran);
    if (warna === null || lengan === null || ukuran === null) {
      const bagian =
        warna === null ? 'warna' : lengan === null ? 'lengan' : 'ukuran';
      return {
        ok: false,
        error: `Item #${nomor} (${product.name}): ${bagian} yang dipilih tidak tersedia. Hapus dari keranjang lalu pilih ulang.`,
      };
    }

    const hargaSatuan = calculateItemPrice(
      Number(product.base_price) || 0,
      ukuran,
      lengan,
      product,
      pricing,
    );
    const subtotal = hargaSatuan * qty;
    total += subtotal;

    items.push({
      product_id: product.id,
      product_name: product.name,
      warna,
      lengan,
      ukuran,
      qty,
      harga_satuan: hargaSatuan,
      subtotal,
    });
  }

  return { ok: true, items, total };
}

// ─────────────────────────────────────────────
// Data pelanggan
// ─────────────────────────────────────────────

export interface ValidCustomer {
  customer_type: 'PUBLIC' | 'RESELLER';
  reseller_id: string | null;
  customer_name: string;
  customer_wa: string;
  delivery_method: 'Diambil' | 'Dikirim';
  shipping_address: string | null;
  notes: string | null;
}

export type CustomerResult =
  | { ok: true; value: ValidCustomer }
  | { ok: false; error: string };

const str = (v: unknown, max: number) =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

export function validateCustomer(payload: unknown): CustomerResult {
  const p = (payload ?? {}) as Record<string, unknown>;

  const customer_type = p.customer_type;
  if (customer_type !== 'PUBLIC' && customer_type !== 'RESELLER') {
    return { ok: false, error: 'Tipe pelanggan tidak valid.' };
  }

  const delivery_method = p.delivery_method;
  if (delivery_method !== 'Diambil' && delivery_method !== 'Dikirim') {
    return { ok: false, error: 'Metode pengambilan tidak valid.' };
  }

  const customer_name = str(p.customer_name, 100);
  const customer_wa = str(p.customer_wa, 20);
  const shipping_address = str(p.shipping_address, 500);
  const notes = str(p.notes, 1000);

  if (customer_type === 'RESELLER') {
    const reseller_id = str(p.reseller_id, 64);
    if (!reseller_id) {
      return { ok: false, error: 'Data reseller tidak lengkap.' };
    }
    return {
      ok: true,
      value: {
        customer_type,
        reseller_id,
        customer_name, // akan ditimpa dengan nama dari database
        customer_wa,
        delivery_method,
        shipping_address: shipping_address || null,
        notes: notes || null,
      },
    };
  }

  // PUBLIC
  if (customer_name.length < 2) {
    return { ok: false, error: 'Nama pemesan wajib diisi.' };
  }
  const waDigits = customer_wa.replace(/\D/g, '');
  if (waDigits.length < 8 || waDigits.length > 16) {
    return { ok: false, error: 'Nomor WhatsApp tidak valid.' };
  }
  if (delivery_method === 'Dikirim' && shipping_address.length < 5) {
    return { ok: false, error: 'Alamat pengiriman wajib diisi.' };
  }

  return {
    ok: true,
    value: {
      customer_type,
      reseller_id: null,
      customer_name,
      customer_wa,
      delivery_method,
      shipping_address: shipping_address || null,
      notes: notes || null,
    },
  };
}

// ─────────────────────────────────────────────
// Nomor PO (cadangan jika RPC database gagal)
// ─────────────────────────────────────────────

/** Format PO-YYMMDD-NNNN, tanggal dalam WIB. Angka acak dari crypto. */
export function buildFallbackPoNumber(
  randomFour: number,
  now: Date = new Date(),
): string {
  const yymmdd = todayWIB(now).slice(2).replace(/-/g, '');
  return `PO-${yymmdd}-${randomFour}`;
}