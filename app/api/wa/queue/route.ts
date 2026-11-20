// app/api/wa/queue/route.ts
// Ringkasan antrian WhatsApp (tabel wa_outbox) untuk kartu tiap nomor pengirim di Pengaturan → Notifikasi.
//
//  GET → {
//    pending           jumlah pesan yang masih menunggu dikirim
//    oldest_pending_at pesan tertua yang masih menunggu (ISO) atau null
//    failed_24h        jumlah pesan gagal permanen dalam 24 jam terakhir
//    recent_failed     maks. 20 pesan gagal terakhir beserta alasannya (nomor disamarkan)
//    pending_by_event  { [jenis pesan]: { n, oldest } }  → dibagi ke nomor pengirim oleh WaSenders
//    failed_by_event   { [jenis pesan]: jumlah }          (jenis kosong = "")
//  }
//
// Hanya baca. Hanya admin / manager / Super Admin. Hanya hitungan ringan (head count),
// jadi aman dipanggil berkala dari halaman Pengaturan.

import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const ROLES = ['admin', 'manager', 'super_admin'];
const DAY_MS = 24 * 3600_000;

// 6281234567890 -> ••••7890 ; grup -> "Grup WhatsApp". Nomor lengkap tidak perlu sampai ke browser.
function samarkan(type: string, target: string): string {
  if (type === 'group') return 'Grup WhatsApp';
  const digit = String(target).replace(/\D/g, '');
  return digit.length >= 4 ? `••••${digit.slice(-4)}` : '••••';
}

export async function GET(request: NextRequest) {
  const guard = await requireUser(request, ROLES);
  if (!guard.ok) return guard.response;

  try {
    const db = getSupabaseAdmin();
    const since = new Date(Date.now() - DAY_MS).toISOString();

    // Antrian umumnya kecil; batas baris menjaga query tetap ringan bila antrian membludak
    const [pending, failed, recent] = await Promise.all([
      db.from('wa_outbox').select('event_type, created_at', { count: 'exact' }).eq('status', 'pending')
        .order('created_at', { ascending: true }).limit(2000),
      db.from('wa_outbox').select('event_type', { count: 'exact' }).eq('status', 'failed')
        .gte('created_at', since).limit(2000),
      db
        .from('wa_outbox')
        .select('id, event_type, target_type, target, last_error, created_at')
        .eq('status', 'failed')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    const err = pending.error || failed.error || recent.error;
    if (err) {
      return NextResponse.json({ error: 'Gagal membaca antrian WhatsApp.' }, { status: 500 });
    }

    // Terurut dari yang tertua, jadi kemunculan pertama tiap jenis = yang tertua
    const pendingByEvent: Record<string, { n: number; oldest: string }> = {};
    for (const r of (pending.data ?? []) as { event_type: string | null; created_at: string }[]) {
      const k = String(r.event_type ?? '');
      if (pendingByEvent[k]) pendingByEvent[k].n += 1;
      else pendingByEvent[k] = { n: 1, oldest: r.created_at };
    }
    const failedByEvent: Record<string, number> = {};
    for (const r of (failed.data ?? []) as { event_type: string | null }[]) {
      const k = String(r.event_type ?? '');
      failedByEvent[k] = (failedByEvent[k] ?? 0) + 1;
    }

    return NextResponse.json({
      pending: pending.count ?? 0,
      oldest_pending_at: (pending.data?.[0] as { created_at?: string } | undefined)?.created_at ?? null,
      failed_24h: failed.count ?? 0,
      pending_by_event: pendingByEvent,
      failed_by_event: failedByEvent,
      recent_failed: (recent.data ?? []).map((r: any) => ({
        id: String(r.id),
        event_type: String(r.event_type ?? ''),
        to: samarkan(String(r.target_type ?? ''), String(r.target ?? '')),
        error: r.last_error ? String(r.last_error).slice(0, 200) : null,
        at: r.created_at as string,
      })),
    });
  } catch (e) {
    console.error('wa/queue error:', e);
    return NextResponse.json({ error: 'Gagal membaca antrian WhatsApp.' }, { status: 500 });
  }
}
