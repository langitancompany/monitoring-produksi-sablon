// lib/po/public.ts
// Fungsi Supabase yang dipanggil dari halaman PUBLIK (tanpa login admin)

import { createClient } from '@/lib/supabase/client';
import { isPoExpired } from './order-validation';

export interface ResellerRegistrationPayload {
  nama: string;        // nama lengkap
  kode: string;         // nama panggilan -> jadi kode/username reseller
  whatsapp: string;
  alamat: string;
  kota?: string;
  pin_hash: string;     // PIN asli (plain), nama kolom existing
}

export async function registerReseller(
  payload: ResellerRegistrationPayload
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const { error } = await supabase.from('po_resellers').insert({
    kode: payload.kode.trim(),
    nama: payload.nama.trim(),
    whatsapp: payload.whatsapp.trim(),
    alamat: payload.alamat.trim(),
    pin_hash: payload.pin_hash.trim(),
    status: 'pending',
    is_active: false,
  });

  if (error) {
    // Kode duplikat (nama panggilan sudah dipakai reseller lain)
    if (error.code === '23505') {
      return {
        success: false,
        error: 'Nama panggilan ini sudah dipakai reseller lain. Coba nama panggilan lain.',
      };
    }
    return { success: false, error: error.message };
  }

  return { success: true };
}


export async function getPOSettingPublic(slug: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('po_setting')
    .select('*')
    .eq('url_slug', slug)
    .single();

  if (error) return null;
  return data && isPoExpired(data) ? { ...data, is_active: false } : data;
}