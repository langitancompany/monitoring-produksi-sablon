// lib/finance/invoiceDoc.ts
// Model tampilan dokumen invoice untuk customer + teks pesan WhatsApp.
// Murni fungsi (tanpa React / tanpa akses jaringan). Semua angka uang berasal dari
// server (OrderFinanceDetail.finance); rincian baris dihitung dari data tagihan aktif
// HANYA untuk tampilan. Bila rincian tidak cocok dengan total tagihan resmi, rincian
// diganti satu baris ringkas supaya dokumen tidak pernah menampilkan angka yang berbeda.

import type { SizeEntry } from '@/types';
import { computeInvoice } from './pricing';
import {
  PAYMENT_KIND_LABEL,
  PAYMENT_METHOD_LABEL,
  type OrderFinanceDetail,
  type OrderPaymentStatus,
} from './types';

export interface InvoiceLine {
  label: string;
  detail: string;
  qty: number;
  subtotal: number;
}

export interface InvoicePaymentLine {
  date: string;
  label: string;
  amount: number;
  isRefund: boolean;
}

export interface InvoiceModel {
  number: string;
  revisionNote: string | null;
  issuedAt: string;
  dueDate: string | null;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  orderCode: string;
  jenisProduksi: string | null;
  status: OrderPaymentStatus;
  isLunas: boolean;
  lines: InvoiceLine[];
  totalPcs: number;
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  balance: number;
  overpaid: number;
  payments: InvoicePaymentLine[];
  /** Tanggal pembayaran terverifikasi terakhir (dipakai untuk keterangan "Lunas pada ..."). */
  lastPaidAt: string | null;
}

/** Ambil detail keuangan -> model invoice. Mengembalikan null bila order belum punya tagihan aktif. */
export function buildInvoiceModel(detail: OrderFinanceDetail): InvoiceModel | null {
  const inv = detail.invoices.find((i) => i.status === 'active');
  if (!inv) return null;

  const f = detail.finance;
  const o = detail.order;

  const calc = computeInvoice({
    detailUkuran: o.detail_ukuran as SizeEntry[] | null,
    jumlah: o.jumlah,
    hargaDasar: inv.harga_dasar,
    biayaUkuranBesar: inv.biaya_ukuran_besar,
    biayaLenganPanjang: inv.biaya_lengan_panjang,
    discount: inv.discount,
  });

  let lines: InvoiceLine[];
  const matches = !calc.isLegacy && calc.subtotal === inv.subtotal && calc.entries.length > 0;
  if (matches) {
    lines = calc.entries.map((e) => ({
      label: `${o.jenis_produksi ? o.jenis_produksi + ' · ' : ''}${e.warna} · lengan ${e.lengan}`,
      detail: e.sizes.map((s) => `${s.ukuran} ×${s.qty} @${s.hargaPerPcs.toLocaleString('id-ID')}`).join('  ·  '),
      qty: e.totalPcs,
      subtotal: e.subtotal,
    }));
  } else {
    lines = [
      {
        label: `Produksi ${o.jenis_produksi ?? 'pesanan'} (${o.kode_produksi})`,
        detail:
          inv.total_pcs > 0 && inv.harga_dasar > 0
            ? `Harga dasar ${inv.harga_dasar.toLocaleString('id-ID')} / pcs`
            : '',
        qty: inv.total_pcs || o.jumlah,
        subtotal: inv.subtotal,
      },
    ];
  }

  const verified = detail.payments
    .filter((p) => p.status === 'verified')
    .sort((a, b) => a.paid_at.localeCompare(b.paid_at));

  const payments: InvoicePaymentLine[] = verified.map((p) => ({
    date: p.paid_at,
    label: `${PAYMENT_KIND_LABEL[p.kind]} · ${PAYMENT_METHOD_LABEL[p.method]}${p.account_name ? ` · ${p.account_name}` : ''}`,
    amount: p.amount,
    isRefund: p.kind === 'refund',
  }));

  const revNum = Math.max(0, (inv.version ?? 1) - 1);
  return {
    number: `INV-${o.kode_produksi}`,
    revisionNote: revNum > 0 ? `Revisi ke-${revNum}` : null,
    issuedAt: inv.issued_at,
    dueDate: inv.due_date ?? f.due_date ?? null,
    customerName: o.nama_pemesan,
    customerPhone: o.no_hp?.trim() || null,
    customerAddress: o.alamat_pemesan?.trim() || null,
    orderCode: o.kode_produksi,
    jenisProduksi: o.jenis_produksi ?? null,
    status: f.payment_status,
    isLunas: f.payment_status === 'Lunas' || f.payment_status === 'Kelebihan Bayar',
    lines,
    totalPcs: inv.total_pcs || o.jumlah,
    subtotal: inv.subtotal,
    discount: inv.discount,
    total: f.total,
    paid: f.paid_verified,
    balance: f.balance,
    overpaid: f.overpaid,
    payments,
    lastPaidAt: payments.length ? payments[payments.length - 1].date : null,
  };
}

/** "08xx" / "+62 8xx" / "628xx" -> "628xx" untuk tautan wa.me. null bila tidak valid. */
export function normalizeWaNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return d.length >= 9 && d.length <= 15 ? d : null;
}

const rp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');

const dateLong = (s: string | null | undefined) => {
  if (!s) return '-';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);
  return Number.isNaN(d.getTime())
    ? '-'
    : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};

/** Teks pesan WhatsApp yang menyertai invoice. */
export function buildWaText(m: InvoiceModel, storeName: string, paymentInfo: string): string {
  const head = `Halo ${m.customerName},`;
  if (m.isLunas) {
    return [
      head,
      '',
      `Terima kasih, pembayaran untuk *${m.number}* sudah kami terima *LUNAS*${m.lastPaidAt ? ` (${dateLong(m.lastPaidAt)})` : ''}.`,
      `Total: ${rp(m.total)}`,
      '',
      'Invoice berstatus lunas kami lampirkan sebagai bukti pembayaran.',
      '',
      `Salam, ${storeName}`,
    ].join('\n');
  }
  const out = [
    head,
    '',
    `Berikut invoice *${m.number}* dari ${storeName}.`,
    `Total tagihan: ${rp(m.total)}`,
  ];
  if (m.paid > 0) out.push(`Sudah dibayar: ${rp(m.paid)}`);
  out.push(`*Sisa yang harus dibayar: ${rp(m.balance)}*`);
  if (m.dueDate) out.push(`Jatuh tempo: ${dateLong(m.dueDate)}`);
  if (paymentInfo.trim()) out.push('', 'Pembayaran ke:', paymentInfo.trim());
  out.push('', 'Mohon kirim bukti transfer setelah melakukan pembayaran. Terima kasih 🙏', '', `Salam, ${storeName}`);
  return out.join('\n');
}

export { dateLong as invoiceDateLong };

/** Data contoh untuk pratinjau di Keuangan > Pengaturan (bukan data nyata). */
export function buildSampleInvoiceModel(lunas: boolean): InvoiceModel {
  const total = 4350000;
  const dp = 2000000;
  return {
    number: 'INV-CSTM-261010-0001',
    revisionNote: null,
    issuedAt: '2026-10-10T03:00:00Z',
    dueDate: '2026-10-24',
    customerName: 'Nama Customer',
    customerPhone: '0812 3456 7890',
    customerAddress: 'Alamat customer contoh, Surabaya',
    orderCode: 'CSTM-261010-0001',
    jenisProduksi: 'DTF',
    status: lunas ? 'Lunas' : 'DP',
    isLunas: lunas,
    lines: [
      {
        label: 'DTF · Hitam · lengan pendek',
        detail:
          'L ×15 @70.000  ·  XL ×30 @70.000  ·  XXL ×5 @75.000  ·  XXXL ×5 @80.000  ·  4XL ×5 @85.000',
        qty: 60,
        subtotal: total,
      },
    ],
    totalPcs: 60,
    subtotal: total,
    discount: 0,
    total,
    paid: lunas ? total : dp,
    balance: lunas ? 0 : total - dp,
    overpaid: 0,
    payments: lunas
      ? [
          { date: '2026-10-11', label: 'DP · Transfer', amount: dp, isRefund: false },
          { date: '2026-10-20', label: 'Pelunasan · Transfer', amount: total - dp, isRefund: false },
        ]
      : [{ date: '2026-10-11', label: 'DP · Transfer', amount: dp, isRefund: false }],
    lastPaidAt: lunas ? '2026-10-20' : '2026-10-11',
  };
}