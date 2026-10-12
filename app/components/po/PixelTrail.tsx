"use client";

// PixelTrail — efek piksel yang muncul di jalur kursor / jari, lalu memudar.
//
// Cara pakai: taruh <PixelTrail /> sebagai anak langsung dari elemen
// yang `relative` (mis. <section>). Canvas mengisi seluruh elemen induk,
// mendengarkan pointer di induknya, dan tidak menghalangi klik ke konten.
//
// - Desktop : piksel muncul di bawah kursor.
// - HP      : piksel mengikuti geseran jari; ketukan memunculkan riak.
// - Hemat   : hanya menggambar saat ada piksel aktif (diam = 0% CPU).
// - Aksesibilitas: otomatis mati jika perangkat memakai "reduce motion".

import { useEffect, useRef } from "react";

type PixelTrailProps = {
  /** Warna piksel dalam format "r,g,b". Default putih (cocok untuk latar gelap). */
  color?: string;
  /** Ukuran satu kotak piksel (px) di layar lebar. */
  cellSize?: number;
  /** Ukuran satu kotak piksel (px) di layar < 640px. */
  mobileCellSize?: number;
  /** Radius sapuan piksel, dalam jumlah kotak. */
  radius?: number;
  /** Opasitas maksimum piksel (0–1). Kecilkan agar teks tetap terbaca. */
  maxAlpha?: number;
  /** Lama piksel memudar sampai hilang (ms). */
  fadeMs?: number;
  className?: string;
};

export default function PixelTrail({
  color = "255,255,255",
  cellSize = 6,
  mobileCellSize = 8,
  radius = 60,
  maxAlpha = 0.35,
  fadeMs = 1000,
  className = "",
}: PixelTrailProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    // Hormati pengaturan "kurangi gerakan" milik pengguna.
    //if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const ctx: CanvasRenderingContext2D = ctx2d;

    let w = 0;
    let h = 0;
    let cell = cellSize;
    let cols = 0;
    let rows = 0;
    let raf = 0;
    let last = 0;
    let prev: { x: number; y: number } | null = null;

    // key = baris * cols + kolom, value = intensitas 0..1
    const cells = new Map<number, number>();
    const ripples: { x: number; y: number; t: number }[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = host.clientWidth;
      h = host.clientHeight;
      cell = w < 640 ? mobileCellSize : cellSize;
      cols = Math.ceil(w / cell);
      rows = Math.ceil(h / cell);
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cells.clear();
    };

    const setCell = (cx: number, cy: number, value: number) => {
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return;
      const key = cy * cols + cx;
      const old = cells.get(key) ?? 0;
      if (value > old) cells.set(key, value);
    };

    // Sebar piksel acak di sekitar titik (x, y) — tepi lebih jarang, tengah lebih padat.
    const stamp = (x: number, y: number) => {
      const cx = Math.floor(x / cell);
      const cy = Math.floor(y / cell);
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const d = Math.hypot(dx, dy);
          if (d > radius) continue;
          const p = 1 - d / radius;
          if (Math.random() > 0.3 + 0.7 * p) continue;
          setCell(cx + dx, cy + dy, 0.45 + 0.55 * Math.random() * (0.5 + p));
        }
      }
    };

    const start = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };

    const stampLine = (x: number, y: number) => {
      if (prev) {
        const dist = Math.hypot(x - prev.x, y - prev.y);
        const steps = Math.max(1, Math.ceil(dist / cell));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          stamp(prev.x + (x - prev.x) * t, prev.y + (y - prev.y) * t);
        }
      } else {
        stamp(x, y);
      }
      prev = { x, y };
      start();
    };

    const toLocal = (clientX: number, clientY: number) => {
      const rect = host.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    function tick(now: number) {
      const dt = Math.min(now - last, 64);
      last = now;
      const decay = dt / fadeMs;

      // Riak: cincin piksel yang melebar dari titik ketukan.
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        const ringR = (now - r.t) * 0.22; // px
        if (ringR > 180) {
          ripples.splice(i, 1);
          continue;
        }
        const n = Math.max(8, Math.ceil((2 * Math.PI * ringR) / cell));
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          const px = Math.floor((r.x + Math.cos(a) * ringR) / cell);
          const py = Math.floor((r.y + Math.sin(a) * ringR) / cell);
          setCell(px, py, 0.9 * (1 - ringR / 180) + 0.1);
        }
      }

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = `rgb(${color})`;
      const size = cell - 2; // jarak 1px antar piksel agar terlihat seperti grid
      cells.forEach((v, key) => {
        const nv = v - decay;
        if (nv <= 0) {
          cells.delete(key);
          return;
        }
        cells.set(key, nv);
        ctx.globalAlpha = nv * maxAlpha;
        const cy = Math.floor(key / cols);
        const cx = key - cy * cols;
        ctx.fillRect(cx * cell + 1, cy * cell + 1, size, size);
      });
      ctx.globalAlpha = 1;

      if (cells.size > 0 || ripples.length > 0) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0; // tidak ada yang bergerak → berhenti menggambar
      }
    }

    // ── Event: mouse (desktop) ──
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const { x, y } = toLocal(e.clientX, e.clientY);
      stampLine(x, y);
    };
    const onPointerLeave = () => {
      prev = null;
    };

    // ── Event: sentuhan (HP) ──
    const onTouchStart = (e: TouchEvent) => {
      prev = null;
      const t = e.touches[0];
      if (!t) return;
      const { x, y } = toLocal(t.clientX, t.clientY);
      stampLine(x, y);
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      const { x, y } = toLocal(t.clientX, t.clientY);
      stampLine(x, y);
    };
    const onTouchEnd = () => {
      prev = null;
    };

    // ── Ketukan / klik → riak ──
    const onClick = (e: MouseEvent) => {
      const { x, y } = toLocal(e.clientX, e.clientY);
      ripples.push({ x, y, t: performance.now() });
      start();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    host.addEventListener("pointermove", onPointerMove, { passive: true });
    host.addEventListener("pointerleave", onPointerLeave, { passive: true });
    host.addEventListener("touchstart", onTouchStart, { passive: true });
    host.addEventListener("touchmove", onTouchMove, { passive: true });
    host.addEventListener("touchend", onTouchEnd, { passive: true });
    host.addEventListener("touchcancel", onTouchEnd, { passive: true });
    host.addEventListener("click", onClick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", onPointerLeave);
      host.removeEventListener("touchstart", onTouchStart);
      host.removeEventListener("touchmove", onTouchMove);
      host.removeEventListener("touchend", onTouchEnd);
      host.removeEventListener("touchcancel", onTouchEnd);
      host.removeEventListener("click", onClick);
    };
  }, [color, cellSize, mobileCellSize, radius, maxAlpha, fadeMs]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
    />
  );
}
