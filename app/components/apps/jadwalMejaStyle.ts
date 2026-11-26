import type { Putusan } from "@/lib/mejaProduksi";

// Mundur = merah, tepat = hijau, maju = biru. Tanpa deadline netral.
export const VERDICT_BADGE: Record<Putusan, string> = {
  tepat: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400",
  mundur: "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400",
  maju: "bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-400",
  tanpa_deadline: "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400",
};

export const VERDICT_CHIP: Record<Putusan, string> = {
  tepat: "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300",
  mundur: "border-red-600 bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-300",
  maju: "border-sky-600 bg-sky-50 dark:bg-sky-950/50 text-sky-800 dark:text-sky-300",
  tanpa_deadline: "border-zinc-400 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
};

export const VERDICT_DOT: Record<Putusan, string> = {
  tepat: "bg-emerald-600",
  mundur: "bg-red-600",
  maju: "bg-sky-600",
  tanpa_deadline: "bg-zinc-400",
};
