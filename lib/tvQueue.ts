// lib/tvQueue.ts
//
// Logika untuk tampilan TV antrian produksi (/tv).
// Aturan urutan SAMA PERSIS dengan sortByUrgency() di OrderList.tsx,
// jadi urutan di TV = urutan di daftar Pesanan Aktif. Pesanan Merchandise ikut tampil
// di antrian TV (tahap dihitung dari steps_merchandise, tanpa packing).

import type { Order } from "@/types";
import { getDeadlineStatus, getOrderSteps, orderNeedsPacking } from "@/lib/utils";

// ─── Tipe data yang dibutuhkan TV (hanya kolom yang perlu di-select) ─────────

export type TVOrder = Pick<
  Order,
  | "id"
  | "kode_produksi"
  | "nama_pemesan"
  | "jumlah"
  | "jenis_produksi"
  | "status"
  | "tanggal_masuk"
  | "deadline"
  | "link_approval"
  | "steps_manual"
  | "steps_dtf"
  | "steps_merchandise"
  | "jenis_merchandise"
  | "varian_merchandise"
  | "finishing_qc"
  | "finishing_packing"
  | "shipping"
  | "kendala"
  | "assigned_user"
  | "helper_user"
>;

// ─── Tahap produksi ──────────────────────────────────────────────────────────

export type TVStage = "masuk" | "produksi" | "finishing" | "kirim" | "selesai";

// Urutan tahap yang ditampilkan sebagai progress di TV.
export const TV_STAGES: { key: Exclude<TVStage, "selesai">; label: string }[] = [
  { key: "masuk", label: "Baru masuk" },
  { key: "produksi", label: "Produksi" },
  { key: "finishing", label: "Finishing" },
  { key: "kirim", label: "Pengiriman" },
];

/**
 * Tahap DIHITUNG dari data order (bukan dari kolom `status`), memakai logika
 * yang sama dengan checkAutoStatus() di useOrders.ts. Alasannya: kolom
 * `status` bisa tertimpa "Ada Kendala" atau "Telat", padahal di TV kita tetap
 * ingin tahu order itu sebenarnya sedang di tahap mana.
 */
export function getStage(o: TVOrder): TVStage {
  // Manual / DTF / Merchandise dipilih lewat helper (sama dengan checkAutoStatus).
  const steps = getOrderSteps(o);
  const productionDone = steps.length > 0 && steps.every((s) => s.isCompleted);

  if (!o.link_approval?.link) return "masuk";
  if (!productionDone) return "produksi";
  if (!o.finishing_qc?.isPassed || (orderNeedsPacking(o) && !o.finishing_packing?.isPacked))
    return "finishing";
  if (!o.shipping?.bukti_terima) return "kirim";
  return "selesai";
}

export function getStageIndex(stage: TVStage): number {
  const i = TV_STAGES.findIndex((s) => s.key === stage);
  return i === -1 ? TV_STAGES.length : i;
}

// ─── Penanda tambahan ────────────────────────────────────────────────────────

export function hasOpenKendala(o: TVOrder): boolean {
  return Array.isArray(o.kendala) && o.kendala.some((k) => !k.isResolved);
}

export function isRevisi(o: TVOrder): boolean {
  return o.finishing_qc?.isPassed === false && !!o.finishing_qc?.notes;
}

export function isOverdue(o: TVOrder): boolean {
  return o.status === "Telat" || getDeadlineStatus(o.deadline, o.status) === "overdue";
}

/** Selisih hari deadline dari hari ini (negatif = sudah lewat). */
export function daysToDeadline(deadline: string): number {
  const d = new Date(deadline);
  d.setHours(0, 0, 0, 0);
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / 86_400_000);
}

// ─── Antrian: filter + urutan ────────────────────────────────────────────────

/** Order selesai tidak tampil lagi di TV. */
export function isInQueue(o: TVOrder): boolean {
  return o.status !== "Selesai" && getStage(o) !== "selesai";
}

// Sama dengan sortByUrgency() di OrderList.tsx
export function sortByUrgency<T extends TVOrder>(orders: T[]): T[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const H3 = 3 * 24 * 60 * 60 * 1000;

  const getTier = (order: T): number => {
    if (isOverdue(order)) return 0;
    const deadline = new Date(order.deadline);
    deadline.setHours(0, 0, 0, 0);
    if (deadline.getTime() - now.getTime() <= H3) return 1;
    return 2;
  };

  return [...orders].sort((a, b) => {
    const tierA = getTier(a);
    const tierB = getTier(b);
    if (tierA !== tierB) return tierA - tierB;
    if (tierA === 0 || tierA === 1)
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    return new Date(a.tanggal_masuk).getTime() - new Date(b.tanggal_masuk).getTime();
  });
}

export function buildQueue(orders: TVOrder[]): TVOrder[] {
  return sortByUrgency(orders.filter(isInQueue));
}

// ─── Halaman (auto-geser) ────────────────────────────────────────────────────

/** Jumlah halaman. 24 order & 10 per layar → 3 halaman (10 + 10 + 4). */
export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage));
}

export function sliceForPage<T>(items: T[], page: number, perPage: number): T[] {
  return items.slice(page * perPage, page * perPage + perPage);
}

// ─── Tanggal awal bulan (untuk hitung "masuk bulan ini") ─────────────────────

const pad = (n: number) => String(n).padStart(2, "0");

/** Kembalikan [awalBulanIni, awalBulanDepan] format YYYY-MM-DD (waktu lokal). */
export function monthRange(now = new Date()): [string, string] {
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = `${y}-${pad(m + 1)}-01`;
  const ny = m === 11 ? y + 1 : y;
  const nm = m === 11 ? 1 : m + 2;
  return [start, `${ny}-${pad(nm)}-01`];
}