// app/tv/page.tsx
//
// Tampilan TV: antrian produksi berurutan seperti daftar Pesanan Aktif.
// Buka di browser TV:  https://domain-anda/tv
//
// Gaya mengikuti THEME-GUIDE "LCO Flat" (zinc, hairline border, angka mono,
// satu aksen teal, warna lain hanya untuk status). Terang/gelap mengikuti
// pengaturan perangkat (prefers-color-scheme), sama seperti halaman lain.
//
// Pengaturan lewat URL (semua opsional):
//   ?per=10        jumlah baris per layar        (default 10, rentang 3–20)
//   &interval=12   detik per halaman sebelum geser (default 12, rentang 5–120)
//   &refresh=30    detik antar penyegaran data    (default 30, rentang 10–300)
// Contoh: /tv?per=8&interval=15
//
// Catatan ukuran: panduan tema memakai px (text-[10px], dst) untuk layar
// aplikasi. Di TV semua ukuran memakai em supaya ikut membesar/mengecil sesuai
// resolusi layar; bobot, warna, dan pola kelasnya tetap sama dengan panduan.
"use client";

import React, { useEffect, useState } from "react";
import { Loader2, Lock, WifiOff } from "lucide-react";
import { useTVQueue } from "@/hooks/useTVQueue";
import {
  TV_STAGES,
  daysToDeadline,
  getStage,
  getStageIndex,
  hasOpenKendala,
  isOverdue,
  isRevisi,
  pageCount,
  sliceForPage,
  type TVOrder,
} from "@/lib/tvQueue";
import { orderTypeLabel } from "@/lib/utils";
import ThemedLogo from "@/app/components/ui/ThemedLogo";

const TEAL = "#49bfb4";

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

// Lebar kolom dipakai bersama oleh judul kolom dan tiap baris supaya sejajar.
// No | Pesanan | Jumlah | Tahap | Progres | Deadline | Penanggung jawab
const COLS =
  "2.2em minmax(0,2.3fr) 7em 9.5em minmax(0,1.5fr) 7.5em minmax(0,1.9fr)";

// Label kecil (judul kolom, judul statistik)
const LABEL =
  "text-[0.72em] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400";

const initials = (name?: string | null) =>
  (name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

// ─── Satu baris antrian ──────────────────────────────────────────────────────

function QueueRow({ order, rank }: { order: TVOrder; rank: number }) {
  const stageIdx = Math.min(
    getStageIndex(getStage(order)),
    TV_STAGES.length - 1,
  );
  const stageLabel = TV_STAGES[stageIdx].label;
  const progress = (stageIdx + 1) / TV_STAGES.length;

  const overdue = isOverdue(order);
  const kendala = hasOpenKendala(order);
  const revisi = isRevisi(order);
  const days = daysToDeadline(order.deadline);
  const urgent = !overdue && days <= 2;

  // Indikator garis di sisi kiri: telat > kendala > revisi > urgent
  const indicator = overdue
    ? "bg-red-600"
    : kendala
      ? "bg-purple-600"
      : revisi
        ? "bg-rose-600"
        : urgent
          ? "bg-orange-600"
          : "";

  let dueText = `${days} hari lagi`;
  let dueClass = "font-medium text-zinc-500 dark:text-zinc-400";
  if (days < 0) {
    dueText = `Telat ${-days} hari`;
    dueClass = "font-semibold text-red-600 dark:text-red-500";
  } else if (days === 0) {
    dueText = "Hari ini";
    dueClass = "font-semibold text-orange-600 dark:text-orange-500";
  } else if (days <= 2) {
    dueClass = "font-semibold text-orange-600 dark:text-orange-500";
  }

  const dueDate = new Date(order.deadline).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
  });

  const pj = order.assigned_user?.name;
  const helper = order.helper_user?.name;

  return (
    <div
      className="relative grid items-center gap-x-[1em] border-b border-zinc-200 px-[1em] dark:border-zinc-800"
      style={{ gridTemplateColumns: COLS }}
    >
      {indicator && (
        <span
          className={`absolute inset-y-[0.9em] left-0 w-[0.22em] rounded-full ${indicator}`}
        />
      )}

      {/* No */}
      <p className="font-mono text-[0.85em] tabular-nums text-zinc-400 dark:text-zinc-500">
        {String(rank).padStart(2, "0")}
      </p>

      {/* Pesanan */}
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[1.3em] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {order.nama_pemesan}
        </p>
        <p className="mt-[0.25em] truncate font-mono text-[0.8em] tabular-nums text-zinc-400 dark:text-zinc-500">
          {order.kode_produksi}
        </p>
      </div>

      {/* Jumlah */}
      <div className="leading-tight">
        <p className="font-mono text-[1.1em] font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
          {order.jumlah.toLocaleString("id-ID")}
          <span className="ml-[0.3em] text-[0.75em] font-medium text-zinc-500 dark:text-zinc-400">
            pcs
          </span>
        </p>
        <p className="mt-[0.25em] truncate text-[0.8em] text-zinc-500 dark:text-zinc-400">
          {orderTypeLabel(order)}
        </p>
      </div>

      {/* Tahap */}
      <div className="leading-tight">
        <p className="text-[1.1em] font-semibold text-zinc-900 dark:text-zinc-100">
          {stageLabel}
        </p>
        {(kendala || revisi) && (
          <p className="mt-[0.25em] text-[0.7em] font-semibold uppercase tracking-wide">
            {kendala && (
              <span className="mr-[0.8em] text-purple-600 dark:text-purple-400">
                Ada kendala
              </span>
            )}
            {revisi && (
              <span className="text-rose-600 dark:text-rose-400">Revisi</span>
            )}
          </p>
        )}
      </div>

      {/* Progres */}
      <div className="flex items-center gap-[0.8em]">
        <div className="h-[0.42em] flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full rounded-full"
            style={{ width: `${progress * 100}%`, background: TEAL }}
          />
        </div>
        <span className="font-mono text-[0.9em] tabular-nums text-zinc-700 dark:text-zinc-300">
          {stageIdx + 1}/{TV_STAGES.length}
        </span>
      </div>

      {/* Deadline */}
      <div className="leading-tight">
        <p className="font-mono text-[1.1em] font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
          {dueDate}
        </p>
        <p className={`mt-[0.25em] text-[0.8em] ${dueClass}`}>{dueText}</p>
      </div>

      {/* Penanggung jawab */}
      <div className="flex min-w-0 items-center gap-[0.8em]">
        <span className="flex h-[2.3em] w-[2.3em] shrink-0 items-center justify-center rounded-full bg-zinc-100 font-mono text-[0.8em] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {initials(pj) || "-"}
        </span>
        <div className="min-w-0 leading-tight">
          <p
            className={`truncate text-[1.1em] font-semibold ${
              pj
                ? "text-zinc-900 dark:text-zinc-100"
                : "text-zinc-400 dark:text-zinc-500"
            }`}
          >
            {pj ?? "Belum ditentukan"}
          </p>
          {helper && (
            <p className="mt-[0.25em] truncate text-[0.8em] text-zinc-500 dark:text-zinc-400">
              Helper: {helper}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sel statistik (pola "Stat cell" di panduan) ─────────────────────────────

function Stat({
  label,
  value,
  valueClass = "text-zinc-900 dark:text-zinc-100",
  badge,
}: {
  label: string;
  value: number;
  valueClass?: string;
  badge?: string;
}) {
  return (
    <div className="px-[2em] first:pl-0">
      <div className="mb-[0.5em] flex h-[1.9em] items-center gap-[0.8em]">
        <p className={LABEL}>{label}</p>
        {badge && (
          <span className="rounded-full border border-zinc-300/70 bg-white/80 px-[0.8em] py-[0.15em] font-mono text-[0.72em] tabular-nums text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-300">
            {badge}
          </span>
        )}
      </div>
      <p
        className={`font-mono text-[2.8em] font-semibold leading-none tabular-nums ${valueClass}`}
      >
        {value.toLocaleString("id-ID")}
      </p>
    </div>
  );
}

// ─── Halaman ─────────────────────────────────────────────────────────────────

export default function TVPage() {
  // Pengaturan dari URL (dibaca setelah mount supaya aman untuk SSR)
  const [cfg, setCfg] = useState({ per: 10, interval: 12, refresh: 30 });
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const num = (k: string, def: number, min: number, max: number) => {
      const v = parseInt(q.get(k) ?? "", 10);
      return Number.isFinite(v) ? clamp(v, min, max) : def;
    };
    setCfg({
      per: num("per", 10, 3, 20),
      interval: num("interval", 12, 5, 120),
      refresh: num("refresh", 30, 10, 300),
    });
  }, []);

  const { queue, monthTotal, auth, loaded, offline, updatedAt } = useTVQueue(
    cfg.refresh,
  );

  // Jam
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-geser halaman
  const [page, setPage] = useState(0);
  const pages = pageCount(queue.length, cfg.per);

  useEffect(() => {
    if (page >= pages) setPage(0);
  }, [page, pages]);

  useEffect(() => {
    if (pages <= 1) return;
    const id = setInterval(
      () => setPage((p) => (p + 1) % pages),
      cfg.interval * 1000,
    );
    return () => clearInterval(id);
  }, [pages, cfg.interval]);

  const visible = sliceForPage(queue, page, cfg.per);

  // Layar TV tidak boleh mati sendiri
  useEffect(() => {
    let lock: any = null;
    const request = async () => {
      try {
        lock = await (navigator as any).wakeLock?.request("screen");
      } catch {
        /* browser TV tertentu tidak mendukung — abaikan */
      }
    };
    request();
    const onVisible = () => document.visibilityState === "visible" && request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release?.();
    };
  }, []);

  // Klik / tombol OK di remote = layar penuh
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const overdueCount = queue.filter(isOverdue).length;

  // Sebaran per tahap untuk batang di header
  const perStage = TV_STAGES.map(
    (_, i) => queue.filter((o) => getStageIndex(getStage(o)) === i).length,
  );
  const STAGE_OPACITY = [0.3, 0.5, 0.75, 1];

  const time = now?.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const eyebrow = now
    ?.toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "short",
      year: "numeric",
    })
    .toUpperCase();
  const monthBadge = now?.toLocaleDateString("id-ID", {
    month: "short",
    year: "numeric",
  });

  return (
    <div
      onClick={toggleFullscreen}
      className="fixed inset-0 flex cursor-none select-none flex-col overflow-hidden bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"
      // Semua ukuran memakai satuan em, jadi otomatis menyesuaikan ukuran
      // layar TV (1080p, 4K, dsb).
      style={{ fontSize: "min(1.05vw, 1.9vh)" }}
    >
      <style>{`
        @keyframes tvFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes tvFill { from { width: 0; } to { width: 100%; } }
        .tv-fade { animation: tvFade 250ms ease-out both; }
        .tv-fill { animation: tvFill var(--tv-interval) linear both; }
        @media (prefers-reduced-motion: reduce) { .tv-fade { animation: none; } }
      `}</style>

      {/* ── Hero ── */}
      <header className="mx-[0.9em] mt-[0.9em] rounded-xl border border-zinc-200/80 bg-zinc-100/80 px-[1.8em] py-[1.1em] shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/90">
        <div className="flex items-center justify-between gap-[2em]">
          <div className="flex items-center gap-[1em]">
            <ThemedLogo alt="" className="h-[3em] w-[3em] object-contain" />
            <div className="leading-tight">
              <p className="font-mono text-[0.75em] uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">
                {eyebrow ?? "\u00A0"}
              </p>
              <h1 className="mt-[0.2em] text-[2em] font-semibold tracking-tight">
                Antrian produksi
              </h1>
            </div>
          </div>

          <p className="font-mono text-[3em] font-semibold leading-none tabular-nums tracking-tight">
            {time ?? "--.--"}
          </p>
        </div>

        <div className="my-[1em] h-px bg-zinc-200 dark:bg-zinc-800" />

        <div className="flex items-stretch divide-x divide-zinc-200 dark:divide-zinc-800">
          <Stat label="Pesanan antri" value={queue.length} />
          <Stat label="Masuk bulan ini" value={monthTotal} badge={monthBadge} />
          <Stat
            label="Lewat deadline"
            value={overdueCount}
            valueClass={
              overdueCount > 0
                ? "text-red-600 dark:text-red-500"
                : "text-zinc-300 dark:text-zinc-700"
            }
          />

          {/* Sebaran tahap */}
          <div className="min-w-0 flex-1 pl-[2em]">
            <p className={`${LABEL} mb-[0.5em] flex h-[1.9em] items-center`}>
              Posisi tahap
            </p>
            <div className="flex h-[0.55em] gap-[0.25em]">
              {perStage.map((n, i) =>
                n > 0 ? (
                  <div
                    key={TV_STAGES[i].key}
                    className="rounded-full"
                    style={{
                      flexGrow: n,
                      background: TEAL,
                      opacity: STAGE_OPACITY[i],
                    }}
                  />
                ) : null,
              )}
              {queue.length === 0 && (
                <div className="flex-1 rounded-full bg-zinc-200 dark:bg-zinc-800" />
              )}
            </div>
            <div className="mt-[0.8em] flex flex-wrap gap-x-[1.6em] gap-y-[0.3em] text-[0.85em]">
              {TV_STAGES.map((s, i) => (
                <span
                  key={s.key}
                  className="flex items-center gap-[0.5em] text-zinc-500 dark:text-zinc-400"
                >
                  <span
                    className="h-[0.6em] w-[0.6em] rounded-full"
                    style={{ background: TEAL, opacity: STAGE_OPACITY[i] }}
                  />
                  {s.label}
                  <span className="font-mono font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                    {perStage[i]}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* ── Isi ── */}
      {auth === "checking" || (auth === "ok" && !loaded) ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-[1em] text-zinc-500 dark:text-zinc-400">
          <Loader2 className="h-[2.6em] w-[2.6em] animate-spin" />
          <p className="text-[1.2em] font-medium">Memuat antrian...</p>
        </div>
      ) : auth === "no-session" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-[0.8em] text-center">
          <Lock className="h-[2.6em] w-[2.6em] text-zinc-400 dark:text-zinc-500" />
          <p className="text-[1.8em] font-semibold tracking-tight">
            Belum login
          </p>
          <p className="max-w-[30em] text-[1.05em] text-zinc-500 dark:text-zinc-400">
            Buka halaman utama aplikasi di browser TV ini dan login sekali, lalu
            buka kembali halaman /tv.
          </p>
        </div>
      ) : queue.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-[0.5em] text-center">
          <p className="text-[2.2em] font-semibold tracking-tight">
            Antrian kosong
          </p>
          <p className="text-[1.1em] text-zinc-500 dark:text-zinc-400">
            Semua pesanan sudah selesai.
          </p>
        </div>
      ) : (
        <main className="flex min-h-0 flex-1 flex-col px-[0.9em] pb-[0.4em] pt-[0.9em]">
          <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-zinc-200 bg-white p-[0.8em] dark:border-zinc-800 dark:bg-zinc-950">
            {/* Judul kolom */}
            <div
              className="grid items-center gap-x-[1em] rounded-md bg-zinc-50 px-[1em] py-[0.8em] dark:bg-zinc-900"
              style={{ gridTemplateColumns: COLS }}
            >
              <span className={LABEL}>No</span>
              <span className={LABEL}>Pesanan</span>
              <span className={LABEL}>Jumlah</span>
              <span className={LABEL}>Tahap</span>
              <span className={LABEL}>Progres</span>
              <span className={LABEL}>Deadline</span>
              <span className={LABEL}>Penanggung jawab</span>
            </div>

            {/* Tinggi tiap baris tetap (1/per), jadi halaman terakhir yang
                isinya lebih sedikit tidak melar. */}
            <div
              key={page}
              className="tv-fade grid min-h-0 flex-1"
              style={{ gridTemplateRows: `repeat(${cfg.per}, minmax(0, 1fr))` }}
            >
              {visible.map((o, i) => (
                <QueueRow key={o.id} order={o} rank={page * cfg.per + i + 1} />
              ))}
            </div>
          </div>
        </main>
      )}

      {/* ── Footer ── */}
      <footer className="flex items-center justify-between px-[2em] pb-[0.8em] pt-[0.3em] text-[0.8em] text-zinc-500 dark:text-zinc-400">
        <div className="flex items-center gap-[0.9em]">
          {pages > 1 && (
            <>
              <span className="font-mono tabular-nums">
                Halaman {page + 1}/{pages}
              </span>
              <span className="flex gap-[0.4em]">
                {Array.from({ length: pages }).map((_, i) => (
                  <span
                    key={i}
                    className="relative h-[0.35em] w-[2.6em] overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                  >
                    {i === page && (
                      <span
                        key={`${page}-${cfg.interval}`}
                        className="tv-fill absolute inset-y-0 left-0 rounded-full"
                        style={{
                          background: TEAL,
                          ["--tv-interval" as any]: `${cfg.interval}s`,
                        }}
                      />
                    )}
                  </span>
                ))}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-[1.4em]">
          {offline && (
            <span className="flex items-center gap-[0.4em] font-semibold text-orange-600 dark:text-orange-500">
              <WifiOff className="h-[1.1em] w-[1.1em]" />
              Koneksi bermasalah, menampilkan data terakhir
            </span>
          )}
          <span className="font-mono tabular-nums">
            Diperbarui{" "}
            {updatedAt
              ? updatedAt.toLocaleTimeString("id-ID", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })
              : "-"}
          </span>
        </div>
      </footer>
    </div>
  );
}
