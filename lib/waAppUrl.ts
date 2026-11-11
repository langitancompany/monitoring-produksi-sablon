// lib/waAppUrl.ts — URL publik aplikasi + pembuat link untuk isi pesan WhatsApp (SERVER ONLY).
// Atur NEXT_PUBLIC_APP_URL di Coolify; bila kosong dipakai https://sablon.langitan.co.

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://sablon.langitan.co').replace(/\/+$/, '');

/** Membuka menu Keuangan langsung di sub-tab Verifikasi. */
export const linkVerifikasi = () => `${APP_URL}/?tab=finance&ftab=verify`;

/** Membuka detail pesanan (Merchandise punya tab sendiri). */
export const linkPesanan = (orderId: string, merchandise: boolean) =>
  `${APP_URL}/?tab=${merchandise ? 'merchandise' : 'orders'}&view=detail&orderId=${encodeURIComponent(orderId)}`;
