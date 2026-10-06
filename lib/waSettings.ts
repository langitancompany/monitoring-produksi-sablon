// lib/waSettings.ts — SERVER ONLY.
// Membaca pengaturan WhatsApp Bot yang diisi di menu Pengaturan (tabel wa_settings).
// Token gateway hanya dibaca di server; tidak pernah dikirim balik ke browser.

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export interface WaSettings {
  enabled: boolean;
  gatewayUrl: string;   // tanpa garis miring di akhir
  gatewayToken: string;
  groupJid: string;
}

const KOSONG: WaSettings = { enabled: false, gatewayUrl: '', gatewayToken: '', groupJid: '' };

// Gagal baca (mis. migration belum dijalankan) → dianggap NONAKTIF supaya aman.
export async function getWaSettings(): Promise<WaSettings> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('wa_settings')
      .select('enabled, gateway_url, gateway_token, group_jid')
      .eq('id', 1)
      .maybeSingle();
    if (error || !data) {
      if (error) console.error('getWaSettings error:', error.message);
      return KOSONG;
    }
    return {
      enabled: data.enabled === true,
      gatewayUrl: String(data.gateway_url ?? '').trim().replace(/\/+$/, ''),
      gatewayToken: String(data.gateway_token ?? '').trim(),
      groupJid: String(data.group_jid ?? '').trim(),
    };
  } catch (e) {
    console.error('getWaSettings exception:', e);
    return KOSONG;
  }
}

export const gatewayTerisi = (s: WaSettings) => !!s.gatewayUrl && !!s.gatewayToken;