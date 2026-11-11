// app/api/wa/settings/route.ts
// Baca / simpan pengaturan WhatsApp Bot dari menu Pengaturan.
// Hanya admin / manager / Super Admin. Token gateway TIDAK pernah dikembalikan ke browser
// (hanya status "sudah diisi" + 4 karakter terakhir).

import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getWaSettings } from '@/lib/waSettings';
import { normalizeWa } from '@/lib/waQueue';

export const dynamic = 'force-dynamic';

const ROLES = ['admin', 'manager', 'super_admin'];
const MAKS_NOMOR = 10;

const tampil = (s: Awaited<ReturnType<typeof getWaSettings>>) => ({
  enabled: s.enabled,
  gateway_url: s.gatewayUrl,
  group_jid: s.groupJid,
  token_set: !!s.gatewayToken,
  token_hint: s.gatewayToken ? s.gatewayToken.slice(-4) : '',
  notify_verifikasi_numbers: s.notifyVerifikasiNumbers,
  notify_kendala_numbers: s.notifyKendalaNumbers,
});

// Validasi + normalisasi daftar nomor. Mengembalikan string error bila ada yang tidak valid.
function bersihkanNomor(raw: unknown, label: string): { ok: true; nomor: string[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.some((n) => typeof n !== 'string')) {
    return { ok: false, error: `Daftar nomor ${label} tidak valid` };
  }
  const hasil: string[] = [];
  for (const mentah of raw as string[]) {
    if (!mentah.trim()) continue;
    const n = normalizeWa(mentah);
    // Nomor Indonesia: 62 + 8–13 digit. Batas atas mencegah salah ketik tempel dua nomor.
    if (!n || n.length < 10 || n.length > 15) {
      return { ok: false, error: `Nomor "${mentah.trim()}" (${label}) tidak valid` };
    }
    if (!hasil.includes(n)) hasil.push(n);
  }
  if (hasil.length > MAKS_NOMOR) return { ok: false, error: `Maksimal ${MAKS_NOMOR} nomor untuk ${label}` };
  return { ok: true, nomor: hasil };
}

export async function GET(request: NextRequest) {
  const guard = await requireUser(request, ROLES);
  if (!guard.ok) return guard.response;
  return NextResponse.json(tampil(await getWaSettings()));
}

export async function PUT(request: NextRequest) {
  const guard = await requireUser(request, ROLES);
  if (!guard.ok) return guard.response;

  try {
    const body = (await request.json()) as {
      enabled?: boolean;
      gateway_url?: string;
      gateway_token?: string;
      group_jid?: string;
      notify_verifikasi_numbers?: string[];
      notify_kendala_numbers?: string[];
    };

    const sekarang = await getWaSettings();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof body.gateway_url === 'string') {
      const url = body.gateway_url.trim().replace(/\/+$/, '');
      if (url && !/^https?:\/\/[^\s/]+/i.test(url)) {
        return NextResponse.json({ error: 'URL gateway harus diawali http:// atau https://' }, { status: 400 });
      }
      patch.gateway_url = url;
    }

    // Token kosong = tidak diganti (supaya tidak perlu mengetik ulang tiap simpan)
    if (typeof body.gateway_token === 'string' && body.gateway_token.trim()) {
      patch.gateway_token = body.gateway_token.trim();
    }

    if (typeof body.group_jid === 'string') {
      const jid = body.group_jid.trim();
      if (jid && !jid.endsWith('@g.us')) {
        return NextResponse.json({ error: 'ID grup harus berakhiran @g.us' }, { status: 400 });
      }
      patch.group_jid = jid;
    }

    for (const [kolom, label] of [
      ['notify_verifikasi_numbers', 'verifikasi keuangan'],
      ['notify_kendala_numbers', 'kendala pesanan'],
    ] as const) {
      if (body[kolom] === undefined) continue;
      const r = bersihkanNomor(body[kolom], label);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      patch[kolom] = r.nomor;
    }

    if (typeof body.enabled === 'boolean') {
      if (body.enabled) {
        const url = (patch.gateway_url as string | undefined) ?? sekarang.gatewayUrl;
        const token = (patch.gateway_token as string | undefined) ?? sekarang.gatewayToken;
        if (!url || !token) {
          return NextResponse.json(
            { error: 'Isi dan simpan URL serta token gateway dulu sebelum mengaktifkan.' },
            { status: 400 },
          );
        }
      }
      patch.enabled = body.enabled;
    }

    const { error } = await getSupabaseAdmin()
      .from('wa_settings')
      .upsert({ id: 1, ...patch }, { onConflict: 'id' });
    if (error) throw new Error(error.message);

    return NextResponse.json(tampil(await getWaSettings()));
  } catch (e: any) {
    console.error('wa/settings error:', e);
    return NextResponse.json({ error: e?.message ?? 'Gagal menyimpan' }, { status: 500 });
  }
}