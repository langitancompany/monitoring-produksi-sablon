// app/components/settings/WaUsageCard.tsx
// Kartu "Pemakaian kirim" di Pengaturan → Notifikasi.
// Menampilkan progress bar batas kirim WhatsApp (per jam & per hari), jumlah pesan yang masih
// menunggu di antrian, pesan gagal beserta alasannya, dan info bila antrian sedang dijeda.
// Data: /api/wa/gateway?action=status (sudah dipoll WhatsAppSettings) + /api/wa/queue.
"use client";

import React from "react";
import { Gauge, PauseCircle, Clock, XCircle } from "lucide-react";

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
  recent_failed: {
    id: string;
    event_type: string;
    to: string;
    error: string | null;
    at: string;
  }[];
}

const cardCls =
  "bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800";

// <70% hijau, 70–89% kuning, >=90% merah
function warna(pct: number) {
  if (pct >= 90) return { bar: "bg-red-500", text: "text-red-600 dark:text-red-400" };
  if (pct >= 70) return { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" };
  return { bar: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" };
}

function Bar({
  label,
  used,
  max,
  freesAt,
}: {
  label: string;
  used: number;
  max: number;
  freesAt?: string | null;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const penuh = max > 0 && used >= max;
  const c = warna(pct);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{label}</span>
        <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          <span className={`font-semibold ${c.text}`}>{used}</span> / {max}
          {penuh && (
            <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-red-600 dark:text-red-400">
              Penuh
            </span>
          )}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(used, max)}
        className="h-2.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden"
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${c.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {penuh && freesAt && (
        <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
          Tersedia lagi sekitar <span className="font-medium text-zinc-700 dark:text-zinc-300">{kapan(freesAt)}</span>
        </p>
      )}
    </div>
  );
}

const jam = (iso: string) =>
  new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

const lamaMenunggu = (iso: string) => {
  const menit = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (menit < 1) return "baru saja";
  if (menit < 60) return `${menit} menit`;
  const j = Math.floor(menit / 60);
  return j < 24 ? `${j} jam` : `${Math.floor(j / 24)} hari`;
};

// "pukul 14.05 (±12 menit lagi)" · beda hari → "besok pukul 03.20 (±9 jam lagi)"
const kapan = (iso: string) => {
  const t = Date.parse(iso);
  const selisih = Math.max(0, t - Date.now());
  const menit = Math.ceil(selisih / 60_000);
  const sisa = menit < 1 ? "sebentar lagi" : menit < 60 ? `±${menit} menit lagi` : `±${Math.round(menit / 60)} jam lagi`;
  const hariIni = new Date(t).toDateString() === new Date().toDateString();
  return `${hariIni ? "" : "besok "}pukul ${jam(iso)} (${sisa})`;
};

const namaEvent = (e: string) => (e ? e.replace(/[_-]+/g, " ") : "pesan");

export default function WaUsageCard({
  usage,
  queue,
}: {
  usage: WaUsage;
  queue: WaQueueInfo | null;
}) {
  const hariPenuh = usage.limits.perDay > 0 && usage.sentDay >= usage.limits.perDay;
  const jamPenuh = usage.limits.perHour > 0 && usage.sentHour >= usage.limits.perHour;
  const dijeda = !!usage.pausedUntil;
  const pending = queue?.pending ?? 0;

  // Satu kalimat yang menjawab "kenapa pesan belum terkirim?"
  const penjelasan = (() => {
    if (dijeda)
      return `Pengiriman sedang dijeda sampai ${jam(usage.pausedUntil as string)}${usage.pausedReason ? ` (${usage.pausedReason})` : ""}. Pesan menunggu di antrian dan terkirim otomatis setelah jeda selesai.`;
    if (hariPenuh)
      return `Batas harian penuh. Pesan baru ditahan di antrian dan terkirim otomatis saat jatah kembali${usage.dayFreesAt ? `, sekitar ${kapan(usage.dayFreesAt)}` : ""}.`;
    if (jamPenuh)
      return `Batas per jam penuh. Pesan baru ditahan di antrian dan terkirim otomatis saat jatah kembali${usage.hourFreesAt ? `, sekitar ${kapan(usage.hourFreesAt)}` : ""}.`;
    if (!usage.enabled && pending > 0)
      return "Saklar WhatsApp Bot nonaktif, jadi pesan yang sudah antri tidak diproses.";
    return null;
  })();

  return (
    <div className={`${cardCls} p-5 md:p-6 space-y-4`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-zinc-500 dark:text-zinc-400">
          <Gauge size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Pemakaian kirim WhatsApp
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Dihitung bergulir (60 menit dan 24 jam terakhir), bukan reset tengah malam. Batas ini
            pengaman anti-blokir; pesan yang kena batas ditahan, tidak dibuang.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Bar label="Per jam" used={usage.sentHour} max={usage.limits.perHour} freesAt={usage.hourFreesAt} />
        <Bar label="Per 24 jam" used={usage.sentDay} max={usage.limits.perDay} freesAt={usage.dayFreesAt} />
      </div>

      {penjelasan && (
        <div
          className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
            dijeda || hariPenuh || jamPenuh
              ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
              : "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
          }`}
        >
          {dijeda ? <PauseCircle size={14} className="mt-0.5 shrink-0" /> : <Clock size={14} className="mt-0.5 shrink-0" />}
          <p>{penjelasan}</p>
        </div>
      )}

      {queue && (
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
              Menunggu di antrian
            </p>
            <p className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {queue.pending}
            </p>
            {queue.pending > 0 && queue.oldest_pending_at && (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Tertua {lamaMenunggu(queue.oldest_pending_at)}
              </p>
            )}
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
              Gagal (24 jam)
            </p>
            <p
              className={`text-lg font-semibold tabular-nums ${
                queue.failed_24h > 0 ? "text-red-600 dark:text-red-400" : "text-zinc-900 dark:text-zinc-100"
              }`}
            >
              {queue.failed_24h}
            </p>
          </div>
        </div>
      )}

      {queue && queue.recent_failed.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
            Pesan gagal terakhir
          </p>
          <ul className="border border-zinc-200 dark:border-zinc-800 rounded-md divide-y divide-zinc-200 dark:divide-zinc-800">
            {queue.recent_failed.map((f) => (
              <li key={f.id} className="px-3 py-2 flex items-start gap-2">
                <XCircle size={14} className="mt-0.5 shrink-0 text-red-500" />
                <div className="min-w-0">
                  <p className="text-xs text-zinc-800 dark:text-zinc-200">
                    <span className="font-medium capitalize">{namaEvent(f.event_type)}</span>
                    <span className="text-zinc-500 dark:text-zinc-400"> ke {f.to} · {jam(f.at)}</span>
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 break-words">
                    {f.error ?? "Alasan tidak tercatat."}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
