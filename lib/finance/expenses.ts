// lib/finance/expenses.ts  (SERVER ONLY)
// Select + mapper pengeluaran. Path file bukti TIDAK PERNAH dikirim ke browser.

import type { ExpenseRow } from './types';

export const EXPENSE_SELECT =
  'id, expense_no, category_id, account_id, vendor_id, order_id, source, source_ref, description, amount, spent_at, note, status, ' +
  'proof_path, recorded_by_name, recorded_at, approved_by_name, approved_at, reject_reason, void_by_name, void_at, void_reason, ' +
  'finance_categories(name), finance_accounts(name), finance_vendors(name), orders(kode_produksi, nama_pemesan)';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toExpenseRow(r: any): ExpenseRow {
  const { proof_path, finance_categories, finance_accounts, finance_vendors, orders, ...rest } = r;
  return {
    ...rest,
    has_proof: Boolean(proof_path),
    category_name: finance_categories?.name ?? null,
    account_name: finance_accounts?.name ?? null,
    vendor_name: finance_vendors?.name ?? null,
    order_kode: orders?.kode_produksi ?? null,
    order_nama: orders?.nama_pemesan ?? null,
  } as ExpenseRow;
}
