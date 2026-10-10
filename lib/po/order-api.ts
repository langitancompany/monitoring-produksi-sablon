// lib/po/order-api.ts
//
// Helper sisi browser untuk membuat / mengedit pesanan PO lewat API server
// (/api/po/orders). Harga & total SELALU dihitung ulang di server, jadi
// browser hanya mengirim id produk, varian, dan qty.

import type { POOrderPayload } from '@/types/po';

export interface SubmitOrderResult {
  success: boolean;
  po_number?: string;
  total_amount?: number;
  error?: string;
}

async function callApi(
  method: 'POST' | 'PATCH',
  body: unknown,
): Promise<SubmitOrderResult> {
  try {
    const res = await fetch('/api/po/orders', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
      return {
        success: false,
        error: json.error || 'Gagal memproses pesanan. Silakan coba lagi.',
      };
    }
    return {
      success: true,
      po_number: json.po_number,
      total_amount: json.total_amount,
    };
  } catch {
    return {
      success: false,
      error: 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.',
    };
  }
}

export function submitOrderViaApi(
  payload: POOrderPayload | Record<string, unknown>,
  poSettingId: string,
) {
  return callApi('POST', { po_setting_id: poSettingId, payload });
}

export function updateOrderViaApi(args: {
  po_number: string;
  reseller_id: string;
  notes?: string;
  order_items: unknown[];
}) {
  return callApi('PATCH', args);
}