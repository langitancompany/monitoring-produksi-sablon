// wa-gateway/src/safety.ts
//
// Pengaman anti-blokir yang MURNI logika (tanpa WhatsApp / database), supaya mudah diuji.
// Dipakai oleh index.ts:
//   • SendLimiter     — batas kirim per jam / per hari / per penerima, bisa diisi ulang dari DB
//                       setelah restart (batas tidak lagi "reset" tiap gateway hidup ulang)
//   • CircuitBreaker  — jeda seluruh antrian saat pengiriman gagal beruntun (tanda WhatsApp
//                       mulai membatasi nomor), bukan terus mengetuk
//   • TtlCache        — cache sederhana dengan masa berlaku (metadata grup, saklar aktif, pesan terkirim)
//   • NumberCache     — cache "nomor terdaftar di WhatsApp" yang bisa disimpan ke file (tahan restart)
//   • retry           — ulang operasi singkat (mis. menulis status 'sent' ke database)

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

type Clock = () => number;

// ───────────────────────── SendLimiter ─────────────────────────

export interface LimiterConfig {
  perHour: number;
  perDay: number;
  perUserPerHour: number;
  perGroupPerHour: number;
}

export type LimitScope = 'jam' | 'hari' | 'penerima';

export interface LimitHit {
  scope: LimitScope;
  /** Kapan jatah kembali tersedia (epoch ms). */
  freesAt: number;
}

interface SentEntry {
  t: number;
  key: string;
}

export class SendLimiter {
  private entries: SentEntry[] = [];

  constructor(
    private cfg: LimiterConfig,
    private now: Clock = Date.now,
  ) {}

  /** Isi dari riwayat terkirim di database (saat gateway baru hidup). */
  seed(entries: SentEntry[]) {
    this.entries = [...entries].sort((a, b) => a.t - b.t);
  }

  /** Catat 1 pesan terkirim ke penerima `key`. */
  record(key: string) {
    this.entries.push({ t: this.now(), key });
  }

  private prune() {
    const cutoff = this.now() - DAY;
    while (this.entries.length && this.entries[0].t < cutoff) this.entries.shift();
  }

  private within(ms: number, key?: string): SentEntry[] {
    this.prune();
    const cutoff = this.now() - ms;
    return this.entries.filter((e) => e.t >= cutoff && (key === undefined || e.key === key));
  }

  lastHour() {
    return this.within(HOUR).length;
  }

  lastDay() {
    return this.within(DAY).length;
  }

  /**
   * Kapan jatah terbuka lagi (epoch ms) untuk batas per jam / per hari. null = belum penuh.
   * Rumusnya sama dengan check(): saat pesan terlama yang masih menghitung keluar dari jendela.
   */
  nextFree(): { hour: number | null; day: number | null } {
    const hour = this.within(HOUR);
    const day = this.within(DAY);
    return {
      hour: hour.length >= this.cfg.perHour ? hour[hour.length - this.cfg.perHour].t + HOUR : null,
      day: day.length >= this.cfg.perDay ? day[day.length - this.cfg.perDay].t + DAY : null,
    };
  }

  /**
   * Boleh kirim ke penerima ini sekarang? null = boleh.
   * Urutan cek: batas per jam (semua) → batas per hari (semua) → batas per penerima.
   */
  check(type: 'group' | 'user', key: string): LimitHit | null {
    const hour = this.within(HOUR);
    if (hour.length >= this.cfg.perHour) {
      return { scope: 'jam', freesAt: hour[hour.length - this.cfg.perHour].t + HOUR };
    }

    const day = this.within(DAY);
    if (day.length >= this.cfg.perDay) {
      return { scope: 'hari', freesAt: day[day.length - this.cfg.perDay].t + DAY };
    }

    const cap = type === 'group' ? this.cfg.perGroupPerHour : this.cfg.perUserPerHour;
    const mine = hour.filter((e) => e.key === key);
    if (mine.length >= cap) {
      return { scope: 'penerima', freesAt: mine[mine.length - cap].t + HOUR };
    }

    return null;
  }
}

// ───────────────────────── CircuitBreaker ─────────────────────────

export interface BreakerConfig {
  /** Jumlah gagal beruntun yang memicu jeda. */
  threshold: number;
  /** Lama jeda pertama (ms). Jeda berikutnya digandakan sampai maxMs. */
  baseMs: number;
  maxMs: number;
}

export class CircuitBreaker {
  private failures = 0;
  private trips = 0;
  private until = 0;
  private halfOpen = false;
  private lastReason: string | null = null;

  constructor(
    private cfg: BreakerConfig,
    private now: Clock = Date.now,
  ) {}

  /** true = antrian sedang dijeda. Saat jeda berakhir masuk mode "hati-hati" (1 gagal = jeda lagi). */
  isPaused(): boolean {
    if (this.until === 0) return false;
    if (this.now() < this.until) return true;
    this.until = 0;
    this.halfOpen = true;
    return false;
  }

  /** Kapan jeda berakhir (epoch ms), atau null bila tidak sedang dijeda. */
  pausedUntil(): number | null {
    return this.isPaused() ? this.until : null;
  }

  get reason() {
    return this.lastReason;
  }

  get tripCount() {
    return this.trips;
  }

  success() {
    this.failures = 0;
    this.trips = 0;
    this.halfOpen = false;
    this.lastReason = null;
  }

  /**
   * Catat 1 kegagalan. `immediate` = langsung jeda (mis. WhatsApp menjawab rate limit).
   * Return true bila kegagalan ini memicu jeda.
   */
  failure(opts: { immediate?: boolean; reason?: string } = {}): boolean {
    this.failures++;
    if (opts.immediate || this.halfOpen || this.failures >= this.cfg.threshold) {
      this.trips++;
      const ms = Math.min(this.cfg.maxMs, this.cfg.baseMs * 2 ** (this.trips - 1));
      this.until = this.now() + ms;
      this.failures = 0;
      this.halfOpen = false;
      this.lastReason = opts.reason ?? 'gagal beruntun';
      return true;
    }
    return false;
  }
}

// ───────────────────────── TtlCache ─────────────────────────

export class TtlCache<V> {
  private map = new Map<string, { v: V; exp: number }>();

  /** maxSize (opsional): bila penuh, entri paling lama dibuang, supaya memori tidak membengkak. */
  constructor(
    private ttlMs: number,
    private now: Clock = Date.now,
    private maxSize = Infinity,
  ) {}

  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.exp <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    return hit.v;
  }

  set(key: string, v: V) {
    this.map.delete(key); // set ulang = jadi yang terbaru
    this.map.set(key, { v, exp: this.now() + this.ttlMs });
    while (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  delete(key: string) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }

  get size() {
    return this.map.size;
  }
}

// ───────────────────────── NumberCache ─────────────────────────

export interface NumberEntry {
  jid: string;
  exp: number;
}

/**
 * Hasil cek "nomor ini terdaftar di WhatsApp". Memeriksa nomor ke server WhatsApp berulang-ulang
 * terlihat seperti pemindai nomor, jadi hasilnya disimpan lama dan bisa ditulis ke file
 * supaya tidak hilang saat gateway restart / redeploy.
 */
export class NumberCache {
  private map = new Map<string, NumberEntry>();
  private dirty = false;

  constructor(
    private ttlMs: number,
    private now: Clock = Date.now,
  ) {}

  get(num: string): string | undefined {
    const hit = this.map.get(num);
    if (!hit) return undefined;
    if (hit.exp <= this.now()) {
      this.map.delete(num);
      this.dirty = true;
      return undefined;
    }
    return hit.jid;
  }

  set(num: string, jid: string) {
    this.map.set(num, { jid, exp: this.now() + this.ttlMs });
    this.dirty = true;
  }

  get size() {
    return this.map.size;
  }

  /** true bila ada perubahan sejak terakhir disimpan. */
  get needsSave() {
    return this.dirty;
  }

  /** Isi untuk disimpan ke file (entri kedaluwarsa tidak ikut). */
  dump(): Record<string, NumberEntry> {
    const t = this.now();
    const out: Record<string, NumberEntry> = {};
    for (const [k, v] of this.map) if (v.exp > t) out[k] = v;
    this.dirty = false;
    return out;
  }

  /** Muat dari file. Isi yang rusak / kedaluwarsa / tidak masuk akal dilewati, tidak melempar error. */
  load(raw: unknown): number {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 0;
    const t = this.now();
    let n = 0;
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const e = v as Partial<NumberEntry> | null;
      if (
        /^\d{8,16}$/.test(k) &&
        e && typeof e.jid === 'string' && e.jid.endsWith('@s.whatsapp.net') &&
        typeof e.exp === 'number' && Number.isFinite(e.exp) &&
        e.exp > t && e.exp <= t + this.ttlMs
      ) {
        this.map.set(k, { jid: e.jid, exp: e.exp });
        n++;
      }
    }
    this.dirty = false;
    return n;
  }
}

// ───────────────────────── retry ─────────────────────────

/**
 * Jalankan `fn` sampai berhasil, maksimal `tries` kali, dengan jeda yang menaik.
 * Dipakai untuk langkah kecil yang SANGAT mahal kalau gagal: setelah pesan terkirim, status 'sent'
 * harus tertulis; kalau tidak, pesan dikembalikan ke antrian dan terkirim dua kali.
 * Mengembalikan true bila akhirnya berhasil.
 */
export async function retry(
  fn: () => Promise<void>,
  opts: { tries?: number; baseMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<boolean> {
  const tries = opts.tries ?? 4;
  const baseMs = opts.baseMs ?? 500;
  const wait = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let i = 0; i < tries; i++) {
    try {
      await fn();
      return true;
    } catch {
      if (i < tries - 1) await wait(baseMs * 2 ** i);
    }
  }
  return false;
}
