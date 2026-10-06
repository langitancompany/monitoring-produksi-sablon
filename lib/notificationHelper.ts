// lib/notificationHelper.ts - FIXED VERSION WITH order_id

import { createClient } from '@/lib/supabase/client';

// 1. Kirim ke 1 User (Spesifik)
// ✅ UPDATED: Tambah parameter orderId
export const sendNotification = async (
  targetUserId: string, 
  title: string, 
  body: string, 
  orderId?: string
) => {
  try {
    if (!targetUserId) return;

    const supabase = createClient();

    // Simpan notifikasi ke database untuk ditampilkan di icon lonceng
    const { error: dbError } = await supabase.from('notifications').insert({
      user_id: targetUserId,
      title,
      message: body,
      order_id: orderId, // ✅ Tambahkan order_id
      is_read: false
    });

    if (dbError) {
      console.error('❌ Gagal simpan notifikasi ke database:', dbError);
    } else {
      console.log(`✅ Notifikasi "${title}" disimpan untuk user ${targetUserId}`);
    }

    // (Opsional) Kirim push notification jika API tersedia
    try {
      await fetch('/api/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUserId, title, body }),
      });
    } catch (pushError) {
      // Push notification gagal tidak masalah, notifikasi tetap tersimpan di database
      console.log('ℹ️ Push notification tidak tersedia');
    }

  } catch (error) {
    console.error("❌ Gagal kirim notif:", error);
  }
};

// 2. Kirim ke User berdasarkan Role (Massal)
// ✅ UPDATED: Tambah parameter orderId
// Contoh usage: sendToRoles(['produksi', 'supervisor'], 'Judul', 'Pesan', 'order-uuid')
export const sendToRoles = async (
  roles: string[], 
  title: string, 
  body: string, 
  orderId?: string
) => {
  const supabase = createClient();
  
  try {
    // Cari User ID yang punya salah satu role tersebut.
    // Cek DUA kolom: `role` (role utama, data lama) dan `roles` (array, role ganda).
    // Kalau hanya cek `role`, user dengan role ganda (mis. QC + Produksi) yang role
    // utamanya 'produksi' tidak akan menerima notifikasi untuk role 'qc'.
    const list = roles.join(',');
    const { data: users, error: fetchError } = await supabase
      .from('users')
      .select('id')
      .or(`role.in.(${list}),roles.ov.{${list}}`);

    if (fetchError) {
      console.error('❌ Error fetch users by role:', fetchError);
      return;
    }

    if (users && users.length > 0) {
      // Simpan notifikasi ke database (batch insert untuk efisiensi)
      const notifications = users.map(u => ({
        user_id: u.id,
        title,
        message: body,
        order_id: orderId, // ✅ Tambahkan order_id
        is_read: false
      }));

      const { error: insertError } = await supabase.from('notifications').insert(notifications);

      if (insertError) {
        console.error('❌ Error insert notifications:', insertError);
      } else {
        console.log(`📢 Broadcast ke role [${roles.join(', ')}] berhasil (${users.length} users).`);
      }

      // (Opsional) Kirim push notification secara paralel
      const promises = users.map(u => 
        fetch('/api/send-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: u.id, title, body }),
        }).catch(err => {
          // Silent fail untuk push notification
          console.log('ℹ️ Push notification tidak tersedia');
        })
      );
      await Promise.all(promises);
    } else {
      console.log(`ℹ️ Tidak ada user dengan role [${roles.join(', ')}]`);
    }
  } catch (error) {
    console.error('❌ Error sendToRoles:', error);
  }
};

// 3. Kirim ke SEMUA User
// ✅ UPDATED: Tambah parameter orderId
export const sendToAllUsers = async (
  title: string, 
  body: string, 
  orderId?: string
) => {
  const supabase = createClient();
  
  try {
    const { data: users, error: fetchError } = await supabase
      .from('users')
      .select('id');

    if (fetchError) {
      console.error('❌ Error fetch all users:', fetchError);
      return;
    }

    if (users && users.length > 0) {
      // Simpan notifikasi ke database (batch insert)
      const notifications = users.map(u => ({
        user_id: u.id,
        title,
        message: body,
        order_id: orderId, // ✅ Tambahkan order_id
        is_read: false
      }));

      const { error: insertError } = await supabase.from('notifications').insert(notifications);

      if (insertError) {
        console.error('❌ Error insert notifications:', insertError);
      } else {
        console.log(`📢 Broadcast ke SEMUA USER berhasil (${users.length} users).`);
      }

      // (Opsional) Kirim push notification secara paralel
      const promises = users.map(u => 
        fetch('/api/send-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: u.id, title, body }),
        }).catch(err => {
          // Silent fail untuk push notification
          console.log('ℹ️ Push notification tidak tersedia');
        })
      );
      await Promise.all(promises);
    } else {
      console.log('ℹ️ Tidak ada user di database');
    }
  } catch (error) {
    console.error('❌ Error sendToAllUsers:', error);
  }
};

// 4. Tandai notifikasi sebagai sudah dibaca
export const markAsRead = async (notificationId: string) => {
  const supabase = createClient();
  
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);
    
    if (error) {
      console.error('❌ Error mark as read:', error);
    }
  } catch (error) {
    console.error('❌ Error markAsRead:', error);
  }
};

// 5. Tandai semua notifikasi user sebagai sudah dibaca
export const markAllAsRead = async (userId: string) => {
  const supabase = createClient();
  
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    
    if (error) {
      console.error('❌ Error mark all as read:', error);
    } else {
      console.log('✅ Semua notifikasi ditandai sebagai dibaca');
    }
  } catch (error) {
    console.error('❌ Error markAllAsRead:', error);
  }
};