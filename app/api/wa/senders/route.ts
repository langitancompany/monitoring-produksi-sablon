// app/api/wa/senders/route.ts
// Kelola nomor pengirim WhatsApp (tabel wa_senders). Hanya admin / manager / Super Admin.
//
//  GET     → daftar nomor + katalog tugas
//  POST    {label, tasks}            → tambah nomor (QR muncul di halaman Pengaturan dalam ±30 detik)
//  PATCH   {id, label?, tasks?, enabled?}
//  DELETE  {id}                      → hapus nomor (gateway memutus sesinya & menghapus folder sesi)
//
// `tasks` di sini berupa KUNCI tugas (lihat lib/waSenders.ts); yang disimpan ke database adalah
// jenis pesannya. Nomor 'utama' tidak bisa dimatikan. Menghapusnya = memutus perangkat & menghapus sesinya
// (gateway memulai sesi utama baru yang menunggu scan QR; nama & tugas kembali ke bawaan). Daftar tugasnya boleh kosong: ia
// mengirim semua jenis pesan yang tidak dialihkan ke nomor lain. Bila diisi, ia hanya mengirim yang dipilih
// (tugas nomor tambahan yang sedang tidak siap tetap diambil alih gateway).

import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  DEFAULT_SENDER_ID,
  MAKS_SENDER,
  SENDER_ID_RE,
  WA_TUGAS,
  buatSenderId,
  cariBentrok,
  eventsDariTugas,
  tugasDariEvents,
} from '@/lib/waSenders';

export const dynamic = 'force-dynamic';

const ROLES = ['admin', 'manager', 'super_admin'];
const TABEL_HILANG = /wa_senders|does not exist|schema cache/i;

interface Row { id: string; label: string; enabled: boolean; tasks: string[] }

const tampil = (r: Row) => ({
  id: r.id,
  label: r.label || (r.id === DEFAULT_SENDER_ID ? 'Nomor Utama' : r.id),
  enabled: r.id === DEFAULT_SENDER_ID ? true : r.enabled !== false,
  is_default: r.id === DEFAULT_SENDER_ID,
  tasks: tugasDariEvents(r.tasks ?? []),
});

const katalog = () => WA_TUGAS.map(({ key, label, desc, events }) => ({ key, label, desc, events }));

async function muat(): Promise<{ rows: Row[]; migrated: boolean }> {
  const { data, error } = await getSupabaseAdmin()
    .from('wa_senders')
    .select('id, label, enabled, tasks')
    .order('created_at', { ascending: true });
  if (error) {
    if (TABEL_HILANG.test(error.message)) {
      return { rows: [{ id: DEFAULT_SENDER_ID, label: 'Nomor Utama', enabled: true, tasks: [] }], migrated: false };
    }
    throw new Error(error.message);
  }
  const rows = (data ?? []) as Row[];
  if (!rows.some((r) => r.id === DEFAULT_SENDER_ID)) {
    rows.unshift({ id: DEFAULT_SENDER_ID, label: 'Nomor Utama', enabled: true, tasks: [] });
  }
  return { rows, migrated: true };
}

const bersihLabel = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);

function bacaTugas(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.some((k) => typeof k !== 'string')) return null;
  return eventsDariTugas(raw as string[]);
}

const belumMigrasi = () =>
  NextResponse.json(
    { error: 'Tabel wa_senders belum ada. Jalankan SQL supabase/migrations/023_wa_senders.sql dulu.' },
    { status: 409 },
  );

export async function GET(request: NextRequest) {
  const guard = await requireUser(request, ROLES);
  if (!guard.ok) return guard.response;
  try {
    const { rows, migrated } = await muat();
    return NextResponse.json({ migrated, maks: MAKS_SENDER, tugas: katalog(), senders: rows.map(tampil) });
  } catch (e: any) {
    console.error('wa/senders GET error:', e);
    return NextResponse.json({ error: e?.message ?? 'Gagal memuat' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireUser(request, ROLES);
  if (!guard.ok) return guard.response;
  try {
    const b = (await request.json().catch(() => ({}))) as { label?: string; tasks?: string[] };
    const label = bersihLabel(b.label);
    if (!label) return NextResponse.json({ error: 'Nama nomor wajib diisi.' }, { status: 400 });
    const events = bacaTugas(b.tasks ?? []);
    if (!events) return NextResponse.json({ error: 'Daftar tugas tidak valid.' }, { status: 400 });

    const { rows, migrated } = await muat();
    if (!migrated) return belumMigrasi();
    if (rows.length >= MAKS_SENDER) {
      return NextResponse.json({ error: `Maksimal ${MAKS_SENDER} nomor pengirim.` }, { status: 400 });
    }
    const bentrok = cariBentrok(rows.filter((r) => r.enabled !== false), events);
    if (bentrok) return NextResponse.json({ error: bentrok }, { status: 400 });

    let id = buatSenderId();
    while (rows.some((r) => r.id === id)) id = buatSenderId();
    const { error } = await getSupabaseAdmin().from('wa_senders').insert({ id, label, enabled: true, tasks: events });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    console.error('wa/senders POST error:', e);
    return NextResponse.json({ error: e?.message ?? 'Gagal menambah nomor' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const guard = await requireUser(request, ROLES);
  if (!guard.ok) return guard.response;
  try {
    const b = (await request.json().catch(() => ({}))) as {
      id?: string; label?: string; tasks?: string[]; enabled?: boolean;
    };
    if (!b.id || !SENDER_ID_RE.test(b.id)) return NextResponse.json({ error: 'ID nomor tidak valid.' }, { status: 400 });
    const { rows, migrated } = await muat();
    if (!migrated) return belumMigrasi();
    const target = rows.find((r) => r.id === b.id);
    if (!target) return NextResponse.json({ error: 'Nomor tidak ditemukan.' }, { status: 404 });
    const utama = b.id === DEFAULT_SENDER_ID;

    const patch: Record<string, unknown> = {};
    if (b.label !== undefined) {
      const label = bersihLabel(b.label);
      if (!label) return NextResponse.json({ error: 'Nama nomor wajib diisi.' }, { status: 400 });
      patch.label = label;
    }
    if (utama && b.enabled !== undefined) {
      return NextResponse.json({ error: 'Nomor utama tidak bisa dimatikan.' }, { status: 400 });
    }
    if (!utama && typeof b.enabled === 'boolean') patch.enabled = b.enabled;
    let events: string[] | null = null;
    if (b.tasks !== undefined) {
      events = bacaTugas(b.tasks);
      if (!events) return NextResponse.json({ error: 'Daftar tugas tidak valid.' }, { status: 400 });
      patch.tasks = events; // nomor utama: kosong = semua yang tidak dipegang nomor lain
    }
    // Cek bentrok hanya bila nomor ini aktif setelah perubahan. Nomor utama yang daftarnya kosong tidak
    // memegang tugas apa pun secara khusus, jadi tidak ikut dihitung sebagai pemegang.
    const aktif = utama ? true : ((patch.enabled as boolean | undefined) ?? target.enabled !== false);
    const efektif = events ?? target.tasks ?? [];
    if (aktif && efektif.length) {
      const bentrok = cariBentrok(rows.filter((r) => r.id !== b.id && r.enabled !== false), efektif);
      if (bentrok) return NextResponse.json({ error: bentrok }, { status: 400 });
    }
    if (!Object.keys(patch).length) return NextResponse.json({ ok: true });

    const db = getSupabaseAdmin();
    const { error } = utama
      // Baris utama bisa belum ada (mis. setelah dihapus) → upsert; kolom yang tak disebut tidak berubah
      ? await db.from('wa_senders').upsert({ id: b.id, label: target.label || 'Nomor Utama', ...patch }, { onConflict: 'id' })
      : await db.from('wa_senders').update(patch).eq('id', b.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('wa/senders PATCH error:', e);
    return NextResponse.json({ error: e?.message ?? 'Gagal menyimpan' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireUser(request, ROLES);
  if (!guard.ok) return guard.response;
  try {
    const b = (await request.json().catch(() => ({}))) as { id?: string };
    if (!b.id || !SENDER_ID_RE.test(b.id)) return NextResponse.json({ error: 'ID nomor tidak valid.' }, { status: 400 });
    // Nomor utama boleh dihapus: barisnya dibuang, gateway memutus & menghapus sesinya lalu menunggu QR baru
    const { error } = await getSupabaseAdmin().from('wa_senders').delete().eq('id', b.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('wa/senders DELETE error:', e);
    return NextResponse.json({ error: e?.message ?? 'Gagal menghapus' }, { status: 500 });
  }
}
