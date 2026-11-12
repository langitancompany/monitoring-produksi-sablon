// lib/waQueue.ts — SERVER ONLY. Menaruh pesan ke antrian wa_outbox.
// Pengiriman sebenarnya dilakukan oleh service wa-gateway.

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import type { WaSettings } from '@/lib/waSettings';
import { seragamkanBaris, tambahTagar } from '@/lib/waRows';

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
//
// Tahan banting: kalau insert massal gagal (mis. 1 item bermasalah / kolom `mentions` belum ada di
// tabel wa_outbox), item dicoba SATU PER SATU supaya pesan lain (mis. ke PJ & nomor penerima)
// tetap masuk antrian. Item yang gagal karena kolom `mentions` dicoba lagi tanpa mention: pesan
// tetap terkirim, hanya @mention-nya tidak menjadi tag. Semua kegagalan dicatat di log server
// dan dikembalikan lewat `errors`.
export async function enqueueWa(items: WaItem[], cfg: WaSettings) {
  if (!cfg.enabled) return { queued: 0, skipped: 'nonaktif' as const };
  if (items.length === 0) return { queued: 0 };
  const supabase = getSupabaseAdmin();

  const masuk = (rows: Record<string, unknown>[]) =>
    supabase
      .from('wa_outbox')
      .upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true })
      .select('id');

  // Semua baris wajib punya kolom yang sama (lihat lib/waRows.ts)
  items = seragamkanBaris(items).map((i) => ({ ...i, message: tambahTagar(i.message) }));

  const batch = await masuk(items as unknown as Record<string, unknown>[]);
  if (!batch.error) return { queued: batch.data?.length ?? 0 };

  console.error('enqueueWa: insert massal gagal, dicoba satu per satu:', batch.error.message);

  let queued = 0;
  const errors: string[] = [];
  for (const item of items) {
    let r = await masuk([item as unknown as Record<string, unknown>]);
    if (r.error && 'mentions' in item && /mentions/i.test(r.error.message)) {
      const { mentions: _abaikan, ...tanpaMention } = item;
      console.error('enqueueWa: kolom wa_outbox.mentions bermasalah, dikirim tanpa mention:', r.error.message);
      r = await masuk([tanpaMention as unknown as Record<string, unknown>]);
    }
    if (r.error) {
      console.error(`enqueueWa: gagal (${item.event_type} → ${item.target_type}):`, r.error.message);
      errors.push(r.error.message);
    } else {
      queued += r.data?.length ?? 0;
    }
  }

  // Semua gagal → lempar supaya route mengembalikan 500 dengan pesan penyebabnya
  if (queued === 0 && errors.length === items.length) throw new Error(errors[0]);
  return { queued, errors: [...new Set(errors)] };
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