// app/components/orders/detail/StepProduksi.tsx

import React from "react";
import { Order, UserData } from "@/types";
import {
  AlertTriangle,
  Camera,
  Eye,
  Loader2,
  MessageSquare,
  Send,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Upload,
  Clock,
  User,
} from "lucide-react";
import ProductionNotes from "./ProductionNotes";
import { getOrderSteps, isMerchandiseOrder } from "@/lib/utils";

interface StepProduksiProps {
  order: Order;
  currentUser: UserData;
  canUpdateStep: boolean;
  isSupervisor: boolean;
  isManagement: boolean;
  kendalaNote: string;
  setKendalaNote: (v: string) => void;
  showKendalaForm: boolean;
  setShowKendalaForm: (v: boolean) => void;
  proofingRevisiNote: string;
  setProofingRevisiNote: (v: string) => void;
  proofingStepId: string | null;
  setProofingStepId: (v: string | null) => void;
  loadingAction: string | null; // ── TAMBAHAN ──
  onTriggerUpload: (type: string, stepId?: string) => void;
  onStatusStep: (stepId: string) => void | Promise<void>;
  onSaveProofingRevisi: () => void | Promise<void>;
  onAddKendala: () => void;
  onResolveKendala: (id: string) => void;
  onDeleteKendala: (id: string) => void;
  onFileDelete: (field: string, isStep?: boolean, stepId?: string) => void;
}

export default function StepProduksi({
  order,
  currentUser,
  canUpdateStep,
  isSupervisor,
  isManagement,
  kendalaNote,
  setKendalaNote,
  showKendalaForm,
  setShowKendalaForm,
  proofingRevisiNote,
  setProofingRevisiNote,
  proofingStepId,
  setProofingStepId,
  loadingAction,
  onTriggerUpload,
  onStatusStep,
  onSaveProofingRevisi,
  onAddKendala,
  onResolveKendala,
  onDeleteKendala,
  onFileDelete,
}: StepProduksiProps) {
  // Manual / DTF / Merchandise dipilih otomatis dari jenis produksi pesanan.
  const currentSteps = getOrderSteps(order);
  // Merchandise: langkah dikerjakan berurutan (cetak dulu, baru produksi).
  const isMerchandise = isMerchandiseOrder(order);

  return (
    <div className="bg-white dark:bg-zinc-950 p-5 md:p-6 rounded-xl border border-zinc-200 dark:border-zinc-800">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <span className="font-mono tabular-nums text-[10px] text-zinc-400 dark:text-zinc-500">
            02
          </span>
          Produksi ({order.jenis_produksi})
        </h3>
        {canUpdateStep && (
          <button
            onClick={() => setShowKendalaForm(!showKendalaForm)}
            className="text-xs bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors duration-150"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {showKendalaForm ? "Tutup Laporan" : "Lapor Kendala"}
          </button>
        )}
      </div>

      {/* Form Kendala */}
      {showKendalaForm && (
        <div className="mb-6 p-4 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
          <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-400 uppercase mb-2">
            Form Laporan Kendala
          </h4>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Tulis detail kendala"
              className="flex-1 text-sm px-3 py-2 text-zinc-900 dark:text-zinc-100 border border-zinc-300 dark:border-zinc-700 rounded-md outline-none focus:border-[#124540] dark:bg-zinc-950 transition-colors duration-150"
              value={kendalaNote}
              onChange={(e) => setKendalaNote(e.target.value)}
            />
            <button
              onClick={onAddKendala}
              disabled={!kendalaNote.trim()}
              className="bg-[#124540] text-white px-4 py-2 rounded-md font-semibold text-xs hover:bg-[#0d332f] disabled:opacity-50 flex items-center gap-2 transition-colors duration-150"
            >
              <Send className="w-3 h-3" /> Kirim
            </button>
          </div>
        </div>
      )}

      {/* List Kendala Aktif */}
      {order.kendala && order.kendala.some((k) => !k.isResolved) && (
        <div className="mb-6 space-y-3">
          {order.kendala
            .filter((k) => !k.isResolved)
            .map((k) => (
              <div
                key={k.id}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 md:p-4 flex flex-col sm:flex-row gap-3"
              >
                <div className="flex items-start gap-3 flex-1 border-l-2 border-orange-600 pl-3">
                  <div>
                    <p className="font-semibold text-zinc-900 dark:text-zinc-200 text-sm mb-1">
                      {k.notes}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-[10px] text-zinc-500 dark:text-zinc-400">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" /> {k.reportedBy}
                      </span>
                      <span className="flex items-center gap-1 font-mono tabular-nums">
                        <Clock className="w-3 h-3" /> {k.timestamp}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 w-full sm:w-auto border-t sm:border-t-0 border-zinc-200 dark:border-zinc-800 pt-2 sm:pt-0 mt-1 sm:mt-0">
                  {canUpdateStep && (
                    <button
                      onClick={() => onResolveKendala(k.id)}
                      className="bg-emerald-600 text-white text-[10px] px-3 py-1.5 rounded-full font-semibold hover:bg-emerald-700 transition-colors duration-150 whitespace-nowrap"
                    >
                      Selesaikan
                    </button>
                  )}
                  {isSupervisor && (
                    <button
                      onClick={() => onDeleteKendala(k.id)}
                      className="text-zinc-400 hover:text-red-500 p-1.5 rounded-md transition-colors duration-150"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* List Steps */}
      <div className="space-y-4">
        {currentSteps.map((s, stepIdx) => {
          const step = s as any;
          // Khusus merchandise: langkah baru bisa ditandai bila langkah sebelumnya sudah selesai,
          // dan langkah yang sudah selesai tidak bisa di-undo bila langkah sesudahnya sudah selesai.
          const isLocked =
            isMerchandise && currentSteps.slice(0, stepIdx).some((p) => !p.isCompleted);
          const hasLaterDone =
            isMerchandise && currentSteps.slice(stepIdx + 1).some((n) => n.isCompleted);
          const isProofingStep = step.name.toLowerCase().includes("proofing");
          const hasFileUploaded = !!step.fileUrl;
          const isStepCompleted = step.isCompleted;
          const hasRevisionNote = step.proofing_note;
          const isInRevisionMode = hasRevisionNote && !isStepCompleted;
          const showProofingActions =
            isProofingStep &&
            hasFileUploaded &&
            !isStepCompleted &&
            isManagement &&
            !isInRevisionMode;
          const isEditingRevisi = proofingStepId === step.id;
          const isBusy = loadingAction !== null;
          const isSavingStep = loadingAction === `step:${step.id}`;

          return (
            <div
              key={step.id}
              className="flex flex-col border-b border-zinc-200 dark:border-zinc-800 pb-4 last:border-0 gap-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1">
                  <div
                    className={`font-semibold text-sm md:text-base ${step.isCompleted ? "text-zinc-900 dark:text-zinc-200" : "text-zinc-400 dark:text-zinc-600"}`}
                  >
                    {step.name}
                  </div>

                  {hasRevisionNote && !step.isCompleted && (
                    <div className="mt-1.5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs px-3 py-2 rounded-md border border-red-100 dark:border-red-900/50 flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold block text-[10px] uppercase">
                          Catatan Revisi:
                        </span>
                        {step.proofing_note}
                      </div>
                    </div>
                  )}

                  {step.isCompleted && (
                    <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono tabular-nums">
                      Oleh: {step.uploadedBy} | {step.timestamp}
                    </div>
                  )}

                  {step.fileUrl && (
                    <a
                      href={step.fileUrl}
                      target="_blank"
                      className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1 mt-1 hover:underline"
                    >
                      <Eye className="w-3.5 h-3.5" /> Lihat Bukti
                    </a>
                  )}
                </div>

                {step.isCompleted ? (
                  <div className="flex items-center gap-2 pl-2 border-l-2 border-emerald-600">
                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                      Selesai
                    </span>
                    {canUpdateStep && !hasLaterDone && (
                      <button
                        onClick={() => onFileDelete("step", true, step.id)}
                        className="text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors duration-150 p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {isProofingStep && isInRevisionMode && canUpdateStep ? (
                      <button
                        onClick={() => onTriggerUpload("step", step.id)}
                        className="bg-orange-600 text-white px-4 py-2 rounded-md text-xs font-semibold flex items-center justify-center gap-2 hover:bg-orange-700 transition-colors duration-150 w-full sm:w-auto"
                      >
                        <Upload className="w-4 h-4" /> Upload Ulang (Revisi)
                      </button>
                    ) : (
                      canUpdateStep &&
                      (showProofingActions ? (
                        <div className="flex gap-2 w-full sm:w-auto">
                          <button
                            onClick={() =>
                              setProofingStepId(
                                isEditingRevisi ? null : step.id,
                              )
                            }
                            disabled={isBusy}
                            className="flex-1 sm:flex-none bg-white dark:bg-zinc-900 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 px-3 py-2 rounded-md text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 flex items-center justify-center gap-1.5"
                          >
                            <ThumbsDown className="w-3.5 h-3.5" /> Revisi
                          </button>
                          <button
                            onClick={() => onStatusStep(step.id)}
                            disabled={isBusy}
                            className="flex-1 sm:flex-none bg-[#124540] text-white px-3 py-2 rounded-md text-xs font-semibold hover:bg-[#0d332f] disabled:opacity-70 disabled:cursor-not-allowed transition-colors duration-150 flex items-center justify-center gap-1.5"
                          >
                            {isSavingStep ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />{" "}
                                Memproses...
                              </>
                            ) : (
                              <>
                                <ThumbsUp className="w-3.5 h-3.5" /> Siap
                                Produksi
                              </>
                            )}
                          </button>
                        </div>
                      ) : step.type === "status_update" ? (
                        <button
                          onClick={() => onStatusStep(step.id)}
                          disabled={isBusy || isLocked}
                          title={
                            isLocked
                              ? "Selesaikan langkah sebelumnya terlebih dahulu"
                              : undefined
                          }
                          className="bg-[#124540] text-white text-xs px-4 py-2 rounded-md font-semibold hover:bg-[#0d332f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 w-full sm:w-auto flex items-center justify-center gap-2"
                        >
                          {isSavingStep ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />{" "}
                              Memproses...
                            </>
                          ) : (
                            // actionLabel: teks tombol khusus per langkah (mis. "Sudah Cetak")
                            (step.actionLabel ?? "Tandai Selesai")
                          )}
                        </button>
                      ) : (
                        <button
                          onClick={() => onTriggerUpload("step", step.id)}
                          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-2 rounded-md text-xs font-semibold text-zinc-600 dark:text-zinc-300 flex items-center justify-center gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors duration-150 w-full sm:w-auto"
                        >
                          <Camera className="w-4 h-4" />{" "}
                          {step.fileUrl ? "Ganti Foto" : "Upload Foto"}
                        </button>
                      ))
                    )}
                  </>
                )}
              </div>

              {/* Form Revisi Proofing */}
              {isEditingRevisi && (
                <div className="mt-2 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-md border border-zinc-200 dark:border-zinc-800">
                  <label className="text-[10px] font-semibold text-zinc-500 uppercase mb-1 block">
                    Catatan Revisi untuk Tim Produksi:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      autoFocus
                      placeholder="Misal: Warna kurang terang, sablon miring..."
                      className="flex-1 text-sm px-3 py-2 text-zinc-900 dark:text-zinc-100 border border-zinc-300 dark:border-zinc-700 rounded-md outline-none focus:border-red-500 dark:bg-zinc-950 transition-colors duration-150"
                      value={proofingRevisiNote}
                      onChange={(e) => setProofingRevisiNote(e.target.value)}
                    />
                    <button
                      onClick={onSaveProofingRevisi}
                      disabled={!proofingRevisiNote.trim() || isBusy}
                      className="bg-red-600 text-white px-4 py-2 rounded-md font-semibold text-xs hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 flex items-center justify-center gap-2"
                    >
                      {loadingAction === "proofing-revisi" ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />{" "}
                          Mengirim...
                        </>
                      ) : (
                        "Kirim"
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ─── Catatan Produksi ─────────────────────────────────────────────── */}
      <ProductionNotes
        orderId={order.id}
        kodeProduksi={order.kode_produksi}
        namaPemesan={order.nama_pemesan}
        section="produksi"
        currentUser={currentUser}
      />
    </div>
  );
}
