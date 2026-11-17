// lib/waProofing.ts — helper murni (tanpa import) untuk persetujuan proofing lewat WhatsApp.
// Dipisah supaya bisa diuji tanpa database / WhatsApp (lihat tests/waProofing.test.ts).

export type BalasanProofing =
  | { jenis: 'acc' }
  | { jenis: 'revisi'; alasan: string }
  | { jenis: 'revisi_kosong' }; // "Revisi:" tanpa alasan → bot minta alasan, status tidak berubah

// Hapus karakter tak terlihat & rapikan spasi (WhatsApp / keyboard HP kadang menyisipkan U+200E, U+00A0, dll.)
const bersih = (t: string) =>
  t.replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '').replace(/\u00A0/g, ' ').trim();

/**
 * Membaca isi balasan WhatsApp:
 *   "acc"                    → ACC (huruf besar/kecil bebas, tanda baca di ujung diabaikan)
 *   "Revisi: warna kurang"   → revisi, alasan = teks setelah titik dua pertama
 *   selain itu               → null (pesan biasa, TIDAK ditanggapi bot)
 */
export function bacaBalasanProofing(teks: string | null | undefined): BalasanProofing | null {
  const t = bersih(String(teks ?? ''));
  if (!t) return null;

  if (/^acc[\s.!]*$/i.test(t)) return { jenis: 'acc' };

  const m = t.match(/^revisi\s*:\s*([\s\S]*)$/i);
  if (m) {
    const alasan = m[1].trim();
    return alasan ? { jenis: 'revisi', alasan: alasan.slice(0, 500) } : { jenis: 'revisi_kosong' };
  }
  return null;
}

/** Ambil isi teks dari pesan WhatsApp (teks biasa, teks balasan, atau keterangan gambar). */
export function teksDariPesan(message: any): string {
  if (!message) return '';
  return String(
    message.conversation ??
      message.extendedTextMessage?.text ??
      message.imageMessage?.caption ??
      message.ephemeralMessage?.message?.extendedTextMessage?.text ??
      message.ephemeralMessage?.message?.conversation ??
      '',
  );
}
