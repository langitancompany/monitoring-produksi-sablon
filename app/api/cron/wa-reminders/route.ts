// app/api/cron/wa-reminders/route.ts
// Jadwalkan di Coolify (Scheduled Task) tiap pagi, mis. 07:00 WIB:
//   curl -H "Authorization: Bearer $CRON_SECRET" https://sablon.langitan.co/api/cron/wa-reminders
// Aman dipanggil berkali-kali: dedupe_key membuat 1 pengingat per orang/grup per hari.

import { NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { enqueueWa, orang, ORDER_WITH_PEOPLE, type WaItem } from '@/lib/waQueue';
import { getWaSettings } from '@/lib/waSettings';
import { pesanDeadlinePersonal, pesanDeadlineGrup, type ItemDeadline } from '@/lib/waMessages';

export const dynamic = 'force-dynamic';

// Kirim pengingat kalau sisa hari ≤ ini (termasuk yang sudah telat)
const BATAS_HARI = 2;

// Berhenti mengingatkan order yang sudah telat lebih dari ini (hari). Mencegah order lama/terlupa/
// data uji mengirim pengingat setiap pagi selamanya. Ubah angka ini kalau ingin lebih lama/pendek.
const BATAS_TELAT_HARI = 14;

// Tanggal hari ini menurut WIB (bukan UTC) → format YYYY-MM-DD
const todayWIB = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

const selisihHari = (deadline: string, today: string) =>
  Math.round((Date.parse(deadline.slice(0, 10)) - Date.parse(today)) / 86_400_000);

export async function GET(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  try {
    // Saklar WhatsApp Bot (Pengaturan) mati → tidak ada pengingat yang dibuat.
    const cfg = await getWaSettings();
    if (!cfg.enabled) return NextResponse.json({ success: true, queued: 0, skipped: 'nonaktif' });

    const supabase = getSupabaseAdmin();
    const today = todayWIB();

    const { data: orders, error } = await supabase
      .from('orders')
      .select(ORDER_WITH_PEOPLE)
      .is('deleted_at', null)
      .not('status', 'in', '("Selesai","Kirim")')
      .not('deadline', 'is', null);
    if (error) throw new Error(error.message);

    const urgent: ItemDeadline[] = [];
    const perOrang = new Map<string, { nama: string; items: ItemDeadline[] }>();

    for (const o of orders ?? []) {
      const sisaHari = selisihHari(o.deadline, today);
      if (!Number.isFinite(sisaHari)) continue;          // deadline kosong / format salah
      if (sisaHari > BATAS_HARI) continue;               // belum mepet
      if (sisaHari < -BATAS_TELAT_HARI) continue;        // sudah telat terlalu lama
      const item = { order: o, sisaHari };
      urgent.push(item);

      const { pj, helper } = orang(o);
      for (const p of [pj, helper]) {
        if (!p?.wa) continue;
        const cur = perOrang.get(p.wa) ?? { nama: p.nama, items: [] };
        cur.items.push(item);
        perOrang.set(p.wa, cur);
      }
    }

    urgent.sort((a, b) => a.sisaHari - b.sisaHari); // paling telat di atas
    const items: WaItem[] = [];

    for (const [wa, { nama, items: list }] of perOrang) {
      list.sort((a, b) => a.sisaHari - b.sisaHari);
      items.push({
        target_type: 'user', target: wa, event_type: 'deadline',
        message: pesanDeadlinePersonal(nama, list), dedupe_key: `deadline:${today}:user:${wa}`,
      });
    }

    const grup = cfg.groupJid;
    if (grup && urgent.length > 0) {
      items.push({
        target_type: 'group', target: grup, event_type: 'deadline',
        message: pesanDeadlineGrup(urgent), dedupe_key: `deadline:${today}:grup`,
      });
    }

    const res = await enqueueWa(items, cfg);
    return NextResponse.json({ success: true, tanggal: today, order_perlu_diingatkan: urgent.length, ...res });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}