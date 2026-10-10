// app/components/orders/OrderDetail.tsx
import React, { useRef, useState } from "react";
import { Order, UserData } from "@/types";
import { toJpeg } from "html-to-image";
import jsPDF from "jspdf";
import { useOrderDetail } from "@/hooks/useOrderDetail";
import LabelPengiriman from "./detail/LabelPengiriman";
import OrderDetailHeader from "./detail/OrderDetailHeader";
import DetailUkuran from "./detail/DetailUkuran";
import DetailGesut from "./detail/DetailGesut"; // ── TAMBAHAN ──
import StepApproval from "./detail/StepApproval";
import StepProduksi from "./detail/StepProduksi";
import StepFinishing from "./detail/StepFinishing";
import OrderFinancePanel from "../finance/OrderFinancePanel";
import { getFinanceCaps } from "@/lib/finance/caps";

interface OrderDetailProps {
  currentUser: UserData;
  order: Order;
  onBack: () => void;
  onEdit: () => void;
  onTriggerUpload: (
    type: string,
    stepId?: string,
    kendalaId?: string,
    label?: string,
  ) => void; // ── UBAH ── + label
  onUpdateOrder: (updatedOrder: Order) => void | Promise<void>; // ── UBAH ── boleh async
  onDelete: (id: string) => void;
  isDeleting?: boolean; // ── TAMBAHAN ──
  onConfirm: (title: string, msg: string, action: () => void) => void;
  writeLog: (params: {
    order: Order;
    category: "STATUS" | "FILE" | "KENDALA" | "QC" | "REVISI" | "SISTEM";
    event: string;
    ket?: string;
    newVal?: string;
    isSystem?: boolean;
    meta?: any;
  }) => Promise<void>; // 🟢 TAMBAHAN — diteruskan ke useOrderDetail supaya
  // log KENDALA/QC/REVISI benar-benar tercatat (lihat useOrderDetail.ts)
}

export default function OrderDetail({
  currentUser,
  order,
  onBack,
  onEdit,
  onTriggerUpload,
  onUpdateOrder,
  onDelete,
  isDeleting = false, // ── TAMBAHAN ──
  onConfirm,
  writeLog, // 🟢 TAMBAHAN
}: OrderDetailProps) {
  const labelRef = useRef<HTMLDivElement>(null);
  const [isPrintingLabel, setIsPrintingLabel] = useState(false);

  // ── PERBAIKAN ── Guard "order tidak ditemukan" TIDAK BOLEH early-return
  // di sini (sebelum hook lain seperti useOrderDetail dipanggil) — itu
  // melanggar Rules of Hooks dan menyebabkan error "Rendered more hooks
  // than during the previous render". Kepastian `order` selalu ada sekarang
  // dijamin dari pemanggilnya (app/page.tsx tidak lagi me-mount OrderDetail
  // kalau order tidak ketemu — lihat komponen OrderNotFound di sana).

  // ─── Hak Akses (struktur baru) ────────────────────────────────────────────
  const isSupervisor = currentUser.role === "supervisor";
  const isManagement = ["admin", "manager", "supervisor"].includes(
    currentUser.role,
  );
  const perms = currentUser.permissions;

  const currentStatus = order.status;
  const jenisProd = order.jenis_produksi?.toLowerCase() || "";
  const isManual = jenisProd === "manual" || jenisProd === "sablon";
  const currentSteps = isManual ? order.steps_manual : order.steps_dtf;
  const isProductionFinished =
    currentSteps &&
    currentSteps.length > 0 &&
    currentSteps.every((s) => s.isCompleted);
  const isRevisi = currentStatus === "Revisi";

  // produksi.edit  → update step & lapor kendala
  // produksi.create → upload approval
  // produksi.delete → hapus file step/approval
  // finishing.edit  → cek QC, update packing, update pengiriman
  // finishing.create → reset QC (aksi "undo")
  // finishing.delete → hapus file finishing
  // harga_pesanan.edit → isi harga, DP, status pembayaran & upload bukti      ── TAMBAHAN ──
  // harga_pesanan.delete → hapus bukti pembayaran                            ── TAMBAHAN ──

  const canUpdateStep =
    isSupervisor ||
    (perms?.produksi?.edit &&
      (currentStatus === "On Process" ||
        currentStatus === "Revisi" ||
        currentStatus === "Ada Kendala"));
  const canCheckQC =
    isSupervisor ||
    (perms?.finishing?.edit &&
      (currentStatus === "Finishing" || isProductionFinished));
  const canUpdatePacking =
    isSupervisor || (perms?.finishing?.edit && order.finishing_qc.isPassed);
  const canUpdateShipping =
    isSupervisor ||
    (perms?.finishing?.edit &&
      (currentStatus === "Kirim" || currentStatus === "Selesai"));
  const canEditOrderInfo = isSupervisor || perms?.orders?.edit;
  const canDeleteOrder = isSupervisor || perms?.orders?.delete;
  const canUploadApproval = isSupervisor || perms?.produksi?.create;
  const canDeleteApprovalFile = isSupervisor || perms?.produksi?.delete;
  const canResetQC = isSupervisor || perms?.finishing?.create;
  const canDeleteFinishingFile = isSupervisor || perms?.finishing?.delete;
  const financeCaps = getFinanceCaps(currentUser);

  // ─── Hook ─────────────────────────────────────────────────────────────────
  const {
    qcNote,
    setQcNote,
    kendalaNote,
    setKendalaNote,
    showKendalaForm,
    setShowKendalaForm,
    proofingRevisiNote,
    setProofingRevisiNote,
    proofingStepId,
    setProofingStepId,
    loadingAction, // ── TAMBAHAN ──
    handleStatusStep,
    handleSaveProofingRevisi,
    handleQC,
    handleDeleteQC,
    handleRevisiSelesai,
    handleAddKendala,
    handleResolveKendala,
    handleDeleteKendala,
    handleFileDelete,
  } = useOrderDetail({
    order,
    currentUser,
    onUpdateOrder,
    onConfirm,
    writeLog,
  });

  // ─── Print Label ──────────────────────────────────────────────────────────
  const handlePrintLabel = async () => {
    if (!labelRef.current) return;
    setIsPrintingLabel(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 150));
      const dataUrl = await toJpeg(labelRef.current, {
        pixelRatio: 2,
        quality: 0.9,
        cacheBust: true,
        backgroundColor: "#ffffff",
      });
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: [165, 107.5],
      });
      pdf.addImage(dataUrl, "JPEG", 0, 0, 165, 107.5);
      const pdfUrl = URL.createObjectURL(pdf.output("blob"));
      window.open(pdfUrl, "_blank");
    } catch (error) {
      console.error("Gagal membuat Label PDF:", error);
      alert("Terjadi kesalahan saat mengekspor Label PDF.");
    } finally {
      setIsPrintingLabel(false);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 pb-24 relative">
      <LabelPengiriman order={order} labelRef={labelRef} />

      <OrderDetailHeader
        order={order}
        currentUser={currentUser}
        isPrintingLabel={isPrintingLabel}
        canEditOrderInfo={!!canEditOrderInfo}
        canDeleteOrder={!!canDeleteOrder}
        isDeleting={isDeleting}
        onBack={onBack}
        onEdit={onEdit}
        onDelete={onDelete}
        onPrintLabel={handlePrintLabel}
      />

      <DetailUkuran
        data={order.detail_ukuran}
        jenisPakaian={order.jenis_pakaian}
      />

      {/* ── TAMBAHAN ── Gesut hanya relevan untuk produksi Manual; DTF pakai
          model finishing+packing agregat per tim, tidak ada input per-order. */}
      {isManual && <DetailGesut data={order.detail_gesut} />}

      <StepApproval
        order={order}
        canUploadApproval={!!canUploadApproval}
        canDeleteApprovalFile={!!canDeleteApprovalFile}
        onTriggerUpload={onTriggerUpload}
        onFileDelete={handleFileDelete}
      />

      <StepProduksi
        order={order}
        currentUser={currentUser}
        isManual={isManual}
        canUpdateStep={!!canUpdateStep}
        isSupervisor={isSupervisor}
        isManagement={isManagement}
        kendalaNote={kendalaNote}
        setKendalaNote={setKendalaNote}
        showKendalaForm={showKendalaForm}
        setShowKendalaForm={setShowKendalaForm}
        proofingRevisiNote={proofingRevisiNote}
        setProofingRevisiNote={setProofingRevisiNote}
        proofingStepId={proofingStepId}
        setProofingStepId={setProofingStepId}
        loadingAction={loadingAction}
        onTriggerUpload={onTriggerUpload}
        onStatusStep={handleStatusStep}
        onSaveProofingRevisi={handleSaveProofingRevisi}
        onAddKendala={handleAddKendala}
        onResolveKendala={handleResolveKendala}
        onDeleteKendala={handleDeleteKendala}
        onFileDelete={handleFileDelete}
      />

      <StepFinishing
        order={order}
        currentUser={currentUser}
        isRevisi={isRevisi}
        canCheckQC={!!canCheckQC}
        canUpdatePacking={!!canUpdatePacking}
        canUpdateShipping={!!canUpdateShipping}
        canResetQC={!!canResetQC}
        canDeleteFinishingFile={!!canDeleteFinishingFile}
        qcNote={qcNote}
        setQcNote={setQcNote}
        loadingAction={loadingAction}
        onQC={handleQC}
        onDeleteQC={handleDeleteQC}
        onRevisiSelesai={handleRevisiSelesai}
        onTriggerUpload={onTriggerUpload}
        onFileDelete={handleFileDelete}
      />

      {/* Harga & Pembayaran: data & aksi lewat server (/api/finance), bukan dari state order */}
      {financeCaps.view && (
        <OrderFinancePanel orderId={order.id} caps={financeCaps} />
      )}
    </div>
  );
}
