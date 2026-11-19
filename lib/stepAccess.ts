// lib/stepAccess.ts
//
// Aturan siapa & kapan sebuah tahap pesanan boleh diisi. Dipakai oleh tampilan
// (OrderDetail, StepProduksi, StepFinishing) dan oleh handler (useOrderDetail,
// useUpload), supaya tombol yang disembunyikan di layar juga tidak bisa ditembus
// lewat handler.
//
// Rantai tahap: Approval → step produksi → QC → Packing → Kirim → Terima
// (Packing dilewati untuk merchandise).
//
// 1. URUTAN (berlaku untuk SEMUA role, termasuk super admin):
//    Sebuah tahap baru bisa diisi setelah tahap sebelumnya selesai. Tahap yang
//    sudah selesai tidak bisa dibatalkan/dihapus selama tahap sesudahnya sudah
//    dikerjakan.
// 2. KEPEMILIKAN:
//    - Step produksi: bila pesanan punya PJ / Helper, hanya mereka yang boleh.
//      Pesanan tanpa PJ/Helper (mis. DTF, dikerjakan tim tetap) tidak dibatasi.
//    - QC, Packing, Pengiriman: hanya tim QC/Finishing (role "qc").
//    Admin, Manager, dan Super Admin tetap boleh sebagai pengawas, tetapi tetap
//    terikat aturan urutan di atas.

import type { Order, UserData } from "@/types";
import { getOrderSteps, orderNeedsPacking } from "@/lib/utils";
import { hasRole } from "@/lib/roles";

const MANAGEMENT_ROLES = ["admin", "manager", "super_admin"];

/** Alasan step belum boleh diisi karena urutan, atau null bila boleh. */
export function getStepSequenceBlock(order: Order, stepId: string): string | null {
  const steps = getOrderSteps(order);
  const idx = steps.findIndex((s) => s.id === stepId);
  if (idx < 0) return null;

  if (!order.link_approval?.link) {
    return "Upload mockup approval terlebih dahulu";
  }
  const belumSelesai = steps.slice(0, idx).find((s) => !s.isCompleted);
  if (belumSelesai) {
    return `Selesaikan "${belumSelesai.name}" terlebih dahulu`;
  }
  return null;
}

/** True bila tahap setelah produksi (QC lolos, packing, resi) sudah dikerjakan. */
export function hasFinishingStarted(order: Order): boolean {
  return (
    !!order.finishing_qc?.isPassed ||
    !!order.finishing_packing?.isPacked ||
    !!order.shipping?.bukti_kirim ||
    !!order.shipping?.bukti_terima
  );
}

/**
 * True bila ada yang sudah dikerjakan SESUDAH stepId: step berikutnya (selesai
 * atau sudah punya file) atau tahap QC/packing/pengiriman.
 */
export function hasLaterStepStarted(order: Order, stepId: string): boolean {
  const steps = getOrderSteps(order);
  const idx = steps.findIndex((s) => s.id === stepId);
  if (idx < 0) return false;
  return (
    steps.slice(idx + 1).some((s) => s.isCompleted || !!s.fileUrl) ||
    hasFinishingStarted(order)
  );
}

/** True bila ada step produksi yang sudah selesai atau sudah punya file. */
export function hasProductionStarted(order: Order): boolean {
  return (
    getOrderSteps(order).some((s) => s.isCompleted || !!s.fileUrl) ||
    hasFinishingStarted(order)
  );
}

/**
 * Apakah user ini "bagian" dari pesanan: PJ atau Helper-nya. Pesanan tanpa
 * PJ/Helper dianggap terbuka untuk semua yang punya izin produksi.
 */
export function isOrderTeamMember(
  order: Order,
  user: Pick<UserData, "id" | "role" | "roles">,
): boolean {
  if (MANAGEMENT_ROLES.includes(user.role)) return true;
  if (!order.assigned_to && !order.helper_id) return true;
  return order.assigned_to === user.id || order.helper_id === user.id;
}

/** Alasan user tidak boleh mengisi step pesanan ini (kepemilikan), atau null. */
export function getStepOwnershipBlock(
  order: Order,
  user: Pick<UserData, "id" | "role" | "roles">,
): string | null {
  return isOrderTeamMember(order, user)
    ? null
    : "Step ini hanya bisa diisi oleh PJ atau Helper pesanan";
}

/** Gabungan urutan + kepemilikan untuk satu step. Dipakai handler sebelum menulis. */
export function getStepBlock(
  order: Order,
  user: Pick<UserData, "id" | "role" | "roles">,
  stepId: string,
): string | null {
  return getStepOwnershipBlock(order, user) ?? getStepSequenceBlock(order, stepId);
}


// ─── QC, Packing, Pengiriman ─────────────────────────────────────────────────

const isManagement = (user: Pick<UserData, "role">) =>
  MANAGEMENT_ROLES.includes(user.role);

/** Tim QC/Finishing = user ber-role "qc" (satu tim: QC + finishing + packing). */
export function getFinishingOwnershipBlock(
  user: Pick<UserData, "id" | "role" | "roles">,
): string | null {
  if (isManagement(user) || hasRole(user, "qc")) return null;
  return "Tahap ini hanya bisa dikerjakan oleh tim QC/Finishing";
}

export function isProductionDone(order: Order): boolean {
  const steps = getOrderSteps(order);
  return steps.length > 0 && steps.every((s) => s.isCompleted);
}

/** Alasan QC belum boleh diisi (lolos / revisi / konfirmasi revisi), atau null. */
export function getQcBlock(
  order: Order,
  user: Pick<UserData, "id" | "role" | "roles">,
): string | null {
  const own = getFinishingOwnershipBlock(user);
  if (own) return own;
  if (!order.link_approval?.link) return "Upload mockup approval terlebih dahulu";
  if (!isProductionDone(order)) return "Menunggu semua step produksi selesai";
  return null;
}

/** Alasan packing belum boleh diisi, atau null. */
export function getPackingBlock(
  order: Order,
  user: Pick<UserData, "id" | "role" | "roles">,
): string | null {
  if (!orderNeedsPacking(order)) return "Pesanan ini tidak memiliki tahap packing";
  const own = getFinishingOwnershipBlock(user);
  if (own) return own;
  if (!order.finishing_qc?.isPassed) return "Menunggu QC lolos";
  return null;
}

/** Alasan bukti kirim / bukti terima belum boleh diisi, atau null. */
export function getShippingBlock(
  order: Order,
  user: Pick<UserData, "id" | "role" | "roles">,
  kind: "kirim" | "terima",
): string | null {
  const own = getFinishingOwnershipBlock(user);
  if (own) return own;
  if (!order.finishing_qc?.isPassed) return "Menunggu QC lolos";
  if (orderNeedsPacking(order) && !order.finishing_packing?.isPacked) {
    return "Menunggu packing selesai";
  }
  if (kind === "terima" && !order.shipping?.bukti_kirim) {
    return "Menunggu bukti kirim (resi)";
  }
  return null;
}

/** Alasan QC belum boleh di-reset, atau null. */
export function getQcResetBlock(order: Order): string | null {
  if (order.finishing_packing?.isPacked) return "Hapus packing terlebih dahulu";
  if (order.shipping?.bukti_kirim || order.shipping?.bukti_terima) {
    return "Hapus bukti pengiriman terlebih dahulu";
  }
  return null;
}

/** Alasan field file finishing belum boleh dihapus, atau null. */
export function getFinishingDeleteBlock(
  order: Order,
  field: "packing" | "shipping_kirim" | "shipping_terima",
): string | null {
  if (field === "packing" && (order.shipping?.bukti_kirim || order.shipping?.bukti_terima)) {
    return "Hapus bukti pengiriman terlebih dahulu";
  }
  if (field === "shipping_kirim" && order.shipping?.bukti_terima) {
    return "Hapus bukti terima terlebih dahulu";
  }
  return null;
}

/** Pemeriksa tunggal untuk upload (dipakai useUpload). */
export function getUploadBlock(
  order: Order,
  user: Pick<UserData, "id" | "role" | "roles">,
  type: string,
  stepId?: string,
): string | null {
  switch (type) {
    case "step":
      return stepId ? getStepBlock(order, user, stepId) : null;
    case "packing":
      return getPackingBlock(order, user);
    case "shipping_kirim":
      return getShippingBlock(order, user, "kirim");
    case "shipping_terima":
      return getShippingBlock(order, user, "terima");
    default:
      return null;
  }
}
