"use client";

// PixelTrail — latar piksel interaktif untuk hero, TANPA library (murni canvas 2D).
//
// Cara pakai: taruh <PixelTrail /> sebagai anak langsung dari elemen
// yang `relative` (mis. <section>). Canvas mengisi seluruh elemen induk,
// mendengarkan pointer di induknya, dan tidak menghalangi klik ke konten.
//
// ═══ DUA PILIHAN ANIMASI — pilih lewat prop `water` ═══════════════════════════
//
//   <PixelTrail />                 → ANIMASI AIR (baru)         (water = true, bawaan)
//   <PixelTrail water={false} />   → ANIMASI GUMPALAN (sebelumnya)
//
//   water = true   Air tenang yang beriak karena angin. Kursor digerakkan →
//                  jejak riak V. Klik → tetesan air dengan riak lingkar.
//                  Memakai simulasi persamaan gelombang sungguhan.
//   water = false  Gumpalan dot abstrak yang berubah bentuk pelan. Kursor
//                  digerakkan → gumpalan terseret & menyala. Klik → ledakan
//                  + riak. Pola kotak-kotak dari ordered dithering (Bayer 8×8).
//
//   Trail piksel acak yang paling awal (kode lama) tetap tersedia dan bisa
//   ditumpuk di atas kedua animasi:  <PixelTrail trail />
//
// ═══ Hemat ════════════════════════════════════════════════════════════════════
//   Berhenti menggambar saat hero tidak terlihat / tab tidak aktif, dan turun ke
//   ±30 fps saat tidak ada interaksi.

import { useEffect, useRef } from "react";

type PixelTrailProps = {
  /**
   * PILIHAN ANIMASI.
   * true (bawaan) = animasi air  |  false = animasi gumpalan (sebelumnya).
   */
  water?: boolean;

  // ── Trail piksel acak (kode lama, opsional) ──
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
  /** Nyalakan trail piksel acak di jalur kursor. Default mati. */
  trail?: boolean;

  // ── Umum (berlaku untuk air maupun gumpalan) ──
  /** Warna dot "r,g,b". Default putih. */
  ambientColor?: string;
  /** Opasitas maksimum dot (0–1). 0 = matikan animasi. Bawaan: air 0.7, gumpalan 0.5. */
  ambientAlpha?: number;
  /** Ukuran 1 dot (px CSS) di layar lebar. */
  pixelSize?: number;
  /** Ukuran 1 dot (px CSS) di layar < 640px. */
  mobilePixelSize?: number;
  /** Seberapa jauh tepi area memudar (0–0.5). */
  edgeFade?: number;

  // ── Khusus AIR (water = true) ──
  /** Kepadatan dot dasar saat air datar (0–0.3). */
  baseDensity?: number;
  /** Kuatnya riak akibat angin. 0 = air benar-benar tenang. */
  windStrength?: number;
  /** Kecepatan gelombang angin merambat. */
  windSpeed?: number;
  /** Arah angin dalam derajat (0 = ke kanan, 90 = ke bawah). */
  windAngle?: number;
  /** Kecepatan rambat riak (0.1–0.5; jangan > 0.5 agar simulasi stabil). */
  waveSpeed?: number;
  /** Seberapa lama riak bertahan (0.98–0.999). Besar = riak lebih lama. */
  waveDamping?: number;
  /** Kekuatan jejak riak saat kursor digerakkan. */
  pointerStrength?: number;
  /** Lebar jejak kursor, dalam jumlah dot. */
  pointerRadius?: number;
  /** Kekuatan tetesan saat klik. */
  dropStrength?: number;
  /** Lebar tetesan saat klik, dalam jumlah dot. */
  dropRadius?: number;

  // ── Khusus GUMPALAN (water = false) ──
  /** Kecepatan gumpalan berubah bentuk. */
  blobSpeed?: number;
  /** Skala pola: kecil = gumpalan lebih besar & lebar. */
  blobScale?: number;
  /** Kepadatan: besar = lebih banyak dot menyala (sekitar 0.6–2). */
  blobDensity?: number;
  /** Radius pengaruh kursor, dalam jumlah blok (1 blok = 8 dot). */
  blobPointerRadius?: number;
  /** Kekuatan gumpalan terseret kursor. */
  blobPointerStrength?: number;
  /** Seberapa kuat area di bawah kursor menyala. */
  blobPointerGlow?: number;
  /** Kecepatan riak saat klik. */
  blobRippleSpeed?: number;
  /** Ketebalan cincin riak. */
  blobRippleThickness?: number;
  /** Kekuatan riak saat klik. */
  blobRippleIntensity?: number;

  className?: string;
};

/* ───────────────────────── Mesin air (murni, tanpa DOM) ───────────────────────── */

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
export const BAYER = new Float32Array(64);
for (let y = 0; y < 8; y++)
  for (let x = 0; x < 8; x++) BAYER[y * 8 + x] = bayer8(x, y) - 0.5;

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const WAVES = [
  { len: 22, dir: -1.35, amp: 0.3, ph: 0.0 },
  { len: 16, dir: -0.8, amp: 0.3, ph: 1.7 },
  { len: 30, dir: -0.3, amp: 0.35, ph: 3.1 },
  { len: 19, dir: 0.2, amp: 0.3, ph: 4.6 },
  { len: 13, dir: 0.75, amp: 0.22, ph: 2.2 },
  { len: 36, dir: 1.3, amp: 0.3, ph: 5.4 },
];
const K = WAVES.length;
const AMPS = new Float32Array(WAVES.map((w) => w.amp));
const GUST_LEN = 170;

export type Water = {
  dw: number;
  dh: number;
  u: Float32Array;
  v: Float32Array;
  damp: Float32Array;
  H: Float32Array;
  u32: Uint32Array;
  sx: Float32Array;
  sy: Float32Array;
  active: boolean;
  kx: Float32Array;
  ky: Float32Array;
  om: Float32Array;
  rowS: Float32Array;
  rowC: Float32Array;
  colS: Float32Array;
  colC: Float32Array;
  gkx: number;
  gom: number;
  gRowS: Float32Array;
  gRowC: Float32Array;
  gColS: Float32Array;
  gColC: Float32Array;
};

export function createWater(
  dw: number,
  dh: number,
  edgeFade: number,
  windAngle: number,
  windSpeed: number,
  damping: number,
): Water {
  const n = dw * dh;
  const sx = new Float32Array(dw),
    sy = new Float32Array(dh);
  for (let x = 0; x < dw; x++) {
    const t = (x + 0.5) / dw;
    sx[x] = edgeFade > 0 ? smooth(0, edgeFade, Math.min(t, 1 - t)) : 1;
  }
  for (let y = 0; y < dh; y++) {
    const t = (y + 0.5) / dh;
    sy[y] = edgeFade > 0 ? smooth(0, edgeFade, Math.min(t, 1 - t)) : 1;
  }
  // spons peredam di tepi supaya gelombang tidak memantul balik
  const damp = new Float32Array(n);
  const SP = 14;
  for (let y = 0; y < dh; y++)
    for (let x = 0; x < dw; x++) {
      const d = Math.min(x, y, dw - 1 - x, dh - 1 - y);
      const s = d < SP ? 1 - d / SP : 0;
      damp[y * dw + x] = damping * (1 - 0.14 * s * s);
    }
  const kx = new Float32Array(K),
    ky = new Float32Array(K),
    om = new Float32Array(K);
  const rowS = new Float32Array(K * dh),
    rowC = new Float32Array(K * dh);
  for (let k = 0; k < K; k++) {
    const w = WAVES[k];
    const th = windAngle + w.dir;
    const kk = (2 * Math.PI) / w.len;
    kx[k] = kk * Math.cos(th);
    ky[k] = kk * Math.sin(th);
    om[k] = kk * 2.6 * Math.sqrt(w.len) * windSpeed;
    for (let y = 0; y < dh; y++) {
      rowS[k * dh + y] = Math.sin(ky[k] * y);
      rowC[k * dh + y] = Math.cos(ky[k] * y);
    }
  }
  const gk = (2 * Math.PI) / GUST_LEN;
  const gkx = gk * Math.cos(windAngle),
    gky = gk * Math.sin(windAngle);
  const gRowS = new Float32Array(dh),
    gRowC = new Float32Array(dh);
  for (let y = 0; y < dh; y++) {
    gRowS[y] = Math.sin(gky * y);
    gRowC[y] = Math.cos(gky * y);
  }
  return {
    dw,
    dh,
    u: new Float32Array(n),
    v: new Float32Array(n),
    damp,
    H: new Float32Array(n),
    u32: new Uint32Array(n),
    sx,
    sy,
    active: false,
    kx,
    ky,
    om,
    rowS,
    rowC,
    colS: new Float32Array(K * dw),
    colC: new Float32Array(K * dw),
    gkx,
    gom: gk * 26 * windSpeed,
    gRowS,
    gRowC,
    gColS: new Float32Array(dw),
    gColC: new Float32Array(dw),
  };
}

/** Satu langkah persamaan gelombang (dipanggil ±60x per detik). */
export function stepWater(w: Water, c2: number, restore = 0.004) {
  const { dw, dh, u, v, damp } = w;
  let maxAbs = 0;
  for (let y = 1; y < dh - 1; y++) {
    const row = y * dw;
    for (let x = 1; x < dw - 1; x++) {
      const i = row + x;
      const c = u[i];
      const nv =
        (2 * c -
          v[i] +
          c2 * (u[i - 1] + u[i + 1] + u[i - dw] + u[i + dw] - 4 * c) -
          restore * c) *
        damp[i];
      v[i] = nv;
      const a = nv < 0 ? -nv : nv;
      if (a > maxAbs) maxAbs = a;
    }
  }
  w.u = v;
  w.v = u;
  w.active = maxAbs > 0.004;
  if (!w.active) {
    // Riak sudah hilang → nolkan sisa nilai kecil agar tidak ada pola yang "membeku".
    u.fill(0);
    v.fill(0);
  }
}

/**
 * Sentuhan / tetesan di (cx, cy) (satuan sel).
 * drop=false → gangguan halus (jejak kursor).
 * drop=true  → pusat cekung + cincin di sekitarnya, merambat jadi beberapa riak lingkar.
 */
export function splash(
  w: Water,
  cx: number,
  cy: number,
  radius: number,
  amp: number,
  drop = false,
) {
  const R = Math.ceil(radius * (drop ? 3.2 : 2.2));
  const x0 = Math.max(1, Math.floor(cx - R)),
    x1 = Math.min(w.dw - 2, Math.ceil(cx + R));
  const y0 = Math.max(1, Math.floor(cy - R)),
    y1 = Math.min(w.dh - 2, Math.ceil(cy + R));
  const r2 = radius * radius;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const q = ((x - cx) * (x - cx) + (y - cy) * (y - cy)) / r2;
      // Kedua profil bernilai total nol (turunan kedua gaussian) → permukaan tidak meninggalkan "lubang".
      w.u[y * w.dw + x] +=
        amp *
        (drop
          ? (1 - 1.425 * q + 0.25 * q * q) * Math.exp(-q * 0.8)
          : (1 - q) * Math.exp(-q));
    }
  w.active = true;
}

export type WaterRender = {
  time: number;
  simGain: number;
  windStrength: number;
  base: number;
  hGain: number;
  sGain: number;
  rgb: number;
};

export function renderWater(w: Water, p: WaterRender) {
  const {
    dw,
    dh,
    u,
    H,
    u32,
    sx,
    sy,
    kx,
    om,
    rowS,
    rowC,
    colS,
    colC,
    gColS,
    gColC,
    gRowS,
    gRowC,
  } = w;
  // bagian kolom (bergantung waktu) dihitung sekali per frame
  for (let k = 0; k < K; k++) {
    const ph = WAVES[k].ph;
    for (let x = 0; x < dw; x++) {
      const a = kx[k] * x - om[k] * p.time + ph;
      colS[k * dw + x] = Math.sin(a);
      colC[k * dw + x] = Math.cos(a);
    }
  }
  for (let x = 0; x < dw; x++) {
    const a = w.gkx * x - w.gom * p.time;
    gColS[x] = Math.sin(a);
    gColC[x] = Math.cos(a);
  }
  const ws = p.windStrength;
  const amps = AMPS;
  for (let y = 0; y < dh; y++) {
    const grs = gRowS[y],
      grc = gRowC[y];
    const row = y * dw;
    for (let x = 0; x < dw; x++) {
      let sum = 0;
      for (let k = 0; k < K; k++) {
        sum +=
          amps[k] *
          (colS[k * dw + x] * rowC[k * dh + y] +
            colC[k * dw + x] * rowS[k * dh + y]);
      }
      const gs = 0.5 + 0.5 * (gColS[x] * grc + gColC[x] * grs);
      const env = 0.4 + 0.6 * gs;
      H[row + x] = u[row + x] * p.simGain + sum * env * ws;
    }
  }
  const LX = -0.6,
    LY = -0.8;
  u32.fill(0);
  for (let y = 0; y < dh; y++) {
    const fy = sy[y];
    const row = y * dw;
    const by = (y & 7) << 3;
    for (let x = 0; x < dw; x++) {
      const fade = fy < sx[x] ? fy : sx[x];
      if (fade <= 0) continue;
      const i = row + x;
      let gx = 0,
        gy = 0;
      if (x > 0 && x < dw - 1 && y > 0 && y < dh - 1) {
        gx = H[i + 1] - H[i - 1];
        gy = H[i + dw] - H[i - dw];
      }
      const feed = p.base + p.hGain * H[i] + p.sGain * (gx * LX + gy * LY);
      if (feed + BAYER[by | (x & 7)] < 0.5) continue;
      const inten = feed > 1 ? 1 : feed;
      const a = (fade * (0.45 + 0.55 * inten) * 255) | 0;
      if (a <= 0) continue;
      u32[i] = ((a << 24) | p.rgb) >>> 0;
    }
  }
}

/* ───────────── Mesin gumpalan dither (animasi sebelumnya, gaya PixelBlast) ───────────── */

const BLOCK = 8; // 1 blok = 8×8 dot (feed dihitung per blok, pola isi dari matriks Bayer)
const MAX_RIPPLES = 10;

type Ripple = { x: number; y: number; t0: number };

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

export type DitherField = {
  dw: number; // lebar dalam dot
  dh: number; // tinggi dalam dot
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
      // koordinat uv blok (tinggi layar = 1, sumbu y ke atas)
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

const SIM_STEP_MS = 1000 / 60; // simulasi air berjalan tetap 60 langkah per detik

/* ─────────────────────────────────── Komponen ─────────────────────────────────── */

export default function PixelTrail({
  water = true,
  color = "255,255,255",
  cellSize = 6,
  mobileCellSize = 8,
  radius = 60,
  maxAlpha = 0.35,
  fadeMs = 1000,
  trail = false,
  ambientColor = "255,255,255",
  ambientAlpha,
  pixelSize = 3,
  mobilePixelSize = 2,
  edgeFade = 0.2,
  // air
  baseDensity = 0.09,
  windStrength = 0.5,
  windSpeed = 1,
  windAngle = 25,
  waveSpeed = 0.48,
  waveDamping = 0.995,
  pointerStrength = 1,
  pointerRadius = 2.5,
  dropStrength = 1,
  dropRadius = 3,
  // gumpalan
  blobSpeed = 0.5,
  blobScale = 2,
  blobDensity = 1.5,
  blobPointerRadius = 3,
  blobPointerStrength = 0.18,
  blobPointerGlow = 0.25,
  blobRippleSpeed = 0.4,
  blobRippleThickness = 0.12,
  blobRippleIntensity = 1.5,
  className = "",
}: PixelTrailProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Opasitas bawaan berbeda per animasi supaya masing-masing tampil pas tanpa diatur.
  const alpha = ambientAlpha ?? (water ? 0.7 : 0.5);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    // Hormati pengaturan "kurangi gerakan" milik pengguna.
    //if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const ctx: CanvasRenderingContext2D = ctx2d;

    const useWater = water;
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    let visible = true;
    const startedAt = performance.now();
    const waterOffset = Math.random() * 100;
    const blobOffset = Math.random() * 1000;
    const rgb = parseRgb(ambientColor);

    // ── Dot (dipakai bersama oleh air & gumpalan) ──
    let ps = pixelSize;
    let off: HTMLCanvasElement | null = null;
    let offCtx: CanvasRenderingContext2D | null = null;
    let img: ImageData | null = null;

    // ── Air ──
    let wsim: Water | null = null;
    let simAcc = 0;
    let prevCell: { x: number; y: number } | null = null; // posisi kursor (satuan dot)

    // ── Gumpalan ──
    let field: DitherField | null = null;
    let fieldActive = false;
    const ripples: Ripple[] = [];
    let prevPx: { x: number; y: number } | null = null; // posisi kursor (px) untuk arah gerak

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

      // dot
      ps = w < 640 ? mobilePixelSize : pixelSize;
      const dw = Math.max(8, Math.ceil(w / ps));
      const dh = Math.max(8, Math.ceil(h / ps));
      if (useWater) {
        wsim = createWater(
          dw,
          dh,
          edgeFade,
          (windAngle * Math.PI) / 180,
          windSpeed,
          waveDamping,
        );
        simAcc = 0;
      } else {
        field = createDitherField(dw, dh, edgeFade);
        fieldActive = false;
        ripples.length = 0;
      }
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

    /* ── AIR: kursor menyapu air → riak V di belakangnya ── */
    const pushWater = (x: number, y: number) => {
      const wt = wsim;
      if (!wt) return;
      const cx = x / ps;
      const cy = y / ps;
      if (prevCell) {
        const dx = cx - prevCell.x;
        const dy = cy - prevCell.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.3) return;
        const speed = Math.min(dist / 4, 1);
        const steps = Math.min(12, Math.max(1, Math.ceil(dist / 1.5)));
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          splash(
            wt,
            prevCell.x + dx * t,
            prevCell.y + dy * t,
            pointerRadius,
            -0.26 * pointerStrength * speed,
          );
        }
      }
      prevCell = { x: cx, y: cy };
      start();
    };

    /* ── AIR: klik / ketuk → tetesan ── */
    const dropWater = (x: number, y: number) => {
      const wt = wsim;
      if (!wt) return;
      splash(wt, x / ps, y / ps, dropRadius, -3.6 * dropStrength, true);
      start();
    };

    /* ── GUMPALAN: seret gumpalan di sekitar kursor ── */
    const pushField = (x: number, y: number) => {
      const f = field;
      if (!f) return;
      if (prevPx) {
        const dx = x - prevPx.x;
        const dy = y - prevPx.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.5) return;
        const dirx = dx / dist;
        const diry = dy / dist;
        const force = Math.min(dist / 24, 1);
        const blockPx = ps * BLOCK;
        const steps = Math.max(1, Math.ceil(dist / (blockPx * 0.5)));
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const bxp = (prevPx.x + dx * t) / blockPx;
          const byp = (prevPx.y + dy * t) / blockPx;
          const R = blobPointerRadius;
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
      prevPx = { x, y };
      fieldActive = true;
      start();
    };

    /* ── GUMPALAN: klik / ketuk → ledakan + riak ── */
    const addRipple = (x: number, y: number) => {
      const f = field;
      if (!f) return;
      // piksel layar → koordinat uv (tinggi = 1, y ke atas)
      const ux = (x / ps - f.dw / 2) / f.dh;
      const uy = -(y / ps - f.dh / 2) / f.dh;
      if (ripples.length >= MAX_RIPPLES) ripples.shift();
      ripples.push({
        x: ux,
        y: uy,
        t0: ((performance.now() - startedAt) / 1000) * 0.5,
      });
      start();
    };

    function tick(now: number) {
      raf = 0;
      if (!visible || document.hidden) return; // dijalankan ulang oleh start()

      // Ada interaksi aktif → ±60fps; hanya animasi dasar → ±30fps.
      const interacting = useWater
        ? (wsim?.active ?? false)
        : fieldActive || ripples.length > 0;
      const busy = interacting || cells.size > 0;
      if (now - last < (busy ? 14 : 30)) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min(now - last, 64);
      last = now;
      const elapsed = (now - startedAt) / 1000;

      ctx.clearRect(0, 0, w, h);

      // ── Dot ──
      if (alpha > 0 && off && offCtx && img) {
        let dw = 0;
        let dh = 0;
        let src: Uint32Array | null = null;

        if (useWater && wsim) {
          // simulasi riak dengan langkah waktu tetap (maks 3 langkah per frame)
          if (wsim.active) {
            simAcc += dt;
            let n = 0;
            while (simAcc >= SIM_STEP_MS && n < 3) {
              stepWater(wsim, waveSpeed);
              simAcc -= SIM_STEP_MS;
              n++;
            }
            if (n === 3) simAcc = 0;
          } else {
            simAcc = 0;
          }
          renderWater(wsim, {
            time: elapsed + waterOffset,
            simGain: 3.4,
            windStrength,
            base: baseDensity,
            hGain: 0.3,
            sGain: 0.35,
            rgb,
          });
          dw = wsim.dw;
          dh = wsim.dh;
          src = wsim.u32;
        } else if (!useWater && field) {
          const f = field;
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
          const clock = elapsed * 0.5; // sama dengan shader: uTime = elapsed * 0.5 untuk riak & wobble
          for (let i = ripples.length - 1; i >= 0; i--)
            if (clock - ripples[i].t0 > 4) ripples.splice(i, 1);
          renderDitherField(f, {
            time: blobOffset + elapsed * blobSpeed,
            clock,
            scale: blobScale,
            density: blobDensity,
            strength: blobPointerStrength,
            glow: blobPointerGlow,
            wobble: 4.5,
            ripples,
            rippleSpeed: blobRippleSpeed,
            rippleThickness: blobRippleThickness,
            rippleIntensity: blobRippleIntensity,
            rgb,
          });
          dw = f.dw;
          dh = f.dh;
          src = f.u32;
        }

        if (src) {
          new Uint32Array(img.data.buffer).set(src);
          offCtx.putImageData(img, 0, 0);
          ctx.imageSmoothingEnabled = false;
          ctx.globalAlpha = alpha;
          ctx.drawImage(off, 0, 0, dw, dh, 0, 0, dw * ps, dh * ps);
          ctx.globalAlpha = 1;
        }
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

      // Animasi dasar selalu bergerak selama terlihat; tanpa dot, berhenti saat diam.
      if (alpha > 0 || cells.size > 0) raf = requestAnimationFrame(tick);
    }

    const onMove = (x: number, y: number) => {
      if (useWater) pushWater(x, y);
      else pushField(x, y);
      if (trail) stampLine(x, y);
    };
    const resetPointer = () => {
      prev = null;
      prevCell = null;
      prevPx = null;
    };

    // ── Event: mouse (desktop) ──
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const { x, y } = toLocal(e.clientX, e.clientY);
      onMove(x, y);
    };
    const onPointerLeave = () => resetPointer();

    // ── Event: sentuhan (HP) ──
    const onTouchStart = (e: TouchEvent) => {
      resetPointer();
      const t = e.touches[0];
      if (!t) return;
      const { x, y } = toLocal(t.clientX, t.clientY);
      onMove(x, y);
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      const { x, y } = toLocal(t.clientX, t.clientY);
      onMove(x, y);
    };
    const onTouchEnd = () => resetPointer();

    // ── Klik / ketuk ──
    const onClick = (e: MouseEvent) => {
      const { x, y } = toLocal(e.clientX, e.clientY);
      if (useWater) dropWater(x, y);
      else addRipple(x, y);
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
    water,
    color,
    cellSize,
    mobileCellSize,
    radius,
    maxAlpha,
    fadeMs,
    trail,
    ambientColor,
    alpha,
    pixelSize,
    mobilePixelSize,
    edgeFade,
    baseDensity,
    windStrength,
    windSpeed,
    windAngle,
    waveSpeed,
    waveDamping,
    pointerStrength,
    pointerRadius,
    dropStrength,
    dropRadius,
    blobSpeed,
    blobScale,
    blobDensity,
    blobPointerRadius,
    blobPointerStrength,
    blobPointerGlow,
    blobRippleSpeed,
    blobRippleThickness,
    blobRippleIntensity,
  ]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
    />
  );
}
