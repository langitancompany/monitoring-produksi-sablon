// lib/orderProgress.ts
//
// Progres tahap pesanan untuk bar di daftar pesanan (OrderList).
// Sablon menyimpan tahap di beberapa tempat (link_approval, steps_*, finishing_qc,
// finishing_packing, shipping), jadi di sini semuanya disusun jadi satu daftar urut:
//   Approval → langkah produksi (manual / DTF / merchandise) → QC → Packing → Pengiriman → Penerimaan
// Packing dilewati untuk merchandise (lihat orderNeedsPacking). Alur ini sama dengan
// yang dipakai halaman tracking pelanggan (app/tracking/TrackingTimeline.tsx).

import type { Order } from "@/types";
import { getOrderSteps, orderNeedsPacking } from "@/lib/utils";

export interface OrderMilestone {
  name: string;
  done: boolean;
}

export function orderMilestones(order: Order): OrderMilestone[] {
  const list: OrderMilestone[] = [
    { name: "Approval", done: !!order.link_approval?.link },
    ...getOrderSteps(order).map((s) => ({ name: s.name, done: s.isCompleted })),
    { name: "QC", done: !!order.finishing_qc?.isPassed },
  ];
  if (orderNeedsPacking(order)) {
    list.push({ name: "Packing", done: !!order.finishing_packing?.isPacked });
  }
  list.push(
    { name: "Pengiriman", done: !!order.shipping?.bukti_kirim },
    { name: "Penerimaan", done: !!order.shipping?.bukti_terima },
  );
  return list;
}

/** Persentase tahap yang sudah selesai (0–100). Status "Selesai" selalu 100. */
export function orderProgress(order: Order): number {
  if (order.status === "Selesai") return 100;
  const list = orderMilestones(order);
  return Math.round((list.filter((m) => m.done).length / list.length) * 100);
}

/** Nama tahap yang sedang dikerjakan (tahap pertama yang belum selesai). */
export function orderActiveStage(order: Order): string {
  if (order.status === "Selesai") return "Selesai";
  return orderMilestones(order).find((m) => !m.done)?.name ?? "Selesai";
}