// lib/finance/types.ts
// Tipe yang dipakai bersama oleh API route (server) dan komponen (client).

export type PaymentStatus = 'pending' | 'verified' | 'rejected' | 'void';
export type PaymentKind = 'dp' | 'cicilan' | 'pelunasan' | 'refund';
export type PaymentMethod = 'transfer' | 'tunai' | 'qris' | 'lainnya';

/** Status tagihan order. DIHITUNG di database (view v_order_finance), bukan diinput. */
export type OrderPaymentStatus =
  | 'Belum Ditagih'
  | 'Belum Bayar'
  | 'DP'
  | 'Lunas'
  | 'Kelebihan Bayar';

export interface OrderFinanceRow {
  order_id: string;
  kode_produksi: string;
  nama_pemesan: string;
  jenis_produksi: string;
  jumlah: number;
  tanggal_masuk: string | null;
  deadline: string | null;
  order_status: string;
  invoice_id: string | null;
  invoice_version: number | null;
  due_date: string | null;
  total: number;
  paid_verified: number;
  paid_pending: number;
  balance: number;
  overpaid: number;
  payment_status: OrderPaymentStatus;
}

export interface InvoiceRow {
  id: string;
  order_id: string;
  version: number;
  status: 'active' | 'superseded';
  harga_dasar: number;
  biaya_ukuran_besar: number;
  biaya_lengan_panjang: number;
  total_pcs: number;
  subtotal: number;
  discount: number;
  total: number;
  reason: string | null;
  due_date: string | null;
  is_legacy: boolean;
  issued_by_name: string | null;
  issued_at: string;
}

export interface PaymentRow {
  id: string;
  order_id: string;
  invoice_id: string | null;
  kind: PaymentKind;
  amount: number;
  paid_at: string;
  method: PaymentMethod;
  reference_no: string | null;
  payer_name: string | null;
  note: string | null;
  status: PaymentStatus;
  is_legacy: boolean;
  /** true bila ada file bukti (path asli tidak pernah dikirim ke browser) */
  has_proof: boolean;
  recorded_by_name: string | null;
  recorded_at: string;
  verified_by_name: string | null;
  verified_at: string | null;
  reject_reason: string | null;
  void_by_name: string | null;
  void_at: string | null;
  void_reason: string | null;
  account_name: string | null;
  orders?: { kode_produksi: string; nama_pemesan: string } | null;
}

export interface FinanceAccount {
  id: string;
  code: string;
  name: string;
  type: 'cash' | 'bank' | 'ewallet';
}

export interface FinanceMeta {
  accounts: FinanceAccount[];
  settings: {
    require_proof_non_cash: boolean;
    require_separate_verifier: boolean;
    allow_overpayment: boolean;
    auto_verify_own_payment: boolean;
  };
  pending_count: number;
}

export interface OverviewData {
  period: { from: string; to: string };
  cash_in: number;
  tagihan_terbit: number;
  piutang_total: number;
  piutang_count: number;
  piutang_overdue: number;
  pending_count: number;
  pending_amount: number;
  aging: { bucket: string; count: number; amount: number }[];
  top_debtors: { order_id: string; kode_produksi: string; nama_pemesan: string; balance: number; days_overdue: number }[];
}

export interface OrderFinanceDetail {
  finance: OrderFinanceRow;
  order: { id: string; kode_produksi: string; nama_pemesan: string; jumlah: number; detail_ukuran: unknown };
  invoices: InvoiceRow[];
  payments: PaymentRow[];
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  transfer: 'Transfer',
  tunai: 'Tunai',
  qris: 'QRIS',
  lainnya: 'Lainnya',
};

export const PAYMENT_KIND_LABEL: Record<PaymentKind, string> = {
  dp: 'DP',
  cicilan: 'Cicilan',
  pelunasan: 'Pelunasan',
  refund: 'Refund',
};