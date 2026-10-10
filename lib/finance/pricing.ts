// lib/finance/pricing.ts
//
// Perhitungan harga tagihan. DIPAKAI DI SERVER sebagai sumber kebenaran (API route
// menghitung ulang total; angka dari browser tidak pernah dipercaya) dan di browser
// hanya untuk PRATINJAU di form tagihan. Murni fungsi, tanpa dependensi.

import type { SizeEntry } from '@/types';

/** Urutan ukuran terkecil -> terbesar. Mulai XXL kena biaya tambahan berkelipatan. */
const SIZE_ORDER = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'] as const;
const SURCHARGE_START_INDEX = SIZE_ORDER.indexOf('XXL');

export function getSizeSurcharge(ukuran: string, biayaUkuranBesar: number): number {
  const idx = (SIZE_ORDER as readonly string[]).indexOf(ukuran.toUpperCase());
  if (idx === -1 || idx < SURCHARGE_START_INDEX) return 0;
  return (idx - SURCHARGE_START_INDEX + 1) * biayaUkuranBesar;
}

export interface SizePricingRow {
  ukuran: string;
  qty: number;
  hargaPerPcs: number;
  subtotal: number;
}

export interface EntryPricingSummary {
  entryId: string;
  warna: string;
  lengan: 'pendek' | 'panjang';
  totalPcs: number;
  subtotal: number;
  sizes: SizePricingRow[];
}

export interface InvoiceCalc {
  /** true = order tanpa detail_ukuran, dihitung harga dasar x jumlah */
  isLegacy: boolean;
  totalPcs: number;
  subtotal: number;
  discount: number;
  total: number;
  entries: EntryPricingSummary[];
  hasUkuranBesar: boolean;
  hasLenganPanjang: boolean;
}

export interface InvoiceInput {
  detailUkuran: SizeEntry[] | null | undefined;
  jumlah: number;
  hargaDasar: number;
  biayaUkuranBesar?: number;
  biayaLenganPanjang?: number;
  discount?: number;
}

export function computeInvoice(input: InvoiceInput): InvoiceCalc {
  const hargaDasar = input.hargaDasar;
  const biayaUkuran = input.biayaUkuranBesar ?? 0;
  const biayaLengan = input.biayaLenganPanjang ?? 0;
  const discount = input.discount ?? 0;
  const detail = Array.isArray(input.detailUkuran) ? input.detailUkuran : [];

  if (detail.length === 0) {
    const subtotal = hargaDasar * input.jumlah;
    return {
      isLegacy: true,
      totalPcs: input.jumlah,
      subtotal,
      discount,
      total: Math.max(subtotal - discount, 0),
      entries: [],
      hasUkuranBesar: false,
      hasLenganPanjang: false,
    };
  }

  const entries: EntryPricingSummary[] = [];
  let totalPcs = 0;
  let subtotal = 0;
  let hasUkuranBesar = false;
  let hasLenganPanjang = false;

  for (const entry of detail) {
    const lenganExtra = entry.lengan === 'panjang' ? biayaLengan : 0;
    if (entry.lengan === 'panjang') hasLenganPanjang = true;

    const sizes: SizePricingRow[] = Object.entries(entry.ukuran ?? {})
      .filter(([, q]) => Number.isFinite(q) && (q as number) > 0)
      .map(([ukuran, q]) => {
        const qty = q as number;
        if (getSizeSurcharge(ukuran, 1) > 0) hasUkuranBesar = true;
        const hargaPerPcs = hargaDasar + getSizeSurcharge(ukuran, biayaUkuran) + lenganExtra;
        return { ukuran, qty, hargaPerPcs, subtotal: hargaPerPcs * qty };
      })
      .sort((a, b) => {
        const ia = (SIZE_ORDER as readonly string[]).indexOf(a.ukuran.toUpperCase());
        const ib = (SIZE_ORDER as readonly string[]).indexOf(b.ukuran.toUpperCase());
        if (ia === -1 && ib === -1) return a.ukuran.localeCompare(b.ukuran);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });

    const entryPcs = sizes.reduce((n, s) => n + s.qty, 0);
    const entrySubtotal = sizes.reduce((n, s) => n + s.subtotal, 0);
    entries.push({
      entryId: entry.id,
      warna: entry.warna,
      lengan: entry.lengan,
      totalPcs: entryPcs,
      subtotal: entrySubtotal,
      sizes,
    });
    totalPcs += entryPcs;
    subtotal += entrySubtotal;
  }

  return {
    isLegacy: false,
    totalPcs,
    subtotal,
    discount,
    total: Math.max(subtotal - discount, 0),
    entries,
    hasUkuranBesar,
    hasLenganPanjang,
  };
}