// lib/waQueue.ts — SERVER ONLY. Menaruh pesan ke antrian wa_outbox.
// Pengiriman sebenarnya dilakukan oleh service wa-gateway.

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import type { WaSettings } from '@/lib/waSettings';

export interface WaItem {
  target_type: 'group' | 'user';
  target: string;
  message: string;
  mentions?: string[];
  event_type: string;
  order_id?: string;
  dedupe_key: string;
}

export function normalizeWa(raw?: string | null): string | null {
  if (!raw) return null;
  let n = raw.replace(/[^0-9]/g, '');
  if (n.length < 8) return null;
  if (n.startsWith('0')) n = '62' + n.slice(1);
  else if (!n.startsWith('62')) n = '62' + n;
  return n;
}

// Insert dengan dedupe_key unik → kalau sudah ada, dilewati diam-diam.
// Saklar WhatsApp Bot nonaktif → tidak ada yang dimasukkan ke antrian.
export async function enqueueWa(items: WaItem[], cfg: WaSettings) {
  if (!cfg.enabled) return { queued: 0, skipped: 'nonaktif' as const };
  if (items.length === 0) return { queued: 0 };
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('wa_outbox')
    .upsert(items, { onConflict: 'dedupe_key', ignoreDuplicates: true })
    .select('id');
  if (error) throw new Error(error.message);
  return { queued: data?.length ?? 0 };
}

// Ambil order beserta PJ & helper (nama + nomor WA)
export const ORDER_WITH_PEOPLE =
  '*, pj:users!assigned_to ( name, no_wa ), helper:users!helper_id ( name, no_wa )';

export function orang(o: any) {
  const pj = o.pj ? { nama: o.pj.name as string, wa: normalizeWa(o.pj.no_wa) } : null;
  const helper = o.helper ? { nama: o.helper.name as string, wa: normalizeWa(o.helper.no_wa) } : null;
  const mention = [pj?.wa, helper?.wa].filter(Boolean) as string[];
  return { pj, helper, mention };
}