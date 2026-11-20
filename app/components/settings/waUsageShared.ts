// app/components/settings/waUsageShared.ts
// Tipe & helper bersama untuk kartu nomor pengirim (WaSenders.tsx): bentuk data pemakaian & antrian,
// warna bar, dan format waktu. Pemakaian dan antrian ditampilkan per nomor di kartu masing-masing.

export interface WaUsage {
  sentHour: number;
  sentDay: number;
  limits: { perHour: number; perDay: number };
  hourFreesAt: string | null; // perkiraan jatah per jam terbuka lagi (null = belum penuh)
  dayFreesAt: string | null; // perkiraan jatah per 24 jam terbuka lagi
  pausedUntil: string | null;
  pausedReason: string | null;
  enabled: boolean;
}

export interface WaQueueInfo {
  pending: number;
  oldest_pending_at: string | null;
  failed_24h: number;
  pending_by_event?: Record<string, { n: number; oldest: string }>;
  failed_by_event?: Record<string, number>;
  recent_failed: {
    id: string;
    event_type: string;
    to: string;
    error: string | null;
    at: string;
  }[];
}

// <70% hijau, 70–89% kuning, >=90% merah
export function warnaPemakaian(pct: number) {
  if (pct >= 90) return { bar: "bg-red-500", text: "text-red-600 dark:text-red-400" };
  if (pct >= 70) return { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" };
  return { bar: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" };
}

export const jam = (iso: string) =>
  new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

export const lamaMenunggu = (iso: string) => {
  const menit = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (menit < 1) return "baru saja";
  if (menit < 60) return `${menit} menit`;
  const j = Math.floor(menit / 60);
  return j < 24 ? `${j} jam` : `${Math.floor(j / 24)} hari`;
};

// "pukul 14.05 (±12 menit lagi)" · beda hari → "besok pukul 03.20 (±9 jam lagi)"
export const kapan = (iso: string) => {
  const t = Date.parse(iso);
  const selisih = Math.max(0, t - Date.now());
  const menit = Math.ceil(selisih / 60_000);
  const sisa = menit < 1 ? "sebentar lagi" : menit < 60 ? `±${menit} menit lagi` : `±${Math.round(menit / 60)} jam lagi`;
  const hariIni = new Date(t).toDateString() === new Date().toDateString();
  return `${hariIni ? "" : "besok "}pukul ${jam(iso)} (${sisa})`;
};

export const namaEvent = (e: string) => (e ? e.replace(/[_-]+/g, " ") : "pesan");
