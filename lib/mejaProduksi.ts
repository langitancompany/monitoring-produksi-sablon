// Jadwal naik meja produksi: kapan order mulai dikerjakan di meja dan berapa hari.
// Semua hitungan memakai hari kalender dan tanggal lokal (yyyy-MM-dd).

import type { Order } from "@/types";
import { getStepsKey } from "@/lib/utils";

const pad = (n: number) => String(n).padStart(2, "0");

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

// Selisih hari kalender via UTC supaya pergantian jam musim tidak menggeser hasil.
function diffDays(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ua - ub) / 86400000);
}

/** Hanya menerima yyyy-MM-dd; tanggal yang tidak ada di kalender (30 Feb) ditolak. */
export function parseTanggal(raw?: string | null): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw ?? "");
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  const d = new Date(y, mo - 1, da);
  return d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === da ? d : null;
}

export const DURASI_MIN = 1;
export const DURASI_MAX = 90;

export interface JadwalMeja {
  mulai: Date;
  /** Hari pengerjaan terakhir (termasuk). */
  selesai: Date;
  durasi: number;
}

export type Putusan = "tepat" | "mundur" | "maju" | "tanpa_deadline";

export interface PenilaianJadwal {
  putusan: Putusan;
  /** Positif = lewat deadline, negatif = lebih cepat dari deadline. */
  selisihHari: number;
}

export function isDurasiValid(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= DURASI_MIN && (n as number) <= DURASI_MAX;
}

export function jadwalOf(
  o: Pick<Order, "meja_mulai" | "meja_durasi">,
): JadwalMeja | null {
  const mulai = parseTanggal(o.meja_mulai);
  const durasi = o.meja_durasi;
  if (!mulai || !isDurasiValid(durasi)) return null;
  return { mulai, selesai: addDays(mulai, durasi - 1), durasi };
}

export function estimasiSelesai(mulai: Date, durasi: number): Date {
  return addDays(startOfDay(mulai), Math.max(DURASI_MIN, durasi) - 1);
}

/** Tanggal naik meja paling akhir supaya order masih selesai tepat di deadline. */
export function mulaiPalingAkhir(deadline: Date, durasi: number): Date {
  return addDays(startOfDay(deadline), -(Math.max(DURASI_MIN, durasi) - 1));
}

export function nilaiJadwal(
  selesai: Date,
  deadline?: string | null,
): PenilaianJadwal {
  const dl = parseTanggal(deadline);
  if (!dl) return { putusan: "tanpa_deadline", selisihHari: 0 };
  const selisih = diffDays(selesai, dl);
  if (selisih === 0) return { putusan: "tepat", selisihHari: 0 };
  return { putusan: selisih > 0 ? "mundur" : "maju", selisihHari: selisih };
}

export function labelPutusan(p: PenilaianJadwal): string {
  switch (p.putusan) {
    case "tepat":
      return "Tepat deadline";
    case "mundur":
      return `Mundur ${p.selisihHari} hari`;
    case "maju":
      return `Maju ${Math.abs(p.selisihHari)} hari`;
    default:
      return "Tanpa deadline";
  }
}

export function menyentuhHari(j: JadwalMeja, day: Date): boolean {
  const d = startOfDay(day);
  return d >= j.mulai && d <= j.selesai;
}

export function adaDiRentang(j: JadwalMeja, dari: Date, sampai: Date): boolean {
  return j.mulai <= sampai && j.selesai >= dari;
}

export interface BebanHari {
  order: number;
  pcs: number;
}

/** Order yang sedang berada di meja pada hari itu. Order Selesai ikut dihitung. */
export function bebanHari(orders: Order[], day: Date): BebanHari {
  let order = 0;
  let pcs = 0;
  for (const o of orders) {
    const j = jadwalOf(o);
    if (!j || !menyentuhHari(j, day)) continue;
    order += 1;
    pcs += Number(o.jumlah) || 0;
  }
  return { order, pcs };
}

/** Hanya order Sablon Manual yang naik meja. DTF dan merchandise tidak terikat jadwal. */
export function perluJadwalMeja(o: Pick<Order, "jenis_produksi">): boolean {
  return getStepsKey(o.jenis_produksi) === "steps_manual";
}

export function sudahApproval(o: Pick<Order, "link_approval">): boolean {
  return !!o.link_approval?.link;
}

/** Approval terbit, perlu jadwal, belum dijadwalkan, belum selesai. Urut dari tanggal masuk terlama. */
export function antrianBelumDijadwalkan(orders: Order[]): Order[] {
  return orders
    .filter(
      (o) =>
        perluJadwalMeja(o) &&
        sudahApproval(o) &&
        !jadwalOf(o) &&
        o.status !== "Selesai" &&
        !o.deleted_at,
    )
    .sort(
      (a, b) =>
        (a.tanggal_masuk || "").localeCompare(b.tanggal_masuk || "") ||
        (a.created_at || "").localeCompare(b.created_at || ""),
    );
}

/** Order Manual yang belum menerbitkan Approval, jadi durasinya belum bisa ditanyakan. */
export function jumlahMenungguApproval(orders: Order[]): number {
  return orders.filter(
    (o) =>
      perluJadwalMeja(o) &&
      !sudahApproval(o) &&
      !jadwalOf(o) &&
      o.status !== "Selesai" &&
      !o.deleted_at,
  ).length;
}

export type KondisiHari = "kosong" | "gabung" | "penuh";

/**
 * Kondisi satu hari bila order `exceptId` naik meja di hari itu.
 * Hari berisi order lain hanya aman bila order ini dan semua penghuninya bisa digabung.
 */
export function kondisiHari(
  orders: Order[],
  day: Date,
  gabung: boolean,
  exceptId?: string,
): { kondisi: KondisiHari; order: number; pcs: number } {
  const penghuni = orders.filter((o) => {
    if (o.id === exceptId) return false;
    const j = jadwalOf(o);
    return !!j && menyentuhHari(j, day);
  });
  const pcs = penghuni.reduce((n, o) => n + (Number(o.jumlah) || 0), 0);
  if (penghuni.length === 0) return { kondisi: "kosong", order: 0, pcs: 0 };
  const aman = gabung && penghuni.every((o) => o.meja_gabung === true);
  return { kondisi: aman ? "gabung" : "penuh", order: penghuni.length, pcs };
}

/** Order lain yang bertumpuk dengan rentang ini padahal salah satu pihak tidak bisa digabung. */
export function bentrokJadwal(
  orders: Order[],
  mulai: Date,
  durasi: number,
  gabung: boolean,
  exceptId?: string,
): Order[] {
  const selesai = estimasiSelesai(mulai, durasi);
  return orders.filter((o) => {
    if (o.id === exceptId) return false;
    const j = jadwalOf(o);
    if (!j || !adaDiRentang(j, startOfDay(mulai), selesai)) return false;
    return !(gabung && o.meja_gabung === true);
  });
}

export function tglIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
