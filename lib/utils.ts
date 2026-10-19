// lib/utils.ts

import { OrderStatus, ProductionStep, UserData, ProductionTypeData, DEFAULT_PERMISSIONS, MERCHANDISE_PRODUCTS } from "@/types";

// --- CONSTANTS ---
export const INITIAL_STEPS_MANUAL: ProductionStep[] = [
  { id: 'm1', name: 'Pecah Gambar (PDF)', type: 'upload_pdf', isCompleted: false },
  { id: 'm2', name: 'Print Film', type: 'upload_image', isCompleted: false },
  { id: 'm3', name: 'Proofing', type: 'upload_image', isCompleted: false },
  { id: 'm4', name: 'Produksi Massal', type: 'upload_image', isCompleted: false },
];

export const INITIAL_STEPS_DTF: ProductionStep[] = [
  { id: 'd1', name: 'Cetak DTF', type: 'status_update', isCompleted: false },
  { id: 'd2', name: 'Press Kaos', type: 'upload_image', isCompleted: false },
];

// ── TAMBAHAN ── Pesanan MERCHANDISE (lanyard, totebag, gantungan kunci, dst.):
// disimpan di tabel `orders` yang sama dengan jenis_produksi = 'merchandise'.
// Alurnya: Approval → Produksi (langkah di bawah) → QC → Pengiriman (tanpa packing).
// Daftar produknya ada di MERCHANDISE_PRODUCTS (types/index.ts).
export const MERCHANDISE_JENIS = 'merchandise';

const DEFAULT_MERCHANDISE_STEPS: ProductionStep[] = [
  { id: 'l1', name: 'Cetak Kertas Sublim', type: 'status_update', actionLabel: 'Sudah Cetak', isCompleted: false },
  { id: 'l2', name: 'Produksi Sublim', type: 'status_update', actionLabel: 'Sudah Diproduksi', isCompleted: false },
];

/**
 * Langkah produksi per produk merchandise. Produk yang tidak ditulis di sini
 * memakai DEFAULT_MERCHANDISE_STEPS (Cetak Kertas Sublim → Produksi Sublim).
 * UBAH DI SINI bila totebag / gantungan kunci dll. punya alur berbeda, mis.:
 *   totebag: [{ id: 't1', name: 'Jahit', type: 'status_update', actionLabel: 'Sudah Dijahit', isCompleted: false }, ...]
 * Catatan: langkah disalin ke pesanan SAAT DIBUAT, jadi perubahan di sini hanya
 * berlaku untuk pesanan baru. `id` langkah harus unik di dalam satu produk.
 */
export const MERCHANDISE_STEPS: Record<string, ProductionStep[]> = {
  // lanyard: [...],
};

export function getInitialMerchandiseSteps(produk?: string | null): ProductionStep[] {
  const tpl = (produk && MERCHANDISE_STEPS[produk]) || DEFAULT_MERCHANDISE_STEPS;
  return tpl.map((s) => ({ ...s, isCompleted: false }));
}

export const isMerchandiseJenis = (jenis?: string | null): boolean =>
  (jenis ?? '').toLowerCase() === MERCHANDISE_JENIS;

export const isMerchandiseOrder = (o?: { jenis_produksi?: string | null } | null): boolean =>
  isMerchandiseJenis(o?.jenis_produksi);

/** Nama kolom langkah produksi yang dipakai suatu jenis produksi. */
export type StepsKey = 'steps_manual' | 'steps_dtf' | 'steps_merchandise';

export function getStepsKey(jenisProduksi?: string | null): StepsKey {
  const t = (jenisProduksi ?? '').toLowerCase();
  if (t === MERCHANDISE_JENIS) return 'steps_merchandise';
  if (t.includes('manual') || t.includes('sablon')) return 'steps_manual';
  return 'steps_dtf';
}

/** Daftar langkah produksi sebuah pesanan (selalu array, tidak pernah null). */
export function getOrderSteps(o?: { jenis_produksi?: string | null } | null): ProductionStep[] {
  if (!o) return [];
  const steps = (o as any)[getStepsKey(o.jenis_produksi)];
  return Array.isArray(steps) ? steps : [];
}

/** Merchandise tidak punya tahap packing: setelah lolos QC langsung masuk Pengiriman. */
export const orderNeedsPacking = (o?: { jenis_produksi?: string | null } | null): boolean =>
  !isMerchandiseOrder(o);

/** Label produk merchandise (fallback: value apa adanya). */
export function merchandiseProductLabel(value?: string | null): string {
  if (!value) return '-';
  return MERCHANDISE_PRODUCTS.find((p) => p.value === value)?.label ?? value;
}

/** Label variasi produk merchandise, atau '' bila tidak ada. */
export function merchandiseVariantLabel(produk?: string | null, varian?: string | null): string {
  if (!varian) return '';
  const p = MERCHANDISE_PRODUCTS.find((x) => x.value === produk);
  return p?.variants.find((v) => v.value === varian)?.label ?? varian;
}

/** Teks ringkas untuk kartu/daftar, mis. "Lanyard · Dengan Stopper" atau "Totebag". */
export function merchandiseLabel(o?: { jenis_merchandise?: string | null; varian_merchandise?: string | null } | null): string {
  if (!o?.jenis_merchandise) return 'Merchandise';
  const v = merchandiseVariantLabel(o.jenis_merchandise, o.varian_merchandise);
  return v ? `${merchandiseProductLabel(o.jenis_merchandise)} · ${v}` : merchandiseProductLabel(o.jenis_merchandise);
}

/** Teks jenis untuk tampilan umum: merchandise → "Lanyard · ...", lainnya → jenis_produksi. */
export function orderTypeLabel(o: { jenis_produksi?: string | null; jenis_merchandise?: string | null; varian_merchandise?: string | null }): string {
  return isMerchandiseOrder(o) ? merchandiseLabel(o) : (o.jenis_produksi ?? '');
}

/** YYYY-MM-DD menurut jam LOKAL perangkat (toISOString memakai UTC dan bisa mundur sehari). */
export function toLocalISODate(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export const DEFAULT_USERS: UserData[] = [
  { 
    id: '1', 
    username: 'superadmin', 
    password: '123', 
    name: 'Super Admin', 
    role: 'super_admin', 
    permissions: DEFAULT_PERMISSIONS 
  },
  { 
    id: '2', 
    username: 'admin', 
    password: '123', 
    name: 'Admin Utama', 
    role: 'admin', 
    permissions: DEFAULT_PERMISSIONS 
  },
  { 
    id: '3', 
    username: 'prod', 
    password: '123', 
    name: 'Staff Produksi', 
    role: 'produksi', 
    permissions: DEFAULT_PERMISSIONS 
  },
  { 
    id: '4', 
    username: 'qc', 
    password: '123', 
    name: 'Staff QC', 
    role: 'qc', 
    permissions: DEFAULT_PERMISSIONS 
  },
  { 
    id: '5', 
    username: 'manager', 
    password: '123', 
    name: 'Manager/CEO', 
    role: 'manager', 
    permissions: DEFAULT_PERMISSIONS 
  },
];

export const DEFAULT_PRODUCTION_TYPES: ProductionTypeData[] = [
  { id: '1', name: 'Manual', value: 'manual' },
  { id: '2', name: 'DTF', value: 'dtf' },
];

// --- HELPER FUNCTIONS ---
export const formatDate = (dateStr: string) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const getDeadlineStatus = (deadlineStr: string, status: OrderStatus) => {
  if (status === 'Selesai' || status === 'Kirim') return 'safe';
  
  const deadline = new Date(deadlineStr);
  const today = new Date();
  today.setHours(0,0,0,0);
  
  const diffTime = deadline.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  
  if (diffDays < 0) return 'overdue';
  if (diffDays <= 2) return 'warning';
  return 'safe';
};

/**
 * Mendapatkan class warna Tailwind untuk status pesanan.
 * Mendukung Dark Mode secara otomatis.
 */
export const getStatusColor = (status: OrderStatus | string) => { 
  switch (status) {
    case 'Pesanan Masuk': 
      return 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
    
    case 'On Process': 
      return 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800';
    
    case 'Finishing': 
      return 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800';
    
    case 'Revisi': 
      return 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-800';
    
    case 'Ada Kendala': 
      return 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800';
    
    case 'Kirim': 
      return 'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-800';
    
    case 'Selesai': 
      return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800';
    
    case 'Telat': 
      return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800'; 
    
    default: 
      return 'bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-300';
  }
};

export const openWA = (hp: string) => {
  if (!hp) return;
  let formatted = hp.replace(/\D/g, '');
  if (formatted.startsWith('0')) formatted = '62' + formatted.slice(1);
  window.open(`https://wa.me/${formatted}`, '_blank');
};

// ─── Penamaan File Dokumen Order ──────────────────────────────────────────

function sanitizeFilenamePart(str: string): string {
  return str
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')   // buang karakter spesial (misal #, /, tanda kutip)
    .trim()
    .replace(/\s+/g, '');       // "Pecah Gambar" -> "PecahGambar"
}

/**
 * Memetakan type upload (dari onTriggerUpload) + nama step (jika ada)
 * menjadi label dokumen yang jelas dan konsisten untuk nama file.
 */
export function getDocumentLabel(type: string, stepName?: string): string {
  switch (type) {
    case 'approval':
      return 'ApprovalDesain';
    case 'packing':
      return 'Packing';
    case 'shipping_kirim':
      return 'BuktiKirim';
    case 'shipping_terima':
      return 'BuktiTerima';
    case 'kendala_bukti':
      return 'BuktiKendala';
    case 'step':
      // stepName contoh: "Proofing", "Pecah Gambar", "Print Film", "Produksi Massal"
      return stepName ? sanitizeFilenamePart(stepName) : 'Produksi';
    default:
      return sanitizeFilenamePart(type);
  }
}

/**
 * Menyusun nama file storage: YYYY-MM-DD_KodeProduksi_JenisDokumen
 * (tanpa ekstensi — tambahkan ekstensi terpisah saat dipakai)
 */
export function generateStorageFilename(
  jenisDokumen: string,
  kodeProduksi: string,
  tanggal: Date = new Date(),
): string {
  const sanitizeKode = (str: string) =>
    str.replace(/[#/\\]/g, '').replace(/\s+/g, '-').trim();

  const tgl = tanggal.toISOString().split('T')[0]; // "2026-07-04"

  return `${tgl}_${sanitizeKode(kodeProduksi)}_${jenisDokumen}`;
}