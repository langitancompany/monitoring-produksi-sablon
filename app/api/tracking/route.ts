// app/api/tracking/route.ts
//
// API publik untuk halaman /tracking (pelanggan lacak pesanan, tanpa login).
//
// Kenapa lewat server, bukan langsung dari browser ke Supabase:
//  - Tabel `orders` / view `orders_tracking` TIDAK perlu dibuka untuk role anon.
//    Anon key ada di browser siapa saja, jadi akses anon = siapa saja bisa baca.
//  - Server memakai service role, lalu hanya mengembalikan kolom yang memang
//    ditampilkan di timeline (tanpa no_hp, alamat, harga, pembayaran, catatan
//    internal, nama karyawan).
//  - Pencarian EXACT match (bukan ilike), jadi tanda % dan _ tidak bisa dipakai
//    untuk menebak banyak kode sekaligus.
//  - Kode produksi berpola (LCO-MM/YY-NNNN) dan bisa ditebak berurutan, jadi
//    pencarian WAJIB disertai 4 digit terakhir nomor HP pemesan. Kode benar tapi
//    digit salah dijawab sama persis dengan kode tidak ada (tidak bocor mana yang ada).
//  - Percobaan salah dibatasi per kode (5x, lalu terkunci 15 menit) dan per IP,
//    supaya 4 digit tidak bisa ditebak satu per satu.

import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// true  = nama pemesan disamarkan ("Budi Santoso" -> "Budi S***")
// false = nama tampil utuh seperti sebelumnya
const MASK_NAME = true;

// Batas permintaan umum per IP
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;

// Batas percobaan SALAH (kode/4 digit tidak cocok)
const FAIL_WINDOW_MS = 15 * 60_000;
const MAX_FAILS_PER_KODE = 5;
const MAX_FAILS_PER_IP = 10;

type Counter = { count: number; resetAt: number };

const hits = new Map<string, Counter>();
const failsByKode = new Map<string, Counter>();
const failsByIp = new Map<string, Counter>();

function sweep(map: Map<string, Counter>) {
  if (map.size <= 5000) return;
  const now = Date.now();
  for (const [k, v] of map) if (v.resetAt < now) map.delete(k);
}

function bump(map: Map<string, Counter>, key: string, windowMs: number): number {
  sweep(map);
  const now = Date.now();
  const e = map.get(key);
  if (!e || e.resetAt < now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return 1;
  }
  e.count += 1;
  return e.count;
}

function peek(map: Map<string, Counter>, key: string): number {
  const e = map.get(key);
  return e && e.resetAt >= Date.now() ? e.count : 0;
}

function tooMany(ip: string): boolean {
  return bump(hits, ip, WINDOW_MS) > MAX_REQUESTS;
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

// "lco04260001" / "LCO-04/26-0001" -> "LCO-04/26-0001"
function toCandidates(input: string): string[] {
  const raw = input.trim().replace(/^#/, '').toUpperCase();
  if (!raw || raw.length > 30) return [];
  // Hanya huruf, angka, strip, garis miring, spasi. Tolak sisanya (termasuk % dan _).
  if (!/^[A-Z0-9\-/ ]+$/.test(raw)) return [];

  const cleaned = raw.replace(/[^A-Z0-9]/g, '');
  const m = cleaned.match(/^([A-Z]{3})(\d{2})(\d{2})(\d{4})$/);
  const formatted = m ? `${m[1]}-${m[2]}/${m[3]}-${m[4]}` : raw;

  return Array.from(new Set([formatted, raw]));
}

function maskName(name: string | null): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts
    .slice(1)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')}***`;
}

// no_hp hanya dipakai di server untuk verifikasi, TIDAK dikirim ke browser.
const COLUMNS =
  'kode_produksi, no_hp, nama_pemesan, jumlah, jenis_produksi, status, tanggal_masuk, deadline, ' +
  'link_approval, steps_manual, steps_dtf, steps_merchandise, jenis_merchandise, varian_merchandise, finishing_qc, finishing_packing, shipping';

const NO_STORE = { 'Cache-Control': 'no-store' };

function lastFour(v: unknown): string | null {
  const digits = String(v ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function sameDigits(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(req: NextRequest) {
  const ip = clientIp(req);

  if (tooMany(ip)) {
    return NextResponse.json(
      { error: 'Terlalu banyak percobaan. Coba lagi sebentar.' },
      { status: 429, headers: { ...NO_STORE, 'Retry-After': '60' } }
    );
  }

  const params = new URL(req.url).searchParams;
  const candidates = toCandidates(params.get('kode') ?? '');
  const hp = (params.get('hp') ?? '').replace(/\D/g, '');

  if (candidates.length === 0 || !/^\d{4}$/.test(hp)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400, headers: NO_STORE });
  }

  // Kunci percobaan salah = kode hasil normalisasi (ada atau tidak di database)
  const kodeKey = candidates[0];
  if (
    peek(failsByKode, kodeKey) >= MAX_FAILS_PER_KODE ||
    peek(failsByIp, ip) >= MAX_FAILS_PER_IP
  ) {
    return NextResponse.json(
      { error: 'locked' },
      { status: 429, headers: { ...NO_STORE, 'Retry-After': '900' } }
    );
  }

  const fail = () => {
    bump(failsByKode, kodeKey, FAIL_WINDOW_MS);
    bump(failsByIp, ip, FAIL_WINDOW_MS);
    // Jawaban SAMA untuk "kode tidak ada" dan "4 digit salah"
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  };

  const { data, error } = await getSupabaseAdmin()
    .from('orders')
    .select(COLUMNS)
    .in('kode_produksi', candidates)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[tracking] query gagal:', error.message);
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: NO_STORE });
  }
  if (!data) return fail();

  // Order tanpa no_hp valid (kurang dari 4 digit) tidak bisa diverifikasi -> tolak.
  const expected = lastFour((data as any).no_hp);
  if (!expected || !sameDigits(expected, hp)) return fail();

  failsByKode.delete(kodeKey);

  const o = data as any;

  // Hanya field yang dipakai TrackingTimeline — sisanya tidak ikut keluar.
  const pickStep = (s: any) => ({
    id: s?.id,
    name: s?.name,
    isCompleted: !!s?.isCompleted,
    fileUrl: s?.fileUrl ?? null,
  });

  const order = {
    kode_produksi: o.kode_produksi,
    nama_pemesan: MASK_NAME ? maskName(o.nama_pemesan) : o.nama_pemesan,
    jumlah: o.jumlah,
    jenis_produksi: o.jenis_produksi,
    status: o.status,
    tanggal_masuk: o.tanggal_masuk,
    deadline: o.deadline,
    link_approval: o.link_approval
      ? { link: o.link_approval.link ?? null, timestamp: o.link_approval.timestamp ?? null }
      : null,
    steps_manual: Array.isArray(o.steps_manual) ? o.steps_manual.map(pickStep) : [],
    steps_dtf: Array.isArray(o.steps_dtf) ? o.steps_dtf.map(pickStep) : [],
    steps_merchandise: Array.isArray(o.steps_merchandise) ? o.steps_merchandise.map(pickStep) : [],
    jenis_merchandise: o.jenis_merchandise ?? null,
    varian_merchandise: o.varian_merchandise ?? null,
    finishing_qc: {
      isPassed: !!o.finishing_qc?.isPassed,
      timestamp: o.finishing_qc?.timestamp ?? null,
    },
    finishing_packing: {
      isPacked: !!o.finishing_packing?.isPacked,
      fileUrl: o.finishing_packing?.fileUrl ?? null,
    },
    shipping: {
      bukti_kirim: o.shipping?.bukti_kirim ?? null,
      timestamp_kirim: o.shipping?.timestamp_kirim ?? null,
      bukti_terima: o.shipping?.bukti_terima ?? null,
      timestamp_terima: o.shipping?.timestamp_terima ?? null,
    },
  };

  return NextResponse.json({ order }, { headers: NO_STORE });
}