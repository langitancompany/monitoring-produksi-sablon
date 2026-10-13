"use client";

// PixelTrail — latar piksel abstrak bergaya "PixelBlast", tanpa library (murni canvas 2D).
//
// Cara pakai: taruh <PixelTrail /> sebagai anak langsung dari elemen
// yang `relative` (mis. <section>). Canvas mengisi seluruh elemen induk,
// mendengarkan pointer di induknya, dan tidak menghalangi klik ke konten.
//
// - Ambient : gumpalan piksel abstrak yang berubah bentuk pelan terus-menerus.
//             Pola kotak-kotaknya berasal dari ordered dithering (matriks Bayer 8×8),
//             sama seperti shader PixelBlast.
// - Kursor  : saat kursor / jari bergerak di hero, gumpalan di sekitarnya ikut
//             terseret searah gerakan ("liquid") dan sedikit menyala.
// - Klik/tap: memunculkan ledakan + riak piksel yang melebar lalu menghilang.
// - Trail   : (opsional, `trail`) piksel acak di jalur kursor — kode lama dipertahankan.
// - Hemat   : berhenti menggambar saat hero tidak terlihat / tab tidak aktif,
//             dan turun ke ±30 fps saat tidak ada interaksi.

import { useEffect, useRef } from "react";

type PixelTrailProps = {
  /** Warna piksel TRAIL dalam format "r,g,b". Default putih. */
  color?: string;
  /** Ukuran satu kotak piksel trail (px) di layar lebar. */
  cellSize?: number;
  /** Ukuran satu kotak piksel trail (px) di layar < 640px. */
  mobileCellSize?: number;
  /** Radius sapuan piksel trail, dalam jumlah kotak. */
  radius?: number;
  /** Opasitas maksimum piksel trail (0–1). */
  maxAlpha?: number;
  /** Lama piksel trail memudar sampai hilang (ms). */
  fadeMs?: number;
  /** Nyalakan trail piksel acak di jalur kursor (kode lama). Default mati. */
  trail?: boolean;

  /** Warna piksel ambient "r,g,b". Default putih (cocok untuk latar gelap hero). */
  ambientColor?: string;
  /** Opasitas maksimum piksel ambient (0–1). 0 = matikan ambient. */
  ambientAlpha?: number;
  /** Kecepatan perubahan bentuk gumpalan. */
  ambientSpeed?: number;
  /** Skala pola: kecil = gumpalan lebih besar & lebar. */
  ambientScale?: number;
  /** Kepadatan: besar = lebih banyak piksel menyala (sekitar 0.6–1.4). */
  ambientDensity?: number;
  /** Ukuran 1 piksel dither (px CSS) di layar lebar. */
  pixelSize?: number;
  /** Ukuran 1 piksel dither (px CSS) di layar < 640px. */
  mobilePixelSize?: number;
  /** Seberapa jauh tepi canvas memudar (0–0.5). */
  edgeFade?: number;

  /** Radius pengaruh kursor, dalam jumlah blok (1 blok = 8 piksel dither). */
  pointerRadius?: number;
  /** Kekuatan gumpalan terseret kursor. */
  pointerStrength?: number;
  /** Seberapa kuat area di bawah kursor menyala (0 = tidak). */
  pointerGlow?: number;

  /** Kecepatan riak saat klik. */
  rippleSpeed?: number;
  /** Ketebalan cincin riak. */
  rippleThickness?: number;
  /** Kekuatan riak saat klik. */
  rippleIntensity?: number;

  className?: string;
};

/* ───────────────────────── Dither field (murni, tanpa DOM) ───────────────────────── */

const BLOCK = 8; // 1 blok = 8×8 piksel dither (sama dengan shader: cellPixelSize = 8 * pixelSize)
const MAX_RIPPLES = 10;

type Ripple = { x: number; y: number; t0: number };

// Matriks Bayer 8×8 — port dari Bayer2/Bayer4/Bayer8 di shader PixelBlast.
const bayer2 = (x: number, y: number) => {
  x = Math.floor(x);
  y = Math.floor(y);
  const v = x / 2 + y * y * 0.75;
  return v - Math.floor(v);
};
const bayer4 = (x: number, y: number) =>
  bayer2(0.5 * x, 0.5 * y) * 0.25 + bayer2(x, y);
const bayer8 = (x: number, y: number) =>
  bayer4(0.5 * x, 0.5 * y) * 0.25 + bayer2(x, y);
// threshold per posisi dalam blok: piksel menyala jika feed + BAYER[i] >= 0.5
const BAYER = new Float32Array(64);
for (let y = 0; y < 8; y++)
  for (let x = 0; x < 8; x++) BAYER[y * 8 + x] = bayer8(x, y) - 0.5;

// Value-noise 3D + fBm — port dari vnoise / fbm2 di shader.
// Hash integer 3D → [0,1). Pengganti fract(sin()) milik shader, yang sedikit bias ke sisi positif
// sehingga satu sisi layar jadi lebih padat dari sisi lain.
const hash3 = (x: number, y: number, z: number) => {
  let h =
    Math.imul(x, 0x27d4eb2d) ^
    Math.imul(y, 0x165667b1) ^
    Math.imul(z, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
function vnoise(x: number, y: number, z: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const n000 = hash3(ix, iy, iz);
  const n100 = hash3(ix + 1, iy, iz);
  const n010 = hash3(ix, iy + 1, iz);
  const n110 = hash3(ix + 1, iy + 1, iz);
  const n001 = hash3(ix, iy, iz + 1);
  const n101 = hash3(ix + 1, iy, iz + 1);
  const n011 = hash3(ix, iy + 1, iz + 1);
  const n111 = hash3(ix + 1, iy + 1, iz + 1);
  const wx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const wy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const wz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const x00 = n000 + (n100 - n000) * wx;
  const x10 = n010 + (n110 - n010) * wx;
  const x01 = n001 + (n101 - n001) * wx;
  const x11 = n011 + (n111 - n011) * wx;
  const y0 = x00 + (x10 - x00) * wy;
  const y1 = x01 + (x11 - x01) * wy;
  return (y0 + (y1 - y0) * wz) * 2 - 1;
}
function fbm(ux: number, uy: number, t: number, scale: number) {
  const px = ux * scale;
  const py = uy * scale;
  let sum = 1;
  let freq = 1;
  for (let i = 0; i < 5; i++) {
    sum += vnoise(px * freq, py * freq, t * freq);
    freq *= 1.25;
  }
  return sum * 0.5 + 0.5;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export type DitherField = {
  dw: number; // lebar dalam piksel dither
  dh: number; // tinggi dalam piksel dither
  bw: number; // jumlah blok horizontal
  bh: number; // jumlah blok vertikal
  u32: Uint32Array; // buffer RGBA (little-endian ABGR)
  sx: Float32Array; // edge fade per kolom
  sy: Float32Array; // edge fade per baris
  fi: Float32Array; // intensitas sentuhan per blok
  fvx: Float32Array; // arah sentuhan x per blok
  fvy: Float32Array; // arah sentuhan y per blok
};

export function createDitherField(
  dw: number,
  dh: number,
  edgeFade: number,
): DitherField {
  const bw = Math.ceil(dw / BLOCK);
  const bh = Math.ceil(dh / BLOCK);
  const sx = new Float32Array(dw);
  const sy = new Float32Array(dh);
  for (let x = 0; x < dw; x++) {
    const n = (x + 0.5) / dw;
    sx[x] = edgeFade > 0 ? smooth(0, edgeFade, Math.min(n, 1 - n)) : 1;
  }
  for (let y = 0; y < dh; y++) {
    const n = (y + 0.5) / dh;
    sy[y] = edgeFade > 0 ? smooth(0, edgeFade, Math.min(n, 1 - n)) : 1;
  }
  return {
    dw,
    dh,
    bw,
    bh,
    u32: new Uint32Array(dw * dh),
    sx,
    sy,
    fi: new Float32Array(bw * bh),
    fvx: new Float32Array(bw * bh),
    fvy: new Float32Array(bw * bh),
  };
}

export type DitherParams = {
  /** waktu noise (detik, sudah dikali kecepatan) */
  time: number;
  /** waktu untuk gelombang liquid & riak (detik) */
  clock: number;
  scale: number;
  density: number;
  strength: number;
  glow: number;
  wobble: number;
  ripples: Ripple[];
  rippleSpeed: number;
  rippleThickness: number;
  rippleIntensity: number;
  /** warna piksel: (b<<16)|(g<<8)|r */
  rgb: number;
};

/** Isi field.u32 dengan pola dither untuk satu frame. */
export function renderDitherField(f: DitherField, p: DitherParams) {
  const { dw, dh, bw, bh, u32, sx, sy, fi, fvx, fvy } = f;
  u32.fill(0);
  const z = p.time * 0.05;
  const feedBase = (p.density - 0.5) * 0.3;
  const hasRipples = p.ripples.length > 0;

  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const bi = by * bw + bx;
      // koordinat uv blok (tinggi layar = 1, sumbu y ke atas) — sama dengan shader
      let ux = ((bx + 0.5) * BLOCK - dw / 2) / dh;
      let uy = -((by + 0.5) * BLOCK - dh / 2) / dh;

      // Liquid: sampel noise digeser sehingga gumpalan terseret searah gerakan kursor
      const ti = fi[bi];
      if (ti > 0.002) {
        const wave = 0.5 + 0.5 * Math.sin(p.clock * p.wobble + ti * 6.2831853);
        const amt = p.strength * ti * wave;
        ux -= fvx[bi] * amt;
        uy += fvy[bi] * amt;
      }

      let feed = fbm(ux, uy, z, p.scale) * 0.5 - 0.65 + feedBase;
      if (ti > 0.002) feed += p.glow * ti;

      if (hasRipples) {
        for (let i = 0; i < p.ripples.length; i++) {
          const r = p.ripples[i];
          const t = Math.max(p.clock - r.t0, 0);
          const dx = ux - r.x;
          const dy = uy - r.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const k = (dist - p.rippleSpeed * t) / p.rippleThickness;
          const ring = Math.exp(-k * k);
          const atten = Math.exp(-t) * Math.exp(-10 * dist);
          const v = ring * atten * p.rippleIntensity;
          if (v > feed) feed = v;
        }
      }

      if (feed < -0.32) continue; // threshold Bayer maksimum ≈ 0.81 → tidak ada piksel yang menyala

      for (let ly = 0; ly < BLOCK; ly++) {
        const py = by * BLOCK + ly;
        if (py >= dh) break;
        const fy = sy[py];
        for (let lx = 0; lx < BLOCK; lx++) {
          const px = bx * BLOCK + lx;
          if (px >= dw) break;
          if (feed + BAYER[ly * 8 + lx] < 0.5) continue;
          const fade = fy < sx[px] ? fy : sx[px];
          const a = (fade * 255) | 0;
          if (a === 0) continue;
          u32[py * dw + px] = ((a << 24) | p.rgb) >>> 0;
        }
      }
    }
  }
}

/** "r,g,b" → angka piksel (b<<16)|(g<<8)|r */
const parseRgb = (s: string) => {
  const [r = 255, g = 255, b = 255] = s
    .split(",")
    .map((n) => Math.max(0, Math.min(255, parseInt(n, 10) || 0)));
  return (b << 16) | (g << 8) | r;
};

/* ─────────────────────────────────── Komponen ─────────────────────────────────── */

export default function PixelTrail({
  color = "255,255,255",
  cellSize = 6,
  mobileCellSize = 8,
  radius = 60,
  maxAlpha = 0.35,
  fadeMs = 1000,
  trail = false,
  ambientColor = "255,255,255",
  ambientAlpha = 0.2,
  ambientSpeed = 0.5,
  ambientScale = 2,
  ambientDensity = 1.5,
  pixelSize = 3,
  mobilePixelSize = 3,
  edgeFade = 0.2,
  pointerRadius = 3,
  pointerStrength = 0.18,
  pointerGlow = 0.25,
  rippleSpeed = 0.4,
  rippleThickness = 0.12,
  rippleIntensity = 1.5,
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
    let raf = 0;
    let last = 0;
    let visible = true;
    const startedAt = performance.now();
    const timeOffset = Math.random() * 1000;
    const rgb = parseRgb(ambientColor);

    // ── Ambient (dither) ──
    let ps = pixelSize;
    let field: DitherField | null = null;
    let off: HTMLCanvasElement | null = null;
    let offCtx: CanvasRenderingContext2D | null = null;
    let img: ImageData | null = null;
    let fieldActive = false;
    const ripples: Ripple[] = [];
    let prevPtr: { x: number; y: number } | null = null; // posisi kursor (px) untuk arah gerak

    // ── Trail (kode lama, opsional) ──
    let cell = cellSize;
    let cols = 0;
    let rows = 0;
    let prev: { x: number; y: number } | null = null;
    // key = baris * cols + kolom, value = intensitas 0..1
    const cells = new Map<number, number>();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = host.clientWidth;
      h = host.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // trail
      cell = w < 640 ? mobileCellSize : cellSize;
      cols = Math.ceil(w / cell);
      rows = Math.ceil(h / cell);
      cells.clear();

      // ambient
      ps = w < 640 ? mobilePixelSize : pixelSize;
      const dw = Math.max(1, Math.ceil(w / ps));
      const dh = Math.max(1, Math.ceil(h / ps));
      field = createDitherField(dw, dh, edgeFade);
      off = document.createElement("canvas");
      off.width = dw;
      off.height = dh;
      offCtx = off.getContext("2d");
      img = offCtx ? offCtx.createImageData(dw, dh) : null;
      start();
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

    // Seret gumpalan: tambahkan "sentuhan" (intensitas + arah) di sekitar kursor.
    const pushField = (x: number, y: number) => {
      const f = field;
      if (!f) return;
      if (prevPtr) {
        const dx = x - prevPtr.x;
        const dy = y - prevPtr.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.5) return;
        const dirx = dx / dist;
        const diry = dy / dist;
        const force = Math.min(dist / 24, 1);
        const blockPx = ps * BLOCK;
        const steps = Math.max(1, Math.ceil(dist / (blockPx * 0.5)));
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const bxp = (prevPtr.x + dx * t) / blockPx;
          const byp = (prevPtr.y + dy * t) / blockPx;
          const R = pointerRadius;
          const x0 = Math.max(0, Math.floor(bxp - R));
          const x1 = Math.min(f.bw - 1, Math.ceil(bxp + R));
          const y0 = Math.max(0, Math.floor(byp - R));
          const y1 = Math.min(f.bh - 1, Math.ceil(byp + R));
          for (let by = y0; by <= y1; by++) {
            for (let bx = x0; bx <= x1; bx++) {
              const d2 = (bx + 0.5 - bxp) ** 2 + (by + 0.5 - byp) ** 2;
              const wgt = Math.exp(-d2 / (R * R * 0.5)) * force;
              if (wgt < 0.01) continue;
              const i = by * f.bw + bx;
              f.fi[i] = Math.min(1, f.fi[i] + wgt * 0.6);
              f.fvx[i] = Math.max(-1, Math.min(1, f.fvx[i] + dirx * wgt * 0.6));
              f.fvy[i] = Math.max(-1, Math.min(1, f.fvy[i] + diry * wgt * 0.6));
            }
          }
        }
      }
      prevPtr = { x, y };
      fieldActive = true;
      start();
    };

    const addRipple = (x: number, y: number, clock: number) => {
      const f = field;
      if (!f) return;
      // piksel layar → koordinat uv shader (tinggi = 1, y ke atas)
      const ux = (x / ps - f.dw / 2) / f.dh;
      const uy = -(y / ps - f.dh / 2) / f.dh;
      if (ripples.length >= MAX_RIPPLES) ripples.shift();
      ripples.push({ x: ux, y: uy, t0: clock });
    };

    function tick(now: number) {
      raf = 0;
      if (!visible || document.hidden) return; // dijalankan ulang oleh start()

      // Ada interaksi → ±60fps; hanya ambient → ±30fps.
      const busy = fieldActive || ripples.length > 0 || cells.size > 0;
      if (now - last < (busy ? 14 : 30)) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min(now - last, 64);
      last = now;
      const elapsed = (now - startedAt) / 1000;
      const clock = elapsed * 0.5; // sama dengan shader: uTime = elapsed * 0.5 untuk riak & wobble

      ctx.clearRect(0, 0, w, h);

      // ── Ambient dither ──
      const f = field;
      if (ambientAlpha > 0 && f && off && offCtx && img) {
        // peluruhan sentuhan kursor
        if (fieldActive) {
          const k = Math.pow(0.93, dt / 16.7);
          let alive = false;
          for (let i = 0; i < f.fi.length; i++) {
            f.fi[i] *= k;
            f.fvx[i] *= k;
            f.fvy[i] *= k;
            if (f.fi[i] > 0.01) alive = true;
            else {
              f.fi[i] = 0;
              f.fvx[i] = 0;
              f.fvy[i] = 0;
            }
          }
          fieldActive = alive;
        }
        for (let i = ripples.length - 1; i >= 0; i--)
          if (clock - ripples[i].t0 > 4) ripples.splice(i, 1);

        renderDitherField(f, {
          time: timeOffset + elapsed * ambientSpeed,
          clock,
          scale: ambientScale,
          density: ambientDensity,
          strength: pointerStrength,
          glow: pointerGlow,
          wobble: 4.5,
          ripples,
          rippleSpeed,
          rippleThickness,
          rippleIntensity,
          rgb,
        });
        new Uint32Array(img.data.buffer).set(f.u32);
        offCtx.putImageData(img, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.globalAlpha = ambientAlpha;
        ctx.drawImage(off, 0, 0, f.dw, f.dh, 0, 0, f.dw * ps, f.dh * ps);
        ctx.globalAlpha = 1;
      }

      // ── Trail (opsional) ──
      if (trail) {
        const decay = dt / fadeMs;
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
      }

      // Ambient selalu lanjut selama hero terlihat; tanpa ambient, berhenti saat diam.
      if (ambientAlpha > 0 || cells.size > 0) raf = requestAnimationFrame(tick);
    }

    // ── Event: mouse (desktop) ──
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const { x, y } = toLocal(e.clientX, e.clientY);
      pushField(x, y);
      if (trail) stampLine(x, y);
    };
    const onPointerLeave = () => {
      prev = null;
      prevPtr = null;
    };

    // ── Event: sentuhan (HP) ──
    const onTouchStart = (e: TouchEvent) => {
      prev = null;
      prevPtr = null;
      const t = e.touches[0];
      if (!t) return;
      const { x, y } = toLocal(t.clientX, t.clientY);
      pushField(x, y);
      if (trail) stampLine(x, y);
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      const { x, y } = toLocal(t.clientX, t.clientY);
      pushField(x, y);
      if (trail) stampLine(x, y);
    };
    const onTouchEnd = () => {
      prev = null;
      prevPtr = null;
    };

    // ── Ketukan / klik → ledakan + riak ──
    const onClick = (e: MouseEvent) => {
      const { x, y } = toLocal(e.clientX, e.clientY);
      addRipple(x, y, ((performance.now() - startedAt) / 1000) * 0.5);
      start();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    // Berhenti menggambar saat hero keluar layar / tab disembunyikan.
    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((entries) => {
            visible = entries[0]?.isIntersecting ?? true;
            if (visible) start();
          })
        : null;
    io?.observe(host);
    const onVisibility = () => {
      if (!document.hidden) start();
    };
    document.addEventListener("visibilitychange", onVisibility);

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
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", onPointerLeave);
      host.removeEventListener("touchstart", onTouchStart);
      host.removeEventListener("touchmove", onTouchMove);
      host.removeEventListener("touchend", onTouchEnd);
      host.removeEventListener("touchcancel", onTouchEnd);
      host.removeEventListener("click", onClick);
    };
  }, [
    color,
    cellSize,
    mobileCellSize,
    radius,
    maxAlpha,
    fadeMs,
    trail,
    ambientColor,
    ambientAlpha,
    ambientSpeed,
    ambientScale,
    ambientDensity,
    pixelSize,
    mobilePixelSize,
    edgeFade,
    pointerRadius,
    pointerStrength,
    pointerGlow,
    rippleSpeed,
    rippleThickness,
    rippleIntensity,
  ]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
    />
  );
}
