// lib/finance/payments.ts  (SERVER ONLY)
// Select + mapper pembayaran. Path file bukti TIDAK PERNAH dikirim ke browser;
// browser hanya tahu `has_proof` dan meminta signed URL berumur pendek bila perlu.

import type { PaymentRow } from './types';

export const PAYMENT_SELECT =
  'id, order_id, invoice_id, kind, amount, paid_at, method, reference_no, payer_name, note, status, is_legacy, ' +
  'proof_path, proof_legacy, recorded_by_name, recorded_at, verified_by_name, verified_at, reject_reason, ' +
  'void_by_name, void_at, void_reason, orders(kode_produksi, nama_pemesan), finance_accounts(name)';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toPaymentRow(r: any): PaymentRow {
  const { proof_path, proof_legacy, finance_accounts, ...rest } = r;
  const legacyCount = Array.isArray(proof_legacy) ? proof_legacy.length : 0;
  return {
    ...rest,
    has_proof: Boolean(proof_path) || legacyCount > 0,
    account_name: finance_accounts?.name ?? null,
  } as PaymentRow;
}