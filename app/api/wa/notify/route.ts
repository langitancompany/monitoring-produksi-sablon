// app/api/wa/notify/route.ts
// Dipanggil dari browser (lib/orderLogic.ts) setiap order dibuat / status berubah.
// Teks pesan dibuat DI SINI dari data database, jadi browser tidak bisa mengirim teks sembarang.

import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { enqueueWa, orang, ORDER_WITH_PEOPLE, type WaItem } from '@/lib/waQueue';
import { getWaSettings } from '@/lib/waSettings';
import {
  pesanOrderBaruGrup, pesanOrderBaruPersonal, pesanTahapPersonal, adaPesanTahap,
  pesanKendalaGrup, pesanRevisiGrup,
} from '@/lib/waMessages';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.response;

  try {
    const { orderId, event } = (await request.json()) as {
      orderId?: string;
      event?: 'created' | 'status_changed';
    };
    if (!orderId || !event) return NextResponse.json({ error: 'orderId & event wajib' }, { status: 400 });

    // Saklar WhatsApp Bot (Pengaturan) mati → berhenti di sini, tidak perlu query apa pun.
    const cfg = await getWaSettings();
    if (!cfg.enabled) return NextResponse.json({ success: true, queued: 0, skipped: 'nonaktif' });

    const supabase = getSupabaseAdmin();
    const { data: o, error } = await supabase
      .from('orders').select(ORDER_WITH_PEOPLE).eq('id', orderId).single();
    if (error || !o) return NextResponse.json({ error: 'Order tidak ditemukan' }, { status: 404 });

    const { pj, helper, mention } = orang(o);
    const grup = cfg.groupJid;
    const bucket = Math.floor(Date.now() / 60_000); // cegah dobel klik dalam 1 menit
    const items: WaItem[] = [];
    const base = { order_id: o.id as string };

    if (event === 'created') {
      if (grup) items.push({
        ...base, target_type: 'group', target: grup, event_type: 'order_baru',
        message: pesanOrderBaruGrup(o, pj?.nama, helper?.nama, mention), mentions: mention,
        dedupe_key: `baru:${o.id}:grup`,
      });
      if (pj?.wa) items.push({
        ...base, target_type: 'user', target: pj.wa, event_type: 'order_baru',
        message: pesanOrderBaruPersonal(pj.nama, 'PJ', o), dedupe_key: `baru:${o.id}:pj`,
      });
      if (helper?.wa) items.push({
        ...base, target_type: 'user', target: helper.wa, event_type: 'order_baru',
        message: pesanOrderBaruPersonal(helper.nama, 'Helper', o), dedupe_key: `baru:${o.id}:helper`,
      });
    }

    if (event === 'status_changed') {
      const status = o.status as string;

      if (status === 'Ada Kendala' && grup) {
        const list = Array.isArray(o.kendala) ? o.kendala : [];
        const aktif = [...list].reverse().find((k: any) => !k.isResolved);
        items.push({
          ...base, target_type: 'group', target: grup, event_type: 'kendala',
          message: pesanKendalaGrup(o, aktif?.notes ?? '', aktif?.reportedBy, mention), mentions: mention,
          dedupe_key: `kendala:${o.id}:${aktif?.id ?? bucket}`,
        });
      } else if (status === 'Revisi' && grup) {
        items.push({
          ...base, target_type: 'group', target: grup, event_type: 'revisi',
          message: pesanRevisiGrup(o, o.finishing_qc?.notes ?? '', mention), mentions: mention,
          dedupe_key: `revisi:${o.id}:${bucket}`,
        });
      } else if (adaPesanTahap(status)) {
        for (const [peran, p] of [['pj', pj], ['helper', helper]] as const) {
          if (p?.wa) items.push({
            ...base, target_type: 'user', target: p.wa, event_type: 'tahap',
            message: pesanTahapPersonal(p.nama, status, o),
            dedupe_key: `tahap:${o.id}:${status}:${peran}:${bucket}`,
          });
        }
      }
    }

    const res = await enqueueWa(items, cfg);
    return NextResponse.json({ success: true, ...res });
  } catch (e: any) {
    console.error('wa/notify error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}