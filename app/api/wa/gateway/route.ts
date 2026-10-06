// app/api/wa/gateway/route.ts
// Penghubung (proxy) antara halaman Pengaturan dan wa-gateway.
// Token gateway diambil dari database di sisi server, jadi tidak pernah tampil di browser.
//
//  GET  ?action=status   → status koneksi WhatsApp + apakah saklar aktif
//  GET  ?action=qr       → QR untuk scan (kalau belum terhubung)
//  GET  ?action=groups   → daftar grup WhatsApp yang diikuti nomor gateway
//  POST {action:'test', to, message} → kirim 1 pesan tes langsung (tanpa antrian)
//
// Bisa dipakai walau saklar belum aktif, supaya QR bisa discan lebih dulu.

import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { getWaSettings, gatewayTerisi } from '@/lib/waSettings';
import { normalizeWa } from '@/lib/waQueue';

export const dynamic = 'force-dynamic';

const ROLES = ['admin', 'manager', 'supervisor'];
const TIMEOUT_MS = 8000;

async function panggilGateway(path: string, init?: { method?: string; body?: unknown }) {
  const cfg = await getWaSettings();
  if (!gatewayTerisi(cfg)) {
    return NextResponse.json({ error: 'URL dan token gateway belum diisi.', reason: 'not_configured' }, { status: 400 });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.gatewayUrl}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${cfg.gatewayToken}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: ctrl.signal,
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      return NextResponse.json({ error: 'Token gateway ditolak. Periksa token di Pengaturan.', reason: 'unauthorized' }, { status: 502 });
    }
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    const timeout = e?.name === 'AbortError';
    return NextResponse.json(
      {
        error: timeout ? 'Gateway tidak merespons (timeout).' : 'Gateway tidak bisa dihubungi. Cek URL dan pastikan service sudah berjalan.',
        reason: 'unreachable',
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: NextRequest) {
  const guard = await requireUser(request, ROLES);
  if (!guard.ok) return guard.response;

  const action = request.nextUrl.searchParams.get('action');
  if (action === 'status') return panggilGateway('/status');
  if (action === 'qr') return panggilGateway('/qr.json');
  if (action === 'groups') return panggilGateway('/groups');
  return NextResponse.json({ error: 'action tidak dikenal' }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const guard = await requireUser(request, ROLES);
  if (!guard.ok) return guard.response;

  const b = (await request.json().catch(() => ({}))) as { action?: string; to?: string; message?: string };
  if (b.action !== 'test') return NextResponse.json({ error: 'action tidak dikenal' }, { status: 400 });

  const to = normalizeWa(b.to);
  if (!to) return NextResponse.json({ error: 'Nomor WhatsApp tidak valid.' }, { status: 400 });

  const message = (b.message ?? '').trim() || '✅ Tes WhatsApp Bot dari aplikasi monitoring produksi.';
  return panggilGateway('/send', { method: 'POST', body: { type: 'user', to, message: message.slice(0, 500) } });
}