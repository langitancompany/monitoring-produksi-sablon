// wa-gateway/src/index.ts
// LCO WA Gateway
// - Menjaga koneksi WhatsApp (Baileys). BISA BANYAK NOMOR PENGIRIM sekaligus: tiap nomor = satu
//   sesi (kelas Session) dengan koneksi, batas kirim, dan circuit breaker sendiri. Daftar nomor
//   dibaca dari tabel wa_senders tiap 30 detik, jadi nomor yang ditambah di Pengaturan app
//   otomatis dijalankan tanpa deploy ulang. Nomor 'utama' memakai AUTH_DIR (sesi lama tetap
//   dipakai, tidak perlu scan QR ulang); nomor lain memakai folder auth-<id> di samping AUTH_DIR.
//   Pembagian tugas: nomor tambahan hanya mengirim jenis pesan (event_type) yang dipilihnya;
//   nomor utama mengirim semua jenis yang tidak dialihkan. Tabel wa_senders belum ada → perilaku
//   lama (satu nomor, semua pesan).
// - Worker: ambil pesan dari tabel wa_outbox, kirim pelan-pelan, catat hasilnya
// - Worker HANYA jalan kalau saklar "WhatsApp Bot" di Pengaturan app dalam keadaan aktif
//   (tabel wa_settings). Kalau nonaktif, pesan tetap menunggu di antrian.
// - HTTP kecil (SEMUA wajib header "Authorization: Bearer <GATEWAY_TOKEN>", kecuali /health):
//   /status, /qr.json (QR scan), /groups (cari ID grup), /send (tes manual), /senders (semua nomor);
//   semuanya menerima ?sender=<id> (kosong = nomor utama)
// - Gateway TIDAK menyajikan halaman web. QR ditampilkan di app (Pengaturan → Notifikasi),
//   yang sudah dilindungi login + role.
//
// Perlindungan anti-blokir yang ada di file ini:
//   • reconnect dengan backoff (tidak menggedor server WhatsApp tiap 3 detik)
//   • berhenti reconnect saat sesi dipakai di tempat lain (440) atau nomor dibatasi (403)
//   • cek "nomor terdaftar" di-cache (tidak query ke WhatsApp setiap pesan)
//   • indikator "sedang mengetik" + jeda acak antar pesan
//   • batas kirim per jam / per hari / per penerima — dihitung dari tabel wa_outbox, jadi TIDAK
//     ter-reset saat gateway restart (pengaman kalau ada bug yang membanjiri antrian)
//   • circuit breaker: kirim gagal beruntun → seluruh antrian dijeda (tanda WhatsApp mulai membatasi)
//   • cache metadata grup (tanpa ini tiap kirim ke grup menanyakan data grup ke server WhatsApp)
//   • pesan tidak "habis jatah percobaan" hanya karena WhatsApp sedang terputus
//   • hemat query database: saklar aktif di-cache 15 detik, antrian kosong = 1 query per putaran,
//     pemulihan pesan nyangkut hanya tiap 1 menit (dulu 3 query tiap 5 detik, 24 jam sehari)
//   • cache "nomor terdaftar" disimpan ke file (/data/wa-numbers.json), jadi tidak hilang saat restart
//   • getMessage: pesan yang baru terkirim disimpan sebentar di memori supaya WhatsApp bisa mengirim
//     ulang bila HP penerima gagal mendekripsi ("Menunggu pesan ini") tanpa pesan jadi kosong
//   • status 'sent' ditulis dengan percobaan ulang; kalau tetap gagal, pesan TIDAK dikirim dua kali

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import QRCode from 'qrcode';
import { createClient } from '@supabase/supabase-js';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type GroupMetadata,
  type proto,
  type WASocket,
} from '@whiskeysockets/baileys';
import { CircuitBreaker, NumberCache, SendLimiter, TtlCache, buatLinkPreview, memegangTugas, rancangRute, retry } from './safety.js';

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
// URL aplikasi (mis. https://sablon.langitan.co). Dipakai meneruskan balasan proofing ("ACC" /
// "Revisi: ...") ke aplikasi. Kosong = fitur balasan nonaktif, pengiriman pesan tetap berjalan.
const APP_URL = (process.env.APP_URL ?? '').trim().replace(/\/+$/, '');
const DELAY_MIN = Number(env('SEND_DELAY_MIN', '3'));
const DELAY_MAX = Number(env('SEND_DELAY_MAX', '8'));
const MAX_ATTEMPTS = Number(env('MAX_ATTEMPTS', '5'));
// Batas kirim (pengaman; volume normal jauh di bawah ini). Pesan yang kena batas DITAHAN, bukan dibuang.
const MAX_PER_HOUR = Number(env('MAX_PER_HOUR', '20'));
const MAX_PER_DAY = Number(env('MAX_PER_DAY', '150'));
const MAX_PER_USER_PER_HOUR = Number(env('MAX_PER_USER_PER_HOUR', '8'));   // per orang (DM)
const MAX_PER_GROUP_PER_HOUR = Number(env('MAX_PER_GROUP_PER_HOUR', '15')); // per grup
// Circuit breaker: gagal beruntun sebanyak ini → antrian dijeda. Jeda pertama BREAKER_PAUSE_MIN menit,
// digandakan bila gagal lagi setelah jeda, maksimal BREAKER_MAX_PAUSE_MIN menit.
const BREAKER_THRESHOLD = Number(env('BREAKER_THRESHOLD', '3'));
const BREAKER_PAUSE_MIN = Number(env('BREAKER_PAUSE_MIN', '30'));
const BREAKER_MAX_PAUSE_MIN = Number(env('BREAKER_MAX_PAUSE_MIN', '240'));
// Masa berlaku cache metadata grup (menit). Juga dibersihkan saat ada perubahan grup & saat reconnect.
const GROUP_CACHE_TTL_MIN = Number(env('GROUP_CACHE_TTL_MIN', '360'));

const log = pino({ level: 'info' });
const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: SCHEMA },
});

// ───────────────────────── Util umum ─────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randDelay = () => (DELAY_MIN + Math.random() * Math.max(0, DELAY_MAX - DELAY_MIN)) * 1000;

const DEFAULT_ID = 'utama';
const SENDER_ID_RE = /^[a-z0-9][a-z0-9-]{0,30}$/;
const SYNC_EVERY_MS = 30_000;
const AUTH_ROOT = path.dirname(AUTH_DIR);
const authDirFor = (id: string) => (id === DEFAULT_ID ? AUTH_DIR : path.join(AUTH_ROOT, `auth-${id}`));

// Saklar "WhatsApp Bot" dibaca dari database paling sering tiap 15 detik (bukan tiap putaran antrian)
const ENABLED_TTL_MS = 15_000;
const enabledCache = new TtlCache<boolean>(ENABLED_TTL_MS);
// Pemulihan pesan yang nyangkut di 'sending' cukup tiap 1 menit
const RECOVERY_EVERY_MS = 60_000;

// Error yang tidak ada gunanya dicoba ulang (mis. nomor tidak terdaftar di WhatsApp)
class PermanentError extends Error {}
// WhatsApp sedang terputus — BUKAN kesalahan pesan, jadi tidak boleh menghabiskan jatah percobaan
class NotConnectedError extends Error {
  constructor() { super('WhatsApp belum terhubung'); }
}

type ConnState = 'starting' | 'qr' | 'open' | 'closed';

// ───────────────────────── Pesan masuk (balasan proofing) ─────────────────────────

const teksPesan = (m: any): string =>
  String(
    m?.conversation ??
      m?.extendedTextMessage?.text ??
      m?.imageMessage?.caption ??
      m?.ephemeralMessage?.message?.extendedTextMessage?.text ??
      m?.ephemeralMessage?.message?.conversation ??
      '',
  );

// Cepat & murah: hanya pesan yang tampak seperti balasan proofing yang diteruskan ke aplikasi.
// Penilaian akhir (nomor terdaftar, pesanan yang dimaksud) dilakukan aplikasi.
const mirip = (t: string) => /^\s*(acc[\s.!]*$|revisi\s*:)/i.test(t);

// Pengirim bisa berupa JID nomor (62xxx@s.whatsapp.net) atau LID (xxxx@lid). LID dipetakan ke nomor
// lewat remoteJidAlt / pemetaan Baileys. Gagal dipetakan → null (aplikasi masih bisa mencocokkan lewat swipe-reply).
async function nomorPengirim(key: any, sock: WASocket | null): Promise<string | null> {
  const ambil = (jid?: string | null) =>
    jid && jid.endsWith('@s.whatsapp.net') ? jid.split('@')[0].split(':')[0] : null;
  const langsung = ambil(key?.remoteJid) ?? ambil(key?.remoteJidAlt);
  if (langsung) return langsung;
  const lid: string | undefined = key?.remoteJid?.endsWith('@lid') ? key.remoteJid : undefined;
  if (lid) {
    try {
      const pn = await (sock as any)?.signalRepository?.lidMapping?.getPNForLID?.(lid);
      return ambil(pn);
    } catch { /* tidak terpetakan */ }
  }
  return null;
}

// ───────────────────────── Util kirim ─────────────────────────

function normalizeNumber(raw: string): string {
  let n = raw.replace(/[^0-9]/g, '');
  if (n.startsWith('0')) n = '62' + n.slice(1);
  else if (!n.startsWith('62')) n = '62' + n;
  return n;
}

// Cache hasil cek "nomor terdaftar di WhatsApp" — query ini tidak perlu diulang tiap pesan,
// dan terlalu sering memanggilnya terlihat seperti pemindai nomor. Disimpan ke file di samping
// folder sesi (bukan di dalamnya, karena folder sesi dihapus saat logout) supaya tahan restart.
// Dipakai bersama semua nomor pengirim (status terdaftar tidak bergantung pada pengirim).
const WA_CACHE_TTL = 7 * 24 * 3600_000;
const numberCache = new NumberCache(WA_CACHE_TTL);
const NUMBER_CACHE_FILE = path.join(AUTH_ROOT, 'wa-numbers.json');
let numberSaveTimer: NodeJS.Timeout | null = null;

function loadNumberCache() {
  try {
    const n = numberCache.load(JSON.parse(fs.readFileSync(NUMBER_CACHE_FILE, 'utf8')));
    log.info({ nomor: n }, 'cache nomor terdaftar dimuat dari file');
  } catch (e: any) {
    if (e?.code !== 'ENOENT') log.warn({ err: e?.message }, 'cache nomor terdaftar tidak terbaca — mulai dari kosong');
  }
}

function saveNumberCache() {
  if (!numberCache.needsSave) return;
  try {
    const tmp = `${NUMBER_CACHE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(numberCache.dump()));
    fs.renameSync(tmp, NUMBER_CACHE_FILE); // tulis-lalu-ganti: file tidak setengah jadi bila proses mati
  } catch (e: any) {
    log.warn({ err: e?.message }, 'gagal menyimpan cache nomor terdaftar (tidak mengganggu pengiriman)');
  }
}

// Disimpan 5 detik setelah perubahan terakhir, supaya beberapa nomor baru cukup 1 kali tulis
function scheduleNumberSave() {
  if (numberSaveTimer) return;
  numberSaveTimer = setTimeout(() => {
    numberSaveTimer = null;
    saveNumberCache();
  }, 5_000);
}

// Kunci penerima untuk batas per penerima: nomor ter-normalisasi (DM) atau JID (grup)
const targetKey = (type: 'group' | 'user', target: string) =>
  type === 'group' ? target : normalizeNumber(target);

// Jawaban "terlalu banyak permintaan" dari WhatsApp → langsung jeda (tidak menunggu 3x gagal).
// Bentuk errornya bisa beragam, jadi dicek dari beberapa tempat.
function isRateLimit(e: any): boolean {
  return (
    e?.output?.statusCode === 429 ||
    Number(e?.data) === 429 ||
    /rate-?overlimit|too many requests|\b429\b/i.test(String(e?.message ?? ''))
  );
}

// Kartu pratinjau link (judul + keterangan pesanan di atas pesan). Matikan lewat env LINK_PREVIEW=off.
// Bila Baileys menolak pratinjau, pesan dikirim ulang tanpa pratinjau dan fitur dimatikan sampai
// gateway di-restart — notifikasi tidak boleh gagal hanya karena kartunya.
let pratinjauRusak = process.env.LINK_PREVIEW === 'off';

// ───────────────────────── Saklar, pemulihan, status terkirim (bersama) ─────────────────────────

// Saklar dari Pengaturan app (tabel wa_settings, baris id=1).
// Gagal baca / tabel belum ada → dianggap NONAKTIF (aman: tidak mengirim apa pun).
async function isEnabled(): Promise<boolean> {
  const cached = enabledCache.get('enabled');
  if (cached !== undefined) return cached;
  const { data, error } = await db.from('wa_settings').select('enabled').eq('id', 1).maybeSingle();
  if (error) {
    log.warn({ err: error.message }, 'gagal membaca wa_settings');
    return false; // gagal baca TIDAK di-cache: dicoba lagi di putaran berikutnya
  }
  const on = data?.enabled === true;
  enabledCache.set('enabled', on);
  return on;
}

// Pesan yang SUDAH terkirim ke WhatsApp tetapi status 'sent' gagal ditulis ke database.
// Tanpa catatan ini, pesan itu akan dipulihkan ke 'pending' lalu terkirim dua kali.
const sentButUnsaved = new Set<string>();
// Pesan yang sedang diproses sebuah sesi. Pemulihan TIDAK boleh menyentuhnya, karena dengan banyak
// sesi, pesan berstatus 'sending' belum tentu nyangkut — bisa jadi sesi lain sedang mengirimnya.
const inflight = new Set<string>();

async function markSent(id: string, waMessageId: string | null | undefined, senderId: string): Promise<boolean> {
  return retry(async () => {
    const dasar: Record<string, unknown> = { status: 'sent', sent_at: new Date().toISOString(), last_error: null };
    // wa_message_id (migration 021) dipakai mencocokkan balasan swipe ke pesan proofing; sender_id
    // (migration 023) mencatat nomor pengirim. Kolom yang belum ada tidak boleh menggagalkan status
    // 'sent' (kalau tidak, pesan terkirim dua kali), jadi dilepas satu per satu. Nomor utama tidak
    // menulis sender_id (kosong = utama), sehingga perilaku lama tidak berubah.
    const lengkap: Record<string, unknown> = { ...dasar };
    if (waMessageId) lengkap.wa_message_id = waMessageId;
    if (senderId !== DEFAULT_ID) lengkap.sender_id = senderId;
    let { error } = await db.from('wa_outbox').update(lengkap).eq('id', id);
    if (error && 'sender_id' in lengkap && /sender_id/i.test(error.message)) {
      delete lengkap.sender_id;
      ({ error } = await db.from('wa_outbox').update(lengkap).eq('id', id));
    }
    if (error && 'wa_message_id' in lengkap && /wa_message_id/i.test(error.message)) {
      ({ error } = await db.from('wa_outbox').update(dasar).eq('id', id));
    }
    if (error) throw new Error(error.message);
  });
}

let lastRecoveryAt = 0;
// Pesan yang nyangkut di 'sending' > 2 menit (mis. gateway restart) dikembalikan ke pending.
async function recoverStuck() {
  if (Date.now() - lastRecoveryAt < RECOVERY_EVERY_MS) return;
  lastRecoveryAt = Date.now();
  const { data } = await db
    .from('wa_outbox')
    .select('id')
    .eq('status', 'sending')
    .lt('created_at', new Date(Date.now() - 2 * 60_000).toISOString())
    .is('sent_at', null)
    .limit(200);
  const ids = (data ?? []).map((r: any) => r.id as string).filter((id) => !inflight.has(id));
  if (ids.length) await db.from('wa_outbox').update({ status: 'pending' }).in('id', ids).eq('status', 'sending');
}

// ───────────────────────── Sesi per nomor pengirim ─────────────────────────

const sessions = new Map<string, Session>();

// Jenis pesan yang sedang dipegang nomor tambahan LAIN (selain `kecuali`) — nomor utama mengirim sisanya.
// Nomor yang belum terhubung (menunggu scan QR / logout / dibatasi) tidak memegang tugas.
function tugasNomorLain(kecuali: string): string[] {
  const hasil = new Set<string>();
  for (const s of sessions.values()) {
    if (s.id === DEFAULT_ID || s.id === kecuali || !s.memegangTugas) continue;
    for (const t of s.tasks) hasil.add(t);
  }
  return [...hasil];
}

class Session {
  readonly id: string;
  label: string;
  tasks: string[] = [];
  readonly authDir: string;
  readonly log: pino.Logger;

  sock: WASocket | null = null;
  connState: ConnState = 'starting';
  lastQr: string | null = null;
  closeReason: string | null = null; // info tambahan untuk /status (tidak mengubah kontrak connState)
  groupsCache: { at: number; data: unknown } | null = null;

  readonly limiter = new SendLimiter({
    perHour: MAX_PER_HOUR,
    perDay: MAX_PER_DAY,
    perUserPerHour: MAX_PER_USER_PER_HOUR,
    perGroupPerHour: MAX_PER_GROUP_PER_HOUR,
  });
  readonly breaker = new CircuitBreaker({
    threshold: BREAKER_THRESHOLD,
    baseMs: BREAKER_PAUSE_MIN * 60_000,
    maxMs: BREAKER_MAX_PAUSE_MIN * 60_000,
  });
  private readonly groupCache = new TtlCache<GroupMetadata>(GROUP_CACHE_TTL_MIN * 60_000);
  // Pesan yang baru terkirim (1 jam, maks. 500) — dipakai Baileys lewat getMessage saat penerima minta kirim ulang
  private readonly sentCache = new TtlCache<proto.IMessage>(60 * 60_000, Date.now, 500);

  private failCount = 0;
  private starting = false;
  private stopped = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private limiterReady = false;
  private working = false;
  private capWarned: string | null = null;

  constructor(id: string, label: string) {
    this.id = id;
    this.label = label;
    this.authDir = authDirFor(id);
    this.log = log.child({ nomor: id });
  }

  get isDefault() { return this.id === DEFAULT_ID; }
  get memegangTugas() { return memegangTugas(this.connState, this.closeReason); }

  // 3s, 6s, 12s, 24s, 48s, lalu mentok 60s
  private backoffMs() { return Math.min(60_000, 3_000 * 2 ** Math.min(this.failCount, 5)); }

  private scheduleReconnect(ms: number) {
    if (this.stopped || shuttingDown || this.reconnectTimer) return;
    this.log.info({ inSeconds: Math.round(ms / 1000) }, 'menjadwalkan koneksi ulang');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.start().catch((e) => this.log.error(e));
    }, ms);
  }

  async start() {
    if (this.starting || this.stopped || shuttingDown) return;
    this.starting = true;
    try {
      // Pastikan socket lama benar-benar mati sebelum membuat yang baru
      if (this.sock) {
        try { this.sock.end(undefined); } catch { /* sudah mati */ }
        this.sock = null;
      }

      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
      const { version } = await fetchLatestBaileysVersion();

      const s = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'warn' }),
        browser: ['LCO Gateway', 'Chrome', '1.0'],
        markOnlineOnConnect: false,
        syncFullHistory: false,
        // Tanpa ini, tiap kirim ke grup Baileys menanyakan data grup ke server WhatsApp.
        cachedGroupMetadata: (jid) => this.cachedGroupMetadata(jid),
        // Penerima minta kirim ulang (gagal dekripsi) → berikan isi pesan yang tadi kita kirim
        getMessage: async (key) => (key.id ? this.sentCache.get(key.id) : undefined),
      });
      this.sock = s;

      s.ev.on('creds.update', saveCreds);

      // Pesan masuk. "notify" = pesan baru; "append" = pesan yang tertahan saat gateway sempat putus.
      // Pesan lebih tua dari 10 menit diabaikan supaya sinkron riwayat tidak memicu balasan lama.
      s.ev.on('messages.upsert', ({ messages, type }) => {
        for (const m of messages) {
          const k = m?.key;
          if (!k || k.fromMe) continue;
          const umurDetik = Date.now() / 1000 - Number(m.messageTimestamp ?? 0);
          const teks = teksPesan(m.message).replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '');
          // Diagnosa: isi pesan TIDAK dicatat, hanya jenis & apakah cocok format balasan proofing
          this.log.info(
            { tipe: type, jenisId: String(k.remoteJid ?? '').split('@')[1] ?? null, adaAlt: !!k.remoteJidAlt, cocok: mirip(teks), umurDetik: Math.round(umurDetik) },
            'pesan masuk',
          );
          if (type !== 'notify' && type !== 'append') continue;
          if (umurDetik > 600) continue;
          void this.terusPesanMasuk(m).catch((e) => this.log.error(e));
        }
      });

      // Anggota/pengaturan grup berubah → buang cache-nya (diambil ulang saat kirim berikutnya)
      s.ev.on('groups.update', (updates) => {
        for (const u of updates) if (u.id) this.groupCache.delete(u.id);
      });
      s.ev.on('group-participants.update', (e) => this.groupCache.delete(e.id));

      s.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (s !== this.sock || this.stopped) return; // event dari socket lama / sesi yang sudah dihentikan → abaikan

        if (qr) {
          this.lastQr = qr;
          this.connState = 'qr';
          this.log.info('QR baru tersedia — scan lewat Pengaturan → Notifikasi di app');
        }

        if (connection === 'open') {
          this.connState = 'open';
          this.groupCache.clear(); // perubahan grup selama terputus tidak terpantau → mulai dari awal
          this.lastQr = null;
          this.closeReason = null;
          this.failCount = 0;
          this.log.info('WhatsApp terhubung');
        }

        if (connection === 'close') {
          this.connState = 'closed';
          const code = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
          this.log.warn({ code }, 'Koneksi WhatsApp terputus');

          if (code === DisconnectReason.loggedOut) {
            // Logout dari HP → session tidak berlaku lagi, hapus supaya QR baru muncul
            this.closeReason = 'logged_out';
            this.failCount = 0;
            try { fs.rmSync(this.authDir, { recursive: true, force: true }); } catch (e) { this.log.error(e); }
            this.scheduleReconnect(3_000);
          } else if (code === DisconnectReason.connectionReplaced) {
            // Sesi yang sama dipakai di tempat lain (mis. 2 container jalan bersamaan saat redeploy).
            // Reconnect cepat = saling tendang tanpa henti → tunggu lama.
            this.closeReason = 'replaced';
            this.log.error('Sesi dipakai di tempat lain (connectionReplaced). Pastikan hanya ada 1 gateway yang jalan.');
            this.scheduleReconnect(120_000);
          } else if (code === DisconnectReason.forbidden) {
            // Nomor dibatasi/diblokir WhatsApp. Mencoba terus hanya memperburuk keadaan.
            this.closeReason = 'forbidden';
            this.log.error('WhatsApp menolak akses (403). Reconnect otomatis DIHENTIKAN — cek nomor, lalu restart gateway.');
          } else if (code === DisconnectReason.restartRequired) {
            // Normal setelah scan QR — langsung sambung lagi
            this.closeReason = null;
            this.scheduleReconnect(1_000);
          } else {
            this.closeReason = 'disconnected';
            this.failCount++;
            this.scheduleReconnect(this.backoffMs());
          }
        }
      });
    } catch (e) {
      // Mis. gagal baca auth dir / gagal ambil versi → dulu berhenti selamanya, sekarang dicoba lagi
      this.log.error(e, 'startSocket gagal');
      this.connState = 'closed';
      this.failCount++;
      this.scheduleReconnect(this.backoffMs());
    } finally {
      this.starting = false;
    }
  }

  /** Hentikan sesi. hapusSesi=true: putuskan perangkat dari WhatsApp lalu hapus folder sesi (nomor dihapus). */
  async stop(hapusSesi: boolean) {
    this.stopped = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    const s = this.sock;
    if (hapusSesi && s && this.connState === 'open') {
      try { await Promise.race([s.logout(), sleep(5_000)]); } catch { /* sudah putus */ }
    }
    try { s?.end(undefined); } catch { /* abaikan */ }
    this.sock = null;
    this.connState = 'closed';
    if (hapusSesi) {
      try { fs.rmSync(this.authDir, { recursive: true, force: true }); } catch (e) { this.log.error(e); }
    }
  }

  // Pesan masuk dikenali sebagai balasan proofing → diteruskan ke aplikasi. Balasan datang ke
  // nomor yang mengirim proofing, jadi SEMUA sesi meneruskannya (aplikasi yang menilai kecocokannya).
  private async terusPesanMasuk(m: any) {
    const key = m?.key;
    if (!key || key.fromMe || !m.message) return;
    const jid: string = key.remoteJid ?? '';
    if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') return; // hanya chat pribadi

    const teks = teksPesan(m.message).replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '');
    if (!mirip(teks)) return;

    // Mulai dari sini pesan dikenali sebagai balasan proofing: setiap kegagalan WAJIB terlihat di log
    const ctx = m.message?.extendedTextMessage?.contextInfo ?? m.message?.imageMessage?.contextInfo;
    this.log.info({ jid, altJid: key.remoteJidAlt ?? null, teks: teks.slice(0, 60), swipe: !!ctx?.stanzaId }, 'balasan proofing masuk');
    if (!APP_URL) {
      this.log.error('APP_URL belum diisi di environment wa-gateway → balasan TIDAK diteruskan ke aplikasi');
      return;
    }

    const pengirim = await nomorPengirim(key, this.sock);
    if (!pengirim) this.log.warn({ jid }, 'nomor pengirim tidak bisa dipetakan dari ID WhatsApp (LID); hanya balasan swipe yang bisa dicocokkan');
    const body = {
      from: pengirim,
      chatJid: jid,
      messageId: key.id ?? null,
      quotedId: ctx?.stanzaId ?? null,
      text: teks,
    };
    let hasil: any = null;
    const ok = await retry(async () => {
      const r = await fetch(`${APP_URL}/api/wa/proofing-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) throw new Error(`aplikasi menjawab ${r.status}`);
      hasil = await r.json();
    });
    if (ok) this.log.info({ dari: body.from, hasil: hasil?.hasil, handled: hasil?.handled }, 'balasan proofing diteruskan');
    else this.log.error('gagal meneruskan balasan proofing ke aplikasi (cek APP_URL & token gateway)');
  }

  async resolveUserJid(target: string): Promise<string> {
    if (!this.sock || this.connState !== 'open') throw new NotConnectedError();
    const num = normalizeNumber(target);
    const cached = numberCache.get(num);
    if (cached) return cached;

    const res = await this.sock.onWhatsApp(`${num}@s.whatsapp.net`);
    const found = res?.[0];
    if (!found?.exists) throw new PermanentError(`Nomor ${target} tidak terdaftar di WhatsApp`);
    numberCache.set(num, found.jid);
    scheduleNumberSave();
    return found.jid;
  }

  // Metadata grup (dipakai Baileys saat kirim ke grup): ambil dari cache, bila kosong ambil sekali lalu simpan.
  private async cachedGroupMetadata(jid: string): Promise<GroupMetadata | undefined> {
    const hit = this.groupCache.get(jid);
    if (hit) return hit;
    if (!this.sock || this.connState !== 'open') return undefined;
    try {
      const data = await this.sock.groupMetadata(jid);
      this.groupCache.set(jid, data);
      return data;
    } catch {
      return undefined; // Baileys mengambil sendiri
    }
  }

  async fetchGroups() {
    if (!this.sock || this.connState !== 'open') throw new NotConnectedError();
    if (this.groupsCache && Date.now() - this.groupsCache.at < GROUPS_TTL) return this.groupsCache.data;
    const groups = await this.sock.groupFetchAllParticipating();
    for (const g of Object.values(groups)) this.groupCache.set(g.id, g); // sekalian mengisi cache metadata grup
    const data = Object.values(groups).map((g) => ({ id: g.id, nama: g.subject, anggota: g.participants.length }));
    this.groupsCache = { at: Date.now(), data };
    return data;
  }

  // Riwayat kirim 24 jam terakhir dimuat dari database agar batas kirim tidak "reset" saat gateway restart.
  // Selama belum berhasil dimuat, pengiriman ditahan (aman).
  async loadLimiter(): Promise<boolean> {
    try {
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const ambil = (kolom: string) =>
        db.from('wa_outbox').select(kolom).eq('status', 'sent').gte('sent_at', since)
          .order('sent_at', { ascending: true }).limit(5000);
      let { data, error } = await ambil('target_type, target, sent_at, sender_id');
      // Kolom sender_id belum ada (migration 023 belum jalan) → semua riwayat dianggap milik nomor utama
      if (error && /sender_id/i.test(error.message)) ({ data, error } = await ambil('target_type, target, sent_at'));
      if (error) throw error;
      this.limiter.seed(
        ((data ?? []) as any[])
          .filter((r) => (r.sender_id ?? DEFAULT_ID) === this.id)
          .map((r) => ({ t: Date.parse(r.sent_at), key: targetKey(r.target_type, String(r.target)) }))
          .filter((e) => Number.isFinite(e.t)),
      );
      this.limiterReady = true;
      this.log.info({ jam: this.limiter.lastHour(), hari: this.limiter.lastDay() }, 'riwayat kirim 24 jam terakhir dimuat dari database');
      return true;
    } catch (e: any) {
      this.log.warn({ err: e?.message }, 'gagal memuat riwayat kirim — pengiriman ditahan sampai berhasil');
      return false;
    }
  }

  ensureLimiter() { return this.limiterReady ? Promise.resolve(true) : this.loadLimiter(); }

  async sendOne(type: 'group' | 'user', target: string, message: string, mentions: string[] = []): Promise<string | null> {
    if (!this.sock || this.connState !== 'open') throw new NotConnectedError();
    const sock = this.sock;
    const jid = type === 'group' ? target : await this.resolveUserJid(target);

    // Tampil "sedang mengetik…" sebentar, seperti manusia
    try {
      await sock.sendPresenceUpdate('composing', jid);
      await sleep(Math.min(4000, 800 + message.length * 20));
      await sock.sendPresenceUpdate('paused', jid);
    } catch { /* presence gagal tidak boleh membatalkan pengiriman */ }

    const mentionJids = mentions.map((m) => `${normalizeNumber(m)}@s.whatsapp.net`);
    const isi: any = mentionJids.length ? { text: message, mentions: mentionJids } : { text: message };
    const pratinjau = pratinjauRusak ? null : buatLinkPreview(message);
    let sent;
    if (pratinjau) {
      const denganKartu = {
        ...isi,
        linkPreview: {
          'canonical-url': pratinjau.url,
          'matched-text': pratinjau.url,
          title: pratinjau.title,
          description: pratinjau.description,
        },
      };
      try {
        sent = await sock.sendMessage(jid, denganKartu);
      } catch (e: any) {
        if (e instanceof NotConnectedError || isRateLimit(e)) throw e;
        sent = await sock.sendMessage(jid, isi); // gagal lagi → error asli yang dilempar ke worker
        pratinjauRusak = true;
        this.log.warn({ err: e?.message }, 'kartu pratinjau link ditolak — dimatikan sampai gateway restart, pesan dikirim tanpa kartu');
      }
    } else {
      sent = await sock.sendMessage(jid, isi);
    }
    this.limiter.record(targetKey(type, target));
    if (sent?.key?.id && sent.message) this.sentCache.set(sent.key.id, sent.message);
    return sent?.key?.id ?? null;
  }

  // Filter antrian menurut pembagian tugas. null = nomor ini tidak punya tugas (tidak perlu query).
  private rutekan(q: any): any | null {
    const r = rancangRute(this.isDefault, this.tasks, this.isDefault ? tugasNomorLain(this.id) : []);
    if (r.mode === 'semua') return q;
    if (r.mode === 'tidak') return null;
    if (r.mode === 'hanya') return q.in('event_type', r.events);
    // event_type kosong juga milik nomor utama (NOT IN saja akan membuangnya)
    return q.or(`event_type.is.null,event_type.not.in.(${r.events.join(',')})`);
  }

  async processQueue() {
    if (this.working || shuttingDown || this.stopped || this.connState !== 'open') return;
    this.working = true;
    try {
      if (this.breaker.isPaused()) return; // circuit breaker sedang menjeda antrian
      if (!(await isEnabled())) return; // saklar mati → jangan kirim apa pun
      if (!(await this.ensureLimiter())) return; // riwayat kirim belum termuat → tahan

      const dasar = db
        .from('wa_outbox')
        .select('*')
        .eq('status', 'pending')
        .lte('scheduled_at', new Date().toISOString());
      const dirutekan = this.rutekan(dasar);
      if (!dirutekan) return; // nomor tanpa tugas
      const { data: rows, error } = await dirutekan.order('scheduled_at', { ascending: true }).limit(10);

      if (error) throw error;
      if (!rows || rows.length === 0) return; // antrian kosong → selesai (kasus paling sering)

      for (const row of rows as any[]) {
        // Saklar dimatikan di tengah batch → berhenti (dibaca dari cache 15 detik, murah)
        if (!(await isEnabled())) break;

        // Sudah terkirim sebelumnya tapi statusnya belum sempat tertulis → tulis saja, JANGAN kirim lagi
        if (sentButUnsaved.has(row.id)) {
          if (await markSent(row.id, undefined, this.id)) sentButUnsaved.delete(row.id);
          continue;
        }

        // Terputus / dihentikan di tengah batch → hentikan, jangan "membakar" percobaan pesan berikutnya
        if (shuttingDown || this.stopped || this.connState !== 'open') break;

        // Breaker bisa aktif di tengah batch (mis. dipicu oleh pesan sebelumnya)
        if (this.breaker.isPaused()) break;

        // Pengaman batas kirim. Batas per jam / per hari: hentikan batch, sisanya menunggu di antrian.
        const key = targetKey(row.target_type, row.target);
        const hit = this.limiter.check(row.target_type, key);
        if (hit && hit.scope !== 'penerima') {
          if (this.capWarned !== hit.scope) {
            this.log.warn({ batas: hit.scope, jam: this.limiter.lastHour(), hari: this.limiter.lastDay() }, 'Batas kirim tercapai — sisa pesan ditahan. Cek apakah ada yang membanjiri antrian.');
            this.capWarned = hit.scope;
          }
          break;
        }
        this.capWarned = null;

        // Batas per penerima: tahan pesan ini saja sampai jatah penerima itu kembali, lanjutkan ke penerima lain.
        if (hit) {
          const bebasLagi = new Date(hit.freesAt + 5_000 + Math.random() * 55_000).toISOString();
          await db.from('wa_outbox').update({ scheduled_at: bebasLagi }).eq('id', row.id).eq('status', 'pending');
          this.log.warn({ id: row.id, to: row.target, bebasLagi }, 'Batas kirim per penerima tercapai — pesan ditahan');
          continue;
        }

        // "Klaim" baris: hanya lanjut kalau memang masih pending (aman kalau ada 2 worker)
        const { data: claimed } = await db
          .from('wa_outbox')
          .update({ status: 'sending', attempts: row.attempts + 1 })
          .eq('id', row.id)
          .eq('status', 'pending')
          .select('id')
          .maybeSingle();
        if (!claimed) continue;

        inflight.add(row.id);
        try {
          const waId = await this.sendOne(row.target_type, row.target, row.message, row.mentions ?? []);
          this.breaker.success();
          if (!(await markSent(row.id, waId, this.id))) {
            sentButUnsaved.add(row.id);
            this.log.error({ id: row.id, to: row.target }, 'pesan TERKIRIM tetapi status gagal ditulis ke database — akan ditulis ulang, tidak dikirim lagi');
          }
          this.log.info({ id: row.id, to: row.target }, 'terkirim');
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
          this.log.warn({ id: row.id, err: e?.message, attempts }, giveUp ? 'GAGAL permanen' : 'gagal, akan dicoba lagi');

          // Circuit breaker: hanya kegagalan "sungguhan" yang dihitung (bukan nomor tidak terdaftar,
          // bukan karena koneksi terputus di tengah kirim).
          if (!(e instanceof PermanentError) && this.connState === 'open') {
            const rate = isRateLimit(e);
            if (this.breaker.failure({ immediate: rate, reason: rate ? 'rate limit dari WhatsApp' : 'gagal beruntun' })) {
              this.log.error(
                { sampai: new Date(this.breaker.pausedUntil() ?? 0).toISOString(), alasan: this.breaker.reason, kali: this.breaker.tripCount },
                'CIRCUIT BREAKER AKTIF — seluruh antrian nomor ini dijeda. WhatsApp mungkin mulai membatasi nomor; cek nomor & status.',
              );
              break;
            }
          }
        } finally {
          inflight.delete(row.id);
        }

        await sleep(randDelay());
      }
    } catch (e) {
      this.log.error(e, 'processQueue error');
    } finally {
      this.working = false;
    }
  }

  /** Ringkasan status (dipakai /status dan /senders). */
  async ringkasan() {
    // Perkiraan kapan jatah per jam / per hari terbuka lagi (null = belum penuh)
    const free = this.limiter.nextFree();
    return {
      id: this.id,
      label: this.label,
      is_default: this.isDefault,
      tasks: this.tasks,
      wa: this.connState,
      reason: this.closeReason,
      enabled: await isEnabled(),
      sent_last_hour: this.limiter.lastHour(),
      sent_last_day: this.limiter.lastDay(),
      hour_frees_at: free.hour ? new Date(free.hour).toISOString() : null,
      day_frees_at: free.day ? new Date(free.day).toISOString() : null,
      // Terisi bila circuit breaker sedang menjeda antrian
      paused_until: this.breaker.pausedUntil() ? new Date(this.breaker.pausedUntil() as number).toISOString() : null,
      paused_reason: this.breaker.pausedUntil() ? this.breaker.reason : null,
      limits: {
        per_hour: MAX_PER_HOUR,
        per_day: MAX_PER_DAY,
        per_user_per_hour: MAX_PER_USER_PER_HOUR,
        per_group_per_hour: MAX_PER_GROUP_PER_HOUR,
      },
    };
  }
}

let shuttingDown = false;
// groupFetchAllParticipating cukup "berat" untuk WhatsApp → jangan dipanggil berulang-ulang
const GROUPS_TTL = 60_000;

function mulaiSesi(id: string, label: string, tasks: string[]): Session {
  const s = new Session(id, label);
  s.tasks = tasks;
  sessions.set(id, s);
  log.info({ nomor: id, label }, 'sesi nomor pengirim dimulai');
  s.start().catch((e) => log.error(e));
  void s.loadLimiter(); // gagal pun tidak masalah: dicoba lagi otomatis oleh worker sebelum mengirim
  return s;
}

// Samakan sesi yang berjalan dengan tabel wa_senders. Nomor utama selalu ada.
// Gagal membaca tabel TIDAK boleh menghentikan / menghapus sesi apa pun (mis. gangguan sesaat).
let syncing = false;
async function syncSenders() {
  if (syncing || shuttingDown) return;
  syncing = true;
  try {
    const { data, error } = await db.from('wa_senders').select('id, label, enabled, tasks').order('created_at', { ascending: true });
    if (error) {
      if (!sessions.has(DEFAULT_ID)) mulaiSesi(DEFAULT_ID, 'Nomor Utama', []);
      if (!/wa_senders|does not exist|schema cache/i.test(error.message)) {
        log.warn({ err: error.message }, 'gagal membaca wa_senders — sesi yang ada dibiarkan');
      }
      return;
    }

    const rows = (data ?? []).filter((r: any) => typeof r.id === 'string' && SENDER_ID_RE.test(r.id));
    const ada = new Set<string>(rows.map((r: any) => r.id as string));

    // Nomor utama selalu berjalan, ada barisnya atau tidak
    const utama: any = rows.find((r: any) => r.id === DEFAULT_ID);
    const sUtama = sessions.get(DEFAULT_ID) ?? mulaiSesi(DEFAULT_ID, utama?.label || 'Nomor Utama', []);
    if (utama?.label) sUtama.label = utama.label;

    for (const r of rows as any[]) {
      if (r.id === DEFAULT_ID) continue;
      const tasks: string[] = Array.isArray(r.tasks) ? r.tasks.map(String) : [];
      const label = String(r.label || r.id);
      const s = sessions.get(r.id);
      if (r.enabled === false) {
        // Dimatikan: sesi dihentikan, folder sesi dipertahankan (bisa dihidupkan lagi tanpa scan ulang)
        if (s) { sessions.delete(r.id); await s.stop(false); log.info({ nomor: r.id }, 'sesi dihentikan (dinonaktifkan)'); }
        continue;
      }
      if (!s) mulaiSesi(r.id, label, tasks);
      else { s.label = label; s.tasks = tasks; }
    }

    // Baris dihapus dari tabel → putuskan perangkat & hapus folder sesinya
    for (const [id, s] of [...sessions]) {
      if (id === DEFAULT_ID || ada.has(id)) continue;
      sessions.delete(id);
      await s.stop(true);
      log.info({ nomor: id }, 'sesi dihapus (nomor dihapus dari Pengaturan)');
    }
  } catch (e) {
    log.error(e, 'syncSenders error');
  } finally {
    syncing = false;
  }
}

async function tickAntrian() {
  if (shuttingDown) return;
  for (const s of sessions.values()) void s.processQueue();
  // Pemulihan tidak tergantung nomor mana pun; cukup dijalankan jika saklar aktif
  if (sessions.size && (await isEnabled())) await recoverStuck().catch((e) => log.warn({ err: e?.message }, 'recoverStuck gagal'));
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

// Pilih sesi dari ?sender= / body.sender (kosong = nomor utama)
const pilihSesi = (id: unknown): Session | null => {
  const k = typeof id === 'string' && id ? id : DEFAULT_ID;
  return sessions.get(k) ?? null;
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');

    // health check (tanpa token) untuk Coolify. `wa` = status nomor utama (kontrak lama).
    if (url.pathname === '/health') {
      return json(res, 200, { ok: true, wa: sessions.get(DEFAULT_ID)?.connState ?? 'starting' });
    }

    // Token hanya lewat header (bukan query string, supaya tidak tercatat di riwayat browser / log proxy)
    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
    if (!safeEqual(bearer, TOKEN)) return json(res, 401, { error: 'Unauthorized' });

    // Semua nomor pengirim sekaligus (status koneksi + pemakaian)
    if (url.pathname === '/senders') {
      return json(res, 200, await Promise.all([...sessions.values()].map((s) => s.ringkasan())));
    }

    if (url.pathname === '/status') {
      const s = pilihSesi(url.searchParams.get('sender'));
      if (!s) return json(res, 404, { error: 'Nomor pengirim tidak dikenal' });
      return json(res, 200, await s.ringkasan());
    }

    // QR dalam bentuk JSON (data URL gambar) → dipakai halaman Pengaturan di app
    if (url.pathname === '/qr.json') {
      const s = pilihSesi(url.searchParams.get('sender'));
      if (!s) return json(res, 404, { error: 'Nomor pengirim tidak dikenal' });
      const qr = s.connState !== 'open' && s.lastQr ? await QRCode.toDataURL(s.lastQr, { width: 320, margin: 1 }) : null;
      return json(res, 200, { wa: s.connState, qr });
    }

    if (url.pathname === '/groups') {
      const s = pilihSesi(url.searchParams.get('sender'));
      if (!s) return json(res, 404, { error: 'Nomor pengirim tidak dikenal' });
      try {
        return json(res, 200, await s.fetchGroups());
      } catch (e: any) {
        if (e instanceof NotConnectedError) return json(res, 503, { error: 'WhatsApp belum terhubung' });
        throw e;
      }
    }

    if (url.pathname === '/send' && req.method === 'POST') {
      const b = await readBody(req);
      if (typeof b.to !== 'string' || typeof b.message !== 'string' || !b.to || !b.message) {
        return json(res, 400, { error: 'to & message wajib' });
      }
      const s = pilihSesi(b.sender);
      if (!s) return json(res, 404, { error: 'Nomor pengirim tidak dikenal' });
      if (s.breaker.isPaused()) {
        return json(res, 503, { error: 'Pengiriman sedang dijeda (circuit breaker)', paused_until: new Date(s.breaker.pausedUntil() ?? 0).toISOString() });
      }
      if (!(await s.ensureLimiter())) {
        return json(res, 503, { error: 'Riwayat kirim belum termuat dari database, coba lagi sebentar lagi' });
      }
      const type = b.type === 'group' ? 'group' : 'user';
      const hit = s.limiter.check(type, targetKey(type, b.to));
      if (hit) {
        return json(res, 429, { error: `Batas kirim tercapai (${hit.scope})`, retry_after_sec: Math.max(1, Math.ceil((hit.freesAt - Date.now()) / 1000)) });
      }
      try {
        await s.sendOne(type, b.to, b.message, Array.isArray(b.mentions) ? b.mentions : []);
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
if (APP_URL) log.info({ appUrl: APP_URL }, 'balasan proofing akan diteruskan ke aplikasi');
else log.warn('APP_URL belum diisi → balasan proofing (ACC / Revisi:) TIDAK diteruskan ke aplikasi');

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
  if (numberSaveTimer) clearTimeout(numberSaveTimer);
  saveNumberCache(); // simpan cache nomor sebelum proses berhenti
  for (const s of sessions.values()) void s.stop(false);
  server.close();
  setTimeout(() => process.exit(0), 1500).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

loadNumberCache();
void syncSenders(); // memulai nomor utama + nomor tambahan dari tabel wa_senders
setInterval(() => void syncSenders(), SYNC_EVERY_MS);
setInterval(() => void tickAntrian(), 5000);
