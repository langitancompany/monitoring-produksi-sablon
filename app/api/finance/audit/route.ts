// GET /api/finance/audit?from=&to=&entity=&limit=  -> log audit keuangan (HANYA Super Admin)
// Log bersifat append-only di database; endpoint ini hanya membaca.
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireFinance, finFail, bad, isDate } from '@/lib/finance/server';
import { AUDIT_ENTITIES, type AuditRow } from '@/lib/finance/types';

export const dynamic = 'force-dynamic';

/** Buang rincian harga yang besar dari before/after agar respons ringan. */
function slim(v: unknown): unknown {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const { pricing_snapshot: _drop, ...rest } = v as Record<string, unknown>;
    void _drop;
    return rest;
  }
  return v;
}

export async function GET(req: NextRequest) {
  const guard = await requireFinance(req, 'view');
  if (!guard.ok) return guard.response;
  if (!guard.actor.caps.isSuperAdmin) return bad('Hanya Super Admin yang boleh melihat log audit', 403);

  const sp = req.nextUrl.searchParams;
  const from = sp.get('from');
  const to = sp.get('to');
  const entity = sp.get('entity');
  const limit = Math.min(Math.max(Number(sp.get('limit')) || 200, 1), 500);
  if ((from && !isDate(from)) || (to && !isDate(to))) return bad('Tanggal tidak valid');
  if (entity && !(AUDIT_ENTITIES as readonly string[]).includes(entity)) return bad('Jenis tidak valid');

  const admin = getSupabaseAdmin();
  let q = admin
    .from('finance_audit_log')
    .select('id, at, actor_name, action, entity, entity_id, order_id, before, after, reason');
  // Rentang tanggal dibaca sebagai hari WIB (UTC+7).
  if (from) q = q.gte('at', `${from}T00:00:00+07:00`);
  if (to) q = q.lte('at', `${to}T23:59:59.999+07:00`);
  if (entity) q = q.eq('entity', entity);

  const { data, error } = await q.order('at', { ascending: false }).limit(limit);
  if (error) return finFail(error);

  type Raw = Omit<AuditRow, 'order_kode'>;
  const rows = (data ?? []) as Raw[];

  // Tabel audit tidak punya relasi ke orders; ambil kode order terpisah, per potongan 80 id
  // (daftar id di URL tidak boleh terlalu panjang).
  const ids = [...new Set(rows.map((r) => r.order_id).filter((x): x is string => !!x))];
  const kode = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 80) {
    const o = await admin.from('orders').select('id, kode_produksi').in('id', ids.slice(i, i + 80));
    for (const r of (o.data ?? []) as { id: string; kode_produksi: string }[]) kode.set(r.id, r.kode_produksi);
  }

  const out: AuditRow[] = rows.map((r) => ({
    ...r,
    before: slim(r.before),
    after: slim(r.after),
    order_kode: r.order_id ? (kode.get(r.order_id) ?? null) : null,
  }));
  return NextResponse.json({ rows: out, limit, truncated: out.length >= limit });
}
