// app/api/cron/check-overdue/route.ts
import { NextResponse } from 'next/server';
import type admin from 'firebase-admin';
import { getFirebaseAdmin } from '@/lib/firebaseAdmin';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireCronSecret } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

// URL publik aplikasi (untuk link notifikasi). Set NEXT_PUBLIC_APP_URL di Coolify.
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://sablon.langitan.co').replace(/\/$/, '');

const INVALID_TOKEN_ERRORS = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/mismatched-credential',
]);

// Batas FCM: maksimal 500 token per panggilan multicast
const CHUNK_SIZE = 500;

// Wajib header: Authorization: Bearer <CRON_SECRET>
export async function GET(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  try {
    // 0. Inisialisasi Firebase Admin (baru dieksekusi saat request masuk, bukan saat build)
    let fbAdmin: typeof admin;
    try {
      fbAdmin = getFirebaseAdmin();
    } catch (err: any) {
      console.error('🔥 Firebase Admin init error:', err.message);
      return NextResponse.json(
        { error: 'Firebase Admin tidak terkonfigurasi', details: err.message },
        { status: 500 }
      );
    }

    // 1. Setup Admin Client Supabase (Bypass RLS)
    const supabase = getSupabaseAdmin();

    // 2. Cari Pesanan yang TELAT (Deadline < Hari ini) & Belum Selesai
    const today = new Date().toISOString().split('T')[0];
    const { data: overdueOrders } = await supabase
      .from('orders')
      .select('id, kode_produksi, deadline, nama_pemesan')
      .lt('deadline', today) // Deadline Less Than Today
      .neq('status', 'Selesai')
      .neq('status', 'Kirim')
      .order('deadline', { ascending: true }); // yang paling lama telat di depan

    if (!overdueOrders || overdueOrders.length === 0) {
      return NextResponse.json({ message: 'Tidak ada pesanan telat hari ini.' });
    }

    // 3. Cari Token User Target (Produksi, Admin, Supervisor)
    const targetRoles = ['produksi', 'admin', 'supervisor'];
    // Cek `role` (role utama) DAN `roles` (role ganda) — lihat lib/notificationHelper.ts
    const targetList = targetRoles.join(',');
    const { data: targetUsers } = await supabase
      .from('users')
      .select('id')
      .or(`role.in.(${targetList}),roles.ov.{${targetList}}`);

    if (!targetUsers || targetUsers.length === 0) {
      return NextResponse.json({ message: 'Tidak ada user dengan role target.' });
    }

    const targetUserIds = targetUsers.map((u: any) => u.id);

    // 4. Ambil Token FCM mereka
    const { data: tokensData } = await supabase
      .from('user_fcm_tokens')
      .select('token')
      .in('user_id', targetUserIds);

    if (!tokensData || tokensData.length === 0) {
      return NextResponse.json({ message: 'User target belum mengaktifkan notifikasi.' });
    }

    const uniqueTokens: string[] = [...new Set<string>(tokensData.map((t: any) => t.token))];

    // 5. Susun SATU notifikasi ringkasan (bukan satu per pesanan)
    const total = overdueOrders.length;
    let body: string;

    if (total === 1) {
      const o = overdueOrders[0];
      body = `Order ${o.kode_produksi} (${o.nama_pemesan}) sudah melewati deadline!`;
    } else {
      const SHOW = 3;
      const kode = overdueOrders.slice(0, SHOW).map((o: any) => o.kode_produksi).join(', ');
      const sisa = total - SHOW;
      body = `${total} pesanan melewati deadline: ${kode}${sisa > 0 ? `, dan ${sisa} lainnya` : ''}.`;
    }

    const title = '⚠️ ALERT: PESANAN TELAT';

    // 6. Kirim ke semua token (dipecah per 500 token), catat hasilnya
    let sentCount = 0;
    let failureCount = 0;
    const errorCodes = new Set<string>();
    const tokensToDelete: string[] = [];

    for (let i = 0; i < uniqueTokens.length; i += CHUNK_SIZE) {
      const chunk = uniqueTokens.slice(i, i + CHUNK_SIZE);

      const res = await fbAdmin.messaging().sendEachForMulticast({
        notification: { title, body },
        data: { title, body, url: `${APP_URL}/` },
        webpush: {
          notification: {
            title,
            body,
            icon: `${APP_URL}/logo.png`,
            badge: `${APP_URL}/icon-bedge.png`,
            tag: 'overdue-orders', // notif hari berikutnya menggantikan yang lama, tidak menumpuk
            renotify: true,
          } as any,
          fcmOptions: { link: `${APP_URL}/` },
        },
        tokens: chunk,
      });

      sentCount += res.successCount;
      failureCount += res.failureCount;

      res.responses.forEach((r, idx) => {
        if (!r.success && r.error) {
          const code = r.error.code ?? 'unknown';
          errorCodes.add(code);
          if (INVALID_TOKEN_ERRORS.has(code)) tokensToDelete.push(chunk[idx]);
        }
      });
    }

    if (failureCount > 0) {
      console.warn(
        `FCM gagal ${failureCount}/${uniqueTokens.length}:`,
        [...errorCodes].join(', ')
      );
    }

    // 7. Bersihkan token yang sudah mati supaya tidak menumpuk
    if (tokensToDelete.length > 0) {
      await supabase.from('user_fcm_tokens').delete().in('token', tokensToDelete);
      console.log(`🗑️ ${tokensToDelete.length} token expired dihapus`);
    }

    return NextResponse.json({
      success: true,
      notif_sent: sentCount,
      failure_count: failureCount,
      cleaned_tokens: tokensToDelete.length,
      error_codes: [...errorCodes],
      overdue_count: total,
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}