"use client";

// app/components/po/POCountdown.tsx
//
// Hitung mundur menuju berakhirnya PO.
// Aturan sama dengan server (lib/po/order-validation.ts): PO masih dibuka
// sepanjang TANGGAL SELESAI itu sendiri (WIB), jadi target hitung mundur
// adalah pukul 23:59:59 WIB pada periode_selesai.
//
// Tampilan: angka besar polos dengan pemisah titik dua dan label kecil di
// bawahnya. Saat angka berganti, angka lama turun sambil mengabur sementara
// angka baru turun dari atas (keyframes po-cd-in / po-cd-out di globals.css).

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

type Props = {
  /** periode_selesai dari po_setting, format YYYY-MM-DD */
  endDate?: string | null;
  /** "hero" = angka besar (latar gelap), "compact" = satu baris kecil */
  variant?: "hero" | "compact";
  /** Dipanggil sekali saat hitung mundur mencapai nol */
  onExpire?: () => void;
};

function targetMs(endDate?: string | null): number | null {
  const d = endDate?.slice(0, 10);
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const t = new Date(`${d}T23:59:59.999+07:00`).getTime();
  return Number.isNaN(t) ? null : t;
}

function formatTanggal(endDate: string): string {
  const [y, m, d] = endDate.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Satu digit yang bergulir ke bawah: angka lama turun sambil mengabur lalu
 * hilang, angka baru turun dari atas dengan gerakan yang sama. Isi dipotong
 * di dalam kotak digit (overflow-hidden). Padding vertikal + margin negatif
 * dipakai supaya ukuran/tata letak digit tetap sama seperti sebelumnya.
 */
function RollDigit({ value }: { value: string }) {
  const [state, setState] = useState<{
    cur: string;
    prev: string | null;
    tick: number;
  }>({ cur: value, prev: null, tick: 0 });

  // Diturunkan saat render supaya angka baru langsung beranimasi di frame
  // yang sama, tanpa sempat tampil diam dulu.
  if (value !== state.cur) {
    setState({ cur: value, prev: state.cur, tick: state.tick + 1 });
  }

  useEffect(() => {
    if (state.prev === null) return;
    const t = setTimeout(
      () => setState((s) => (s.prev === null ? s : { ...s, prev: null })),
      400,
    );
    return () => clearTimeout(t);
  }, [state.tick, state.prev]);

  return (
    <span className="relative inline-block overflow-hidden tabular-nums py-[0.1em] -my-[0.1em]">
      <span
        key={`in-${state.tick}`}
        className={`inline-block ${state.tick > 0 ? "po-cd-in" : ""}`}
      >
        {state.cur}
      </span>
      {state.prev !== null && (
        <span
          key={`out-${state.tick}`}
          aria-hidden
          className="po-cd-out absolute inset-x-0 top-[0.1em] inline-block pointer-events-none"
        >
          {state.prev}
        </span>
      )}
    </span>
  );
}

function Group({ value, label }: { value: number; label: string }) {
  const text = pad(value);
  return (
    <div className="flex flex-col items-center">
      <div className="flex text-5xl sm:text-7xl md:text-8xl font-medium leading-none tracking-tight">
        {text.split("").map((ch, i) => (
          // key dari posisi dari kanan supaya digit satuan/puluhan tetap stabil
          <RollDigit key={text.length - i} value={ch} />
        ))}
      </div>
      <span className="mt-3 text-xs sm:text-sm font-normal text-white/55">
        {label}
      </span>
    </div>
  );
}

function Colon() {
  return (
    // Titik dua sejajar dengan angka (label di bawah tidak ikut menggeser)
    <div className="flex flex-col justify-center gap-2 sm:gap-3 h-[48px] sm:h-[72px] md:h-[96px] px-2 sm:px-4 md:px-5 shrink-0">
      <span className="block w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-white/80" />
      <span className="block w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-white/80" />
    </div>
  );
}

export default function POCountdown({
  endDate,
  variant = "hero",
  onExpire,
}: Props) {
  const target = targetMs(endDate);
  // null dulu supaya tidak ada selisih tampilan server vs browser (hydration)
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (target === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  const remaining = target !== null && now !== null ? target - now : null;
  const expired = remaining !== null && remaining <= 0;

  useEffect(() => {
    if (expired) onExpire?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired]);

  if (target === null || remaining === null || expired) return null;

  const totalSec = Math.floor(remaining / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  // Kurang dari 24 jam → judul berubah jadi "segera berakhir"
  const urgent = remaining < 24 * 3600 * 1000;

  if (variant === "compact") {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-bold tabular-nums">
        <Clock size={14} className="shrink-0" />
        <span>
          Berakhir dalam {days > 0 ? `${days} hari ` : ""}
          {pad(hours)}:{pad(minutes)}:{pad(seconds)}
        </span>
      </span>
    );
  }

  return (
    <div
      role="timer"
      aria-label="Waktu tersisa sampai PO berakhir"
      className="flex flex-col items-center gap-8"
    >
      <p
        className={`text-xl sm:text-3xl font-light tracking-tight ${
          urgent ? "text-amber-300" : "text-white"
        }`}
      >
        {urgent ? "Segera berakhir, PO ditutup dalam" : "PO ditutup dalam"}
      </p>

      <div className="flex items-start justify-center">
        <Group value={days} label="Hari" />
        <Colon />
        <Group value={hours} label="Jam" />
        <Colon />
        <Group value={minutes} label="Menit" />
        <Colon />
        <Group value={seconds} label="Detik" />
      </div>

      <p className="text-xs text-white/45">
        Berakhir {formatTanggal(endDate as string)} pukul 23:59 WIB
      </p>
    </div>
  );
}
