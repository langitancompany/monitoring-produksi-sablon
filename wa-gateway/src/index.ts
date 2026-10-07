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
//
// Perlindungan anti-blokir yang ada di file ini:
//   • reconnect dengan backoff (tidak menggedor server WhatsApp tiap 3 detik)
//   • berhenti reconnect saat sesi dipakai di tempat lain (440) atau nomor dibatasi (403)
//   • cek "nomor terdaftar" di-cache (tidak query ke WhatsApp setiap pesan)
//   • indikator "sedang mengetik" + jeda acak antar pesan
//   • batas kirim per jam (pengaman kalau ada bug yang membanjiri antrian)
//   • pesan tidak "habis jatah percobaan" hanya karena WhatsApp sedang terputus

import http from 'node:http';
import fs from 'node:fs';
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
const MAX_PER_HOUR = Number(env('MAX_PER_HOUR', '60')); // pengaman; volume normal jauh di bawah ini

const log = pino({ level: 'info' });
const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: SCHEMA },
});

// ───────────────────────── Util umum ─────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randDelay = () => (DELAY_MIN + Math.random() * Math.max(0, DELAY_MAX - DELAY_MIN)) * 1000;

// Error yang tidak ada gunanya dicoba ulang (mis. nomor tidak terdaftar di WhatsApp)
class PermanentError extends Error {}
// WhatsApp sedang terputus — BUKAN kesalahan pesan, jadi tidak boleh menghabiskan jatah percobaan
class NotConnectedError extends Error {
  constructor() { super('WhatsApp belum terhubung'); }
}

// ───────────────────────── Koneksi WhatsApp ─────────────────────────

type ConnState = 'starting' | 'qr' | 'open' | 'closed';

let sock: WASocket | null = null;
let connState: ConnState = 'starting';
let lastQr: string | null = null;
let closeReason: string | null = null; // info tambahan untuk /status (tidak mengubah kontrak connState)
let failCount = 0;
let starting = false;
let shuttingDown = false;
let reconnectTimer: NodeJS.Timeout | null = null;

// 3s, 6s, 12s, 24s, 48s, lalu mentok 60s
const backoffMs = () => Math.min(60_000, 3_000 * 2 ** Math.min(failCount, 5));

function scheduleReconnect(ms: number) {
  if (shuttingDown || reconnectTimer) return;
  log.info({ inSeconds: Math.round(ms / 1000) }, 'menjadwalkan koneksi ulang');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startSocket().catch((e) => log.error(e));
  }, ms);
}

async function startSocket() {
  if (starting || shuttingDown) return;
  starting = true;
  try {
    // Pastikan socket lama benar-benar mati sebelum membuat yang baru
    if (sock) {
      try { sock.end(undefined); } catch { /* sudah mati */ }
      sock = null;
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const s = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'warn' }),
      browser: ['LCO Gateway', 'Chrome', '1.0'],
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
    sock = s;

    s.ev.on('creds.update', saveCreds);

    s.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      if (s !== sock) return; // event dari socket lama → abaikan

      if (qr) {
        lastQr = qr;
        connState = 'qr';
        log.info('QR baru tersedia — scan lewat Pengaturan → Notifikasi di app');
      }

      if (connection === 'open') {
        connState = 'open';
        lastQr = null;
        closeReason = null;
        failCount = 0;
        log.info('WhatsApp terhubung');
      }

      if (connection === 'close') {
        connState = 'closed';
        const code = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
        log.warn({ code }, 'Koneksi WhatsApp terputus');

        if (code === DisconnectReason.loggedOut) {
          // Logout dari HP → session tidak berlaku lagi, hapus supaya QR baru muncul
          closeReason = 'logged_out';
          failCount = 0;
          try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch (e) { log.error(e); }
          scheduleReconnect(3_000);
        } else if (code === DisconnectReason.connectionReplaced) {
          // Sesi yang sama dipakai di tempat lain (mis. 2 container jalan bersamaan saat redeploy).
          // Reconnect cepat = saling tendang tanpa henti → tunggu lama.
          closeReason = 'replaced';
          log.error('Sesi dipakai di tempat lain (connectionReplaced). Pastikan hanya ada 1 gateway yang jalan.');
          scheduleReconnect(120_000);
        } else if (code === DisconnectReason.forbidden) {
          // Nomor dibatasi/diblokir WhatsApp. Mencoba terus hanya memperburuk keadaan.
          closeReason = 'forbidden';
          log.error('WhatsApp menolak akses (403). Reconnect otomatis DIHENTIKAN — cek nomor, lalu restart gateway.');
        } else if (code === DisconnectReason.restartRequired) {
          // Normal setelah scan QR — langsung sambung lagi
          closeReason = null;
          scheduleReconnect(1_000);
        } else {
          closeReason = 'disconnected';
          failCount++;
          scheduleReconnect(backoffMs());
        }
      }
    });
  } catch (e) {
    // Mis. gagal baca auth dir / gagal ambil versi → dulu berhenti selamanya, sekarang dicoba lagi
    log.error(e, 'startSocket gagal');
    connState = 'closed';
    failCount++;
    scheduleReconnect(backoffMs());
  } finally {
    starting = false;
  }
}

// ───────────────────────── Util kirim ─────────────────────────

function normalizeNumber(raw: string): string {
  let n = raw.replace(/[^0-9]/g, '');
  if (n.startsWith('0')) n = '62' + n.slice(1);
  else if (!n.startsWith('62')) n = '62' + n;
  return n;
}

// Cache hasil cek "nomor terdaftar di WhatsApp" — query ini tidak perlu diulang tiap pesan,
// dan terlalu sering memanggilnya terlihat seperti pemindai nomor.
const WA_CACHE_TTL = 7 * 24 * 3600_000;
const waCache = new Map<string, { jid: string; exp: number }>();

async function resolveUserJid(target: string): Promise<string> {
  if (!sock || connState !== 'open') throw new NotConnectedError();
  const num = normalizeNumber(target);
  const hit = waCache.get(num);
  if (hit && hit.exp > Date.now()) return hit.jid;

  const res = await sock.onWhatsApp(`${num}@s.whatsapp.net`);
  const found = res?.[0];
  if (!found?.exists) throw new PermanentError(`Nomor ${target} tidak terdaftar di WhatsApp`);
  waCache.set(num, { jid: found.jid, exp: Date.now() + WA_CACHE_TTL });
  return found.jid;
}

// Catatan jumlah kirim 1 jam terakhir (pengaman)
const sentLog: number[] = [];
function sentLastHour() {
  const cutoff = Date.now() - 3600_000;
  while (sentLog.length && sentLog[0] < cutoff) sentLog.shift();
  return sentLog.length;
}

async function sendOne(type: 'group' | 'user', target: string, message: string, mentions: string[] = []) {
  if (!sock || connState !== 'open') throw new NotConnectedError();
  const jid = type === 'group' ? target : await resolveUserJid(target);

  // Tampil "sedang mengetik…" sebentar, seperti manusia
  try {
    await sock.sendPresenceUpdate('composing', jid);
    await sleep(Math.min(4000, 800 + message.length * 20));
    await sock.sendPresenceUpdate('paused', jid);
  } catch { /* presence gagal tidak boleh membatalkan pengiriman */ }

  const mentionJids = mentions.map((m) => `${normalizeNumber(m)}@s.whatsapp.net`);
  await sock.sendMessage(jid, mentionJids.length ? { text: message, mentions: mentionJids } : { text: message });
  sentLog.push(Date.now());
}

// ───────────────────────── Worker antrian ─────────────────────────

let working = false;
let capWarned = false;

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
  if (working || shuttingDown || connState !== 'open') return;
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
      // Terputus di tengah batch → hentikan, jangan "membakar" percobaan pesan berikutnya
      if (shuttingDown || connState !== 'open') break;

      // Pengaman batas per jam: sisanya tetap menunggu di antrian
      if (sentLastHour() >= MAX_PER_HOUR) {
        if (!capWarned) {
          log.warn({ cap: MAX_PER_HOUR }, 'Batas kirim per jam tercapai — sisa pesan ditahan. Cek apakah ada yang membanjiri antrian.');
          capWarned = true;
        }
        break;
      }
      capWarned = false;

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
        if (e instanceof NotConnectedError) {
          // Kembalikan seperti semula (jatah percobaan tidak dikurangi), lalu berhenti
          await db.from('wa_outbox').update({ status: 'pending', attempts: row.attempts }).eq('id', row.id);
          break;
        }
        const attempts = row.attempts + 1;
        const giveUp = e instanceof PermanentError || attempts >= MAX_ATTEMPTS;
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

const MAX_BODY = 20_000; // 20 KB cukup untuk 1 pesan tes
const readBody = (req: http.IncomingMessage) =>
  new Promise<any>((resolve) => {
    let d = '';
    let tooBig = false;
    req.on('data', (c) => {
      if (tooBig) return;
      d += c;
      if (d.length > MAX_BODY) { tooBig = true; d = ''; }
    });
    req.on('end', () => {
      if (tooBig) return resolve({});
      try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); }
    });
  });

// groupFetchAllParticipating cukup "berat" untuk WhatsApp → jangan dipanggil berulang-ulang
let groupsCache: { at: number; data: unknown } | null = null;
const GROUPS_TTL = 60_000;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');

    // health check (tanpa token) untuk Coolify
    if (url.pathname === '/health') return json(res, 200, { ok: true, wa: connState });

    // Token hanya lewat header (bukan query string, supaya tidak tercatat di riwayat browser / log proxy)
    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
    if (!safeEqual(bearer, TOKEN)) return json(res, 401, { error: 'Unauthorized' });

    if (url.pathname === '/status') {
      return json(res, 200, {
        wa: connState,
        reason: closeReason,
        enabled: await isEnabled(),
        sent_last_hour: sentLastHour(),
      });
    }

    // QR dalam bentuk JSON (data URL gambar) → dipakai halaman Pengaturan di app
    if (url.pathname === '/qr.json') {
      const qr = connState !== 'open' && lastQr ? await QRCode.toDataURL(lastQr, { width: 320, margin: 1 }) : null;
      return json(res, 200, { wa: connState, qr });
    }

    if (url.pathname === '/groups') {
      if (!sock || connState !== 'open') return json(res, 503, { error: 'WhatsApp belum terhubung' });
      if (groupsCache && Date.now() - groupsCache.at < GROUPS_TTL) return json(res, 200, groupsCache.data);
      const groups = await sock.groupFetchAllParticipating();
      const data = Object.values(groups).map((g) => ({ id: g.id, nama: g.subject, anggota: g.participants.length }));
      groupsCache = { at: Date.now(), data };
      return json(res, 200, data);
    }

    if (url.pathname === '/send' && req.method === 'POST') {
      const b = await readBody(req);
      if (typeof b.to !== 'string' || typeof b.message !== 'string' || !b.to || !b.message) {
        return json(res, 400, { error: 'to & message wajib' });
      }
      if (sentLastHour() >= MAX_PER_HOUR) return json(res, 429, { error: 'Batas kirim per jam tercapai' });
      try {
        await sendOne(b.type === 'group' ? 'group' : 'user', b.to, b.message, Array.isArray(b.mentions) ? b.mentions : []);
        return json(res, 200, { ok: true });
      } catch (e: any) {
        return json(res, 500, { error: e?.message });
      }
    }

    json(res, 404, { error: 'Not found' });
  } catch (e: any) {
    // Sebelumnya error di sini bisa mematikan seluruh proses gateway
    log.error(e, 'HTTP handler error');
    if (!res.headersSent) json(res, 500, { error: 'Internal error' });
    else res.end();
  }
});

server.listen(PORT, () => log.info(`HTTP gateway di port ${PORT}`));

// ───────────────────────── Start & shutdown ─────────────────────────

// Jangan biarkan satu error liar mematikan gateway
process.on('unhandledRejection', (e) => log.error(e, 'unhandledRejection'));
process.on('uncaughtException', (e) => log.error(e, 'uncaughtException'));

// Saat redeploy (SIGTERM), putus dengan rapi supaya container baru tidak bentrok
// dengan container lama ("connectionReplaced").
const shutdown = (sig: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ sig }, 'gateway berhenti');
  if (reconnectTimer) clearTimeout(reconnectTimer);
  try { sock?.end(undefined); } catch { /* abaikan */ }
  server.close();
  setTimeout(() => process.exit(0), 1500).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startSocket().catch((e) => log.error(e));
setInterval(processQueue, 5000);
