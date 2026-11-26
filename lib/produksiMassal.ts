// Langkah Produksi Massal: dimulai dengan tombol Mulai, selesai dengan upload foto.
// Durasi pengerjaan = waktu selesai dikurangi waktu mulai.

import type { ProductionStep } from "@/types";

export const isProduksiMassalStep = (s?: { name?: string | null } | null): boolean =>
  /produksi\s*massal/i.test(s?.name ?? "");

export type FaseProduksiMassal = "belum" | "berjalan" | "selesai";

export function fasePM(s: Pick<ProductionStep, "isCompleted" | "mulaiAt">): FaseProduksiMassal {
  if (s.isCompleted) return "selesai";
  return s.mulaiAt ? "berjalan" : "belum";
}

/** Lama pengerjaan dalam milidetik, atau null bila belum mulai atau data waktu tidak lengkap. */
export function durasiMs(
  s: Pick<ProductionStep, "mulaiAt" | "completedAt">,
  sekarang?: Date,
): number | null {
  if (!s.mulaiAt) return null;
  const awal = Date.parse(s.mulaiAt);
  const akhir = s.completedAt ? Date.parse(s.completedAt) : sekarang?.getTime();
  if (isNaN(awal) || akhir === undefined || isNaN(akhir)) return null;
  return Math.max(0, akhir - awal);
}

/** "kurang dari 1 menit", "45 menit", "5 jam 20 menit", "2 hari 3 jam". */
export function formatDurasi(ms: number): string {
  const menit = Math.floor(ms / 60000);
  if (menit < 1) return "kurang dari 1 menit";
  if (menit < 60) return `${menit} menit`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) {
    const sisa = menit % 60;
    return sisa ? `${jam} jam ${sisa} menit` : `${jam} jam`;
  }
  const hari = Math.floor(jam / 24);
  const sisaJam = jam % 24;
  return sisaJam ? `${hari} hari ${sisaJam} jam` : `${hari} hari`;
}
