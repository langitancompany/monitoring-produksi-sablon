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
  /** Pengeluaran menunggu persetujuan (untuk badge tab Pengeluaran). */
  expense_pending_count?: number;
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
  /** Uang keluar terverifikasi pada rentang tanggal (pengeluaran berstatus approved + refund). */
  cash_out: number;
  expense_pending_count: number;
  expense_pending_amount: number;
  aging: { bucket: string; count: number; amount: number }[];
  top_debtors: { order_id: string; kode_produksi: string; nama_pemesan: string; balance: number; days_overdue: number }[];
}

export interface OrderFinanceDetail {
  finance: OrderFinanceRow;
  order: {
    id: string;
    kode_produksi: string;
    nama_pemesan: string;
    no_hp?: string | null;
    alamat_pemesan?: string | null;
    jumlah: number;
    detail_ukuran: unknown;
    jenis_produksi?: string | null;
    tanggal_masuk?: string | null;
  };
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

// ───────────────────────── UANG KELUAR (pengeluaran) ─────────────────────────

export type ExpenseStatus = 'pending' | 'approved' | 'rejected' | 'void';

export interface FinanceCategory {
  id: string;
  code: string;
  name: string;
}

export interface FinanceVendor {
  id: string;
  name: string;
  phone: string | null;
}

export interface ExpenseRow {
  id: string;
  expense_no: string | null;
  category_id: string;
  account_id: string;
  vendor_id: string | null;
  order_id: string | null;
  source: 'manual' | 'salary' | 'purchase';
  source_ref: string | null;
  description: string;
  amount: number;
  spent_at: string;
  note: string | null;
  status: ExpenseStatus;
  /** true bila ada file bukti (path asli tidak pernah dikirim ke browser) */
  has_proof: boolean;
  recorded_by_name: string | null;
  recorded_at: string;
  approved_by_name: string | null;
  approved_at: string | null;
  reject_reason: string | null;
  void_by_name: string | null;
  void_at: string | null;
  void_reason: string | null;
  category_name: string | null;
  account_name: string | null;
  vendor_name: string | null;
  order_kode: string | null;
  order_nama: string | null;
}

export interface ExpenseMeta {
  categories: FinanceCategory[];
  vendors: FinanceVendor[];
  accounts: FinanceAccount[];
  settings: {
    auto_approve_own_expense: boolean;
    require_separate_verifier: boolean;
    /** 0 = bukti tidak diwajibkan */
    expense_proof_required_above: number;
  };
}

export interface OrderLookupRow {
  id: string;
  kode_produksi: string;
  nama_pemesan: string;
}

export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = {
  pending: 'Menunggu persetujuan',
  approved: 'Disetujui',
  rejected: 'Ditolak',
  void: 'Dibatalkan',
};

// ───────────────────────── LAPORAN & AUDIT ─────────────────────────

export interface ReportMonth {
  /** "YYYY-MM" */
  month: string;
  /** Pendapatan = nilai tagihan order yang masuk pada bulan itu (basis tanggal masuk order). */
  revenue: number;
  /** Pengeluaran berstatus approved pada bulan itu. */
  expenses: number;
  /** revenue − expenses */
  profit: number;
  /** Pembayaran terverifikasi pada bulan itu (sudah dikurangi refund). */
  cash_in: number;
  cash_out: number;
  cash_net: number;
}

export interface ReportOrder {
  order_id: string;
  kode_produksi: string;
  nama_pemesan: string;
  tanggal_masuk: string | null;
  total: number;
  paid: number;
  /** Pengeluaran approved yang dikaitkan ke order ini (seluruh waktu). */
  direct_cost: number;
  /** total − direct_cost */
  gross: number;
}

export interface ReportData {
  period: { from: string; to: string };
  /** true bila ada kueri yang terpotong batas baris (hasil bisa kurang lengkap). */
  truncated: boolean;
  totals: {
    revenue: number;
    expenses: number;
    profit: number;
    cash_in: number;
    cash_out: number;
    cash_net: number;
    /** Tagihan pada periode ini yang belum terbayar (sisa). */
    unpaid_billed: number;
    expenses_linked: number;
    expenses_unlinked: number;
  };
  months: ReportMonth[];
  by_category: { name: string; amount: number }[];
  orders: ReportOrder[];
  orders_total: number;
}

export interface AuditRow {
  id: number;
  at: string;
  actor_name: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  order_id: string | null;
  order_kode: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
}

export const AUDIT_ENTITIES = ['payment', 'invoice', 'expense', 'vendor', 'period', 'export', 'migration'] as const;

export const AUDIT_ENTITY_LABEL: Record<string, string> = {
  payment: 'Pembayaran',
  invoice: 'Tagihan',
  expense: 'Pengeluaran',
  vendor: 'Vendor',
  period: 'Periode',
  export: 'Ekspor',
  migration: 'Migrasi',
};

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  'invoice.issue': 'Terbitkan tagihan',
  'invoice.revise': 'Revisi tagihan',
  'payment.record': 'Catat pembayaran',
  'payment.verify': 'Verifikasi pembayaran',
  'payment.reject': 'Tolak pembayaran',
  'payment.void': 'Void pembayaran',
  'expense.record': 'Catat pengeluaran',
  'expense.approve': 'Setujui pengeluaran',
  'expense.reject': 'Tolak pengeluaran',
  'expense.void': 'Void pengeluaran',
  'transfer.record': 'Catat transfer akun',
  'vendor.create': 'Tambah vendor',
  'period.close': 'Tutup periode',
  'period.reopen': 'Buka kembali periode',
  'export.excel': 'Ekspor Excel',
  'migration.legacy': 'Migrasi data lama',
};

// ───────────────────────── PANDUAN: "perlu tindakan" ─────────────────────────

export interface TodoData {
  pending_payments: { count: number; amount: number; oldest_days: number | null };
  pending_expenses: { count: number; amount: number; oldest_days: number | null };
  /** Tagihan yang sudah lewat jatuh tempo dan masih ada sisa. */
  overdue: { count: number; amount: number };
  /** Order masuk dalam 30 hari terakhir yang belum punya tagihan. */
  unbilled_recent: { count: number; since: string };
}
