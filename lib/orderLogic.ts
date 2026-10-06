// lib/orderLogic.ts - FIXED VERSION WITH order_id
import { Order } from '@/types';
import { sendToRoles, sendToAllUsers } from './notificationHelper';

/**
 * Pemicu Utama Notifikasi LCO SuperApp V.7.0
 * Mengatur siapa yang menerima pesan berdasarkan status dan deadline
 * ✅ UPDATED: Sekarang menyertakan order_id untuk navigasi
 */
// ── TAMBAHAN ── antrikan pesan WhatsApp (diproses server + wa-gateway).
// Sengaja tidak di-await & gagal diam-diam: WA bermasalah tidak boleh mengganggu alur order.
const notifyWa = (orderId: string, event: 'created' | 'status_changed') => {
  fetch('/api/wa/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, event }),
  }).catch(() => {});
};

export const triggerOrderNotifications = async (orderData: Order, oldStatus?: string) => {
  const finalStatus = orderData.status;

  // ── TAMBAHAN ── WhatsApp: order baru & perubahan status
  if (!oldStatus) notifyWa(orderData.id, 'created');
  else if (oldStatus !== finalStatus) notifyWa(orderData.id, 'status_changed');

  const title = `Update: ${orderData.kode_produksi}`;
  const orderId = orderData.id; // ✅ Ambil ID pesanan

  // 1. LOGIKA: Pesanan Baru (Hanya jika pesanan baru saja di-insert)
  if (!oldStatus) {
    await sendToAllUsers(
      "📦 Pesanan Baru Masuk!", 
      `Order ${orderData.kode_produksi} (${orderData.nama_pemesan}) baru saja dibuat.`,
      orderId // ✅ Kirim order_id
    );
    return;
  }

  // 2. LOGIKA: Perubahan Status (Hanya jika status berubah)
  if (oldStatus !== finalStatus) {
    switch (finalStatus) {
      case 'On Process':
        // Produksi & Supervisor
        await sendToRoles(
          ['produksi', 'supervisor'], 
          title, 
          "Pesanan mulai diproses produksi.",
          orderId // ✅ Kirim order_id
        );
        break;
      
      case 'Ada Kendala':
        // Admin, Supervisor, Manager
        await sendToRoles(
          ['admin', 'supervisor', 'manager'], 
          "⚠️ ADA KENDALA!", 
          `Order ${orderData.kode_produksi} melaporkan kendala.`,
          orderId // ✅ Kirim order_id
        );
        break;

      case 'Finishing':
        // QC & Supervisor
        await sendToRoles(
          ['qc', 'supervisor'], 
          title, 
          "Pesanan masuk tahap Finishing & QC.",
          orderId // ✅ Kirim order_id
        );
        break;

      case 'Revisi':
        // Produksi, Supervisor, Manager
        await sendToRoles(
          ['produksi', 'supervisor', 'manager'], 
          "⚠️ REVISI QC", 
          `QC Gagal: ${orderData.finishing_qc?.notes}`,
          orderId // ✅ Kirim order_id
        );
        break;

      case 'Selesai':
        // Semua Role
        await sendToAllUsers(
          "✅ Pesanan Selesai", 
          `Order ${orderData.kode_produksi} telah selesai sepenuhnya!`,
          orderId // ✅ Kirim order_id
        );
        break;
    }
  }

  // 3. LOGIKA: Urgent & Telat (Pengecekan Waktu Realtime)
  if (orderData.deadline && finalStatus !== 'Selesai' && finalStatus !== 'Kirim') {
    const deadline = new Date(orderData.deadline);
    const today = new Date();
    const diffTime = deadline.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      // Telat -> Produksi, Admin, Supervisor
      await sendToRoles(
        ['produksi', 'admin', 'supervisor'], 
        "⛔ PESANAN TELAT", 
        `Order ${orderData.kode_produksi} sudah melewati deadline!`,
        orderId // ✅ Kirim order_id
      );
    } else if (diffDays <= 2) {
      // Urgent -> Produksi, Admin, Supervisor
      await sendToRoles(
        ['produksi', 'admin', 'supervisor'], 
        "🔥 URGENT / MEPET", 
        `Order ${orderData.kode_produksi} deadline tinggal ${diffDays} hari!`,
        orderId // ✅ Kirim order_id
      );
    }
  }
};