// wa-gateway/src/index.ts
// LCO WA Gateway
// - Menjaga koneksi WhatsApp (Baileys)
// - Worker: ambil pesan dari tabel wa_outbox, kirim pelan-pelan, catat hasilnya
// - Worker HANYA jalan kalau saklar "WhatsApp Bot" di Pengaturan app dalam keadaan aktif
//   (tabel wa_settings). Kalau nonaktif, pesan tetap menunggu di antrian.
// - HTTP kecil (SEMUA wajib header "Authorization: Bearer <GATEWAY_TOKEN>", kecuali /health):
//   /status, /qr.json (QR scan), /groups (cari ID grup), /send (tes manual)
// - Gateway TIDAK menyajikan halaman web. QR ditampilkan di app (Pengaturan → Notifikasi),
//   yang sudah dilindungi login + role.

import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import QRCode from 'qrcode';
import { createClient } from '@supabase/supabase-js';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
} from '@whiskeysockets/baileys';

const env = (k: string, d?: string) => {
  const v = process.env[k] ?? d;
  if (v === undefined || v === '') throw new Error(`Env ${k} belum diset`);
  return v;
};

const SUPABASE_URL = env('SUPABASE_URL');
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
const SCHEMA = env('SUPABASE_SCHEMA', 'monitoring_sablon');
const TOKEN = env('GATEWAY_TOKEN');
const AUTH_DIR = env('AUTH_DIR', '/data/auth');
const PORT = Number(env('PORT', '3100'));
const DELAY_MIN = Number(env('SEND_DELAY_MIN', '3'));
const DELAY_MAX = Number(env('SEND_DELAY_MAX', '8'));
const MAX_ATTEMPTS = Number(env('MAX_ATTEMPTS', '5'));

const log = pino({ level: 'info' });
const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: SCHEMA },
});

// ───────────────────────── Koneksi WhatsApp ─────────────────────────

let sock: WASocket | null = null;
let connState: 'starting' | 'qr' | 'open' | 'closed' = 'starting';
let lastQr: string | null = null;

async function startSocket() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'warn' }),
    browser: ['LCO Gateway', 'Chrome', '1.0'],
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      lastQr = qr;
      connState = 'qr';
      log.info('QR baru tersedia — scan lewat Pengaturan → Notifikasi di app');
    }
    if (connection === 'open') {
      connState = 'open';
      lastQr = null;
      log.info('WhatsApp terhubung');
    }
    if (connection === 'close') {
      connState = 'closed';
      const code = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      log.warn({ code }, loggedOut ? 'Logout dari HP — perlu scan QR ulang' : 'Koneksi putus, mencoba lagi');
      if (loggedOut) {
        // Hapus session lama supaya QR baru muncul pada restart berikutnya
        import('node:fs').then((fs) => fs.rmSync(AUTH_DIR, { recursive: true, force: true }));
      }
      setTimeout(() => startSocket().catch((e) => log.error(e)), 3000);
    }
  });
}

// ───────────────────────── Util kirim ─────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randDelay = () => (DELAY_MIN + Math.random() * Math.max(0, DELAY_MAX - DELAY_MIN)) * 1000;

function normalizeNumber(raw: string): string {
  let n = raw.replace(/[^0-9]/g, '');
  if (n.startsWith('0')) n = '62' + n.slice(1);
  else if (!n.startsWith('62')) n = '62' + n;
  return n;
}

const toJid = (type: 'group' | 'user', target: string) =>
  type === 'group' ? target : `${normalizeNumber(target)}@s.whatsapp.net`;

async function sendOne(type: 'group' | 'user', target: string, message: string, mentions: string[] = []) {
  if (!sock || connState !== 'open') throw new Error('WhatsApp belum terhubung');
  const jid = toJid(type, target);

  if (type === 'user') {
    const res = await sock.onWhatsApp(jid);
    if (!res?.[0]?.exists) throw new Error(`Nomor ${target} tidak terdaftar di WhatsApp`);
  }

  const mentionJids = mentions.map((m) => `${normalizeNumber(m)}@s.whatsapp.net`);
  await sock.sendMessage(jid, mentionJids.length ? { text: message, mentions: mentionJids } : { text: message });
}

// ───────────────────────── Worker antrian ─────────────────────────

let working = false;

// Saklar dari Pengaturan app (tabel wa_settings, baris id=1).
// Gagal baca / tabel belum ada → dianggap NONAKTIF (aman: tidak mengirim apa pun).
async function isEnabled(): Promise<boolean> {
  const { data, error } = await db.from('wa_settings').select('enabled').eq('id', 1).maybeSingle();
  if (error) {
    log.warn({ err: error.message }, 'gagal membaca wa_settings');
    return false;
  }
  return data?.enabled === true;
}

async function processQueue() {
  if (working || connState !== 'open') return;
  working = true;
  try {
    if (!(await isEnabled())) return; // saklar mati → jangan kirim apa pun

    // Pesan yang nyangkut di 'sending' > 2 menit (mis. gateway restart) dikembalikan ke pending
    await db
      .from('wa_outbox')
      .update({ status: 'pending' })
      .eq('status', 'sending')
      .lt('created_at', new Date(Date.now() - 2 * 60_000).toISOString())
      .is('sent_at', null);

    const { data: rows, error } = await db
      .from('wa_outbox')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(10);

    if (error) throw error;

    for (const row of rows ?? []) {
      // "Klaim" baris: hanya lanjut kalau memang masih pending (aman kalau ada 2 worker)
      const { data: claimed } = await db
        .from('wa_outbox')
        .update({ status: 'sending', attempts: row.attempts + 1 })
        .eq('id', row.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();
      if (!claimed) continue;

      try {
        await sendOne(row.target_type, row.target, row.message, row.mentions ?? []);
        await db
          .from('wa_outbox')
          .update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null })
          .eq('id', row.id);
        log.info({ id: row.id, to: row.target }, 'terkirim');
      } catch (e: any) {
        const attempts = row.attempts + 1;
        const giveUp = attempts >= MAX_ATTEMPTS;
        await db
          .from('wa_outbox')
          .update({
            status: giveUp ? 'failed' : 'pending',
            last_error: String(e?.message ?? e).slice(0, 500),
            // backoff: 1, 2, 4, 8 menit
            scheduled_at: new Date(Date.now() + 60_000 * 2 ** (attempts - 1)).toISOString(),
          })
          .eq('id', row.id);
        log.warn({ id: row.id, err: e?.message, attempts }, giveUp ? 'GAGAL permanen' : 'gagal, akan dicoba lagi');
      }

      await sleep(randDelay());
    }
  } catch (e) {
    log.error(e, 'processQueue error');
  } finally {
    working = false;
  }
}

// ───────────────────────── HTTP ─────────────────────────

// Perbandingan token dengan waktu konstan (tahan terhadap timing attack)
const sha = (v: string) => createHash('sha256').update(v).digest();
const safeEqual = (a: string, b: string) => timingSafeEqual(sha(a), sha(b));

const json = (res: http.ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const readBody = (req: http.IncomingMessage) =>
  new Promise<any>((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => {
      try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); }
    });
  });

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    // health check (tanpa token) untuk Coolify
    if (url.pathname === '/health') return json(res, 200, { ok: true, wa: connState });

    // Token hanya lewat header (bukan query string, supaya tidak tercatat di riwayat browser / log proxy)
    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
    if (!safeEqual(bearer, TOKEN)) return json(res, 401, { error: 'Unauthorized' });

    if (url.pathname === '/status') return json(res, 200, { wa: connState, enabled: await isEnabled() });

    // QR dalam bentuk JSON (data URL gambar) → dipakai halaman Pengaturan di app
    if (url.pathname === '/qr.json') {
      const qr = connState !== 'open' && lastQr ? await QRCode.toDataURL(lastQr, { width: 320, margin: 1 }) : null;
      return json(res, 200, { wa: connState, qr });
    }

    if (url.pathname === '/groups') {
      if (!sock || connState !== 'open') return json(res, 503, { error: 'WhatsApp belum terhubung' });
      const groups = await sock.groupFetchAllParticipating();
      return json(
        res,
        200,
        Object.values(groups).map((g) => ({ id: g.id, nama: g.subject, anggota: g.participants.length }))
      );
    }

    if (url.pathname === '/send' && req.method === 'POST') {
      const b = await readBody(req);
      if (!b.to || !b.message) return json(res, 400, { error: 'to & message wajib' });
      try {
        await sendOne(b.type === 'group' ? 'group' : 'user', b.to, b.message, b.mentions ?? []);
        return json(res, 200, { ok: true });
      } catch (e: any) {
        return json(res, 500, { error: e?.message });
      }
    }

    json(res, 404, { error: 'Not found' });
  })
  .listen(PORT, () => log.info(`HTTP gateway di port ${PORT}`));

startSocket().catch((e) => log.error(e));
setInterval(processQueue, 5000);