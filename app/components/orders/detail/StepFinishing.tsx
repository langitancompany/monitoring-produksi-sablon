// app/components/orders/detail/StepFinishing.tsx
import React from "react";
import { Order, UserData } from "@/types";
import {
  AlertTriangle,
  Camera,
  CheckCircle,
  Eye,
  Loader2,
  Package,
  Trash2,
} from "lucide-react";
import ProductionNotes from "./ProductionNotes";

interface StepFinishingProps {
  order: Order;
  currentUser: UserData;
  isRevisi: boolean;
  canCheckQC: boolean;
  canUpdatePacking: boolean;
  canUpdateShipping: boolean;
  canResetQC: boolean;
  canDeleteFinishingFile: boolean;
  /** false = tanpa tahap packing (pesanan merchandise): hanya QC, lalu Pengiriman. */
  showPacking?: boolean;
  qcNote: string;
  setQcNote: (v: string) => void;
  loadingAction: string | null; // ── TAMBAHAN ──
  onQC: (pass: boolean) => void | Promise<void>;
  onDeleteQC: () => void;
  onRevisiSelesai: () => void;
  onTriggerUpload: (type: string) => void;
  onFileDelete: (field: string) => void;
}

export default function StepFinishing({
  order,
  currentUser,
  isRevisi,
  canCheckQC,
  canUpdatePacking,
  canUpdateShipping,
  canResetQC,
  canDeleteFinishingFile,
  showPacking = true,
  qcNote,
  setQcNote,
  loadingAction,
  onQC,
  onDeleteQC,
  onRevisiSelesai,
  onTriggerUpload,
  onFileDelete,
}: StepFinishingProps) {
  return (
    <>
      {/* --- STEP 3: QC & PACKING --- */}
      <div className="bg-white dark:bg-zinc-950 p-5 md:p-6 rounded-xl border border-zinc-200 dark:border-zinc-800">
        <h3 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
          <span className="font-mono tabular-nums text-[10px] text-zinc-400 dark:text-zinc-500">
            03
          </span>
          {showPacking ? "QC & Packing" : "Quality Control"}
        </h3>

        <div
          className={`grid grid-cols-1 gap-4 md:gap-6 ${showPacking ? "md:grid-cols-2" : ""}`}
        >
          {/* KIRI: QC */}
          <div className="flex flex-col border border-zinc-200 dark:border-zinc-800 rounded-md p-4">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-3">
              Quality Control
            </span>

            {isRevisi && order.finishing_qc.notes && (
              <div className="border-l-2 border-red-600 pl-3 py-1 mb-4">
                <p className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Alasan Revisi:
                </p>
                <p className="text-xs text-zinc-700 dark:text-zinc-300 italic">
                  "{order.finishing_qc.notes}"
                </p>
              </div>
            )}

            {isRevisi && canCheckQC && (
              <button
                onClick={onRevisiSelesai}
                className="w-full bg-white dark:bg-zinc-900 border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 py-3 rounded-md font-semibold text-xs uppercase hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors duration-150 mb-4"
              >
                Konfirmasi Revisi Selesai
              </button>
            )}

            {order.finishing_qc.isPassed ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-1.5 py-6 rounded-md bg-emerald-50 dark:bg-emerald-900/10 text-center min-h-[140px]">
                <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                <h4 className="font-semibold text-emerald-600 dark:text-emerald-400 text-sm uppercase tracking-wide">
                  Lolos QC
                </h4>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  Oleh: {order.finishing_qc.checkedBy}
                </p>
                {canResetQC && (
                  <button
                    onClick={onDeleteQC}
                    className="text-zinc-400 hover:text-red-600 dark:hover:text-red-400 text-[10px] mt-3 hover:underline transition-colors duration-150"
                  >
                    Reset
                  </button>
                )}
              </div>
            ) : canCheckQC ? (
              <div className="flex-1 flex flex-col">
                <textarea
                  placeholder="Catatan QC (Wajib jika revisi)..."
                  className="w-full text-sm p-3 text-zinc-900 dark:text-zinc-100 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md outline-none transition-colors duration-150 mb-3 resize-none h-28"
                  value={qcNote}
                  onChange={(e) => setQcNote(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-3 mt-auto">
                  <button
                    onClick={() => onQC(false)}
                    disabled={!qcNote.trim() || loadingAction !== null}
                    className="bg-white dark:bg-zinc-900 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 py-2.5 rounded-md font-semibold text-xs hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 flex items-center justify-center gap-2"
                  >
                    {loadingAction === "qc-revisi" ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />{" "}
                        Memproses...
                      </>
                    ) : (
                      "Revisi"
                    )}
                  </button>
                  <button
                    onClick={() => onQC(true)}
                    disabled={loadingAction !== null}
                    className="bg-[#124540] text-white py-2.5 rounded-md font-semibold text-xs hover:bg-[#0d332f] disabled:opacity-70 disabled:cursor-not-allowed transition-colors duration-150 flex items-center justify-center gap-2"
                  >
                    {loadingAction === "qc-pass" ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />{" "}
                        Memproses...
                      </>
                    ) : (
                      "Lolos QC"
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center py-6 min-h-[140px]">
                <span className="text-xs text-zinc-400 dark:text-zinc-600 italic">
                  {!isRevisi ? "Menunggu produksi selesai..." : "Sedang Revisi"}
                </span>
              </div>
            )}
          </div>

          {/* KANAN: PACKING (tidak untuk merchandise) */}
          {showPacking && (
          <div className="flex flex-col border border-zinc-200 dark:border-zinc-800 rounded-md p-4">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-3">
              Packing
            </span>

            {order.finishing_packing.isPacked ? (
              <div className="flex-1 flex flex-col min-h-[140px]">
                {order.finishing_packing.fileUrl ? (
                  <div className="relative w-full h-28 mb-3 rounded-md overflow-hidden border border-zinc-200 dark:border-zinc-800 group">
                    <img
                      src={order.finishing_packing.fileUrl}
                      alt="Packing"
                      className="w-full h-full object-cover"
                    />
                    <a
                      href={order.finishing_packing.fileUrl}
                      target="_blank"
                      className="absolute inset-0 bg-black/40 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-colors duration-150 font-semibold text-xs"
                    >
                      <Eye className="w-4 h-4 mr-1" /> Lihat
                    </a>
                  </div>
                ) : (
                  <div className="flex justify-center mb-3 py-4">
                    <Package className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 mt-auto">
                  <div className="flex items-center gap-1.5 pl-2 border-l-2 border-emerald-600">
                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                      Selesai
                    </span>
                  </div>
                  {canDeleteFinishingFile && (
                    <button
                      onClick={() => onFileDelete("packing")}
                      className="flex items-center gap-1 text-[10px] font-semibold text-zinc-400 hover:text-red-600 dark:hover:text-red-400 px-1.5 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors duration-150"
                    >
                      <Trash2 className="w-3 h-3" /> Hapus
                    </button>
                  )}
                </div>
                {order.finishing_packing.packedBy && (
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-2">
                    Di-pack oleh:{" "}
                    <span className="font-semibold text-zinc-600 dark:text-zinc-300">
                      {order.finishing_packing.packedBy}
                    </span>
                    {order.finishing_packing.timestamp && (
                      <span className="font-mono tabular-nums">
                        {" "}
                        ·{" "}
                        {new Date(
                          order.finishing_packing.timestamp,
                        ).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    )}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center min-h-[140px]">
                {canUpdatePacking ? (
                  <button
                    onClick={() => onTriggerUpload("packing")}
                    className="bg-[#124540] text-white w-full py-4 rounded-md font-semibold text-sm flex flex-col items-center justify-center gap-2 hover:bg-[#0d332f] transition-colors duration-150"
                  >
                    <Camera className="w-5 h-5" />
                    <span>Upload Foto</span>
                  </button>
                ) : (
                  <div className="text-center flex flex-col items-center gap-2">
                    <Package className="w-6 h-6 text-zinc-300 dark:text-zinc-600" />
                    <p className="text-xs text-zinc-400 dark:text-zinc-600 italic">
                      Menunggu QC Lolos
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
          )}
        </div>

        {/* Catatan QC & Finishing — satu thread untuk seluruh Step 3 */}
        <ProductionNotes
          orderId={order.id}
          kodeProduksi={order.kode_produksi}
          namaPemesan={order.nama_pemesan}
          section="finishing"
          currentUser={currentUser}
        />
      </div>

      {/* --- STEP 4: PENGIRIMAN --- */}
      <div className="bg-white dark:bg-zinc-950 p-5 md:p-6 rounded-xl border border-zinc-200 dark:border-zinc-800">
        <h3 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
          <span className="font-mono tabular-nums text-[10px] text-zinc-400 dark:text-zinc-500">
            04
          </span>
          Pengiriman
        </h3>
        <div className="p-4 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50/60 dark:bg-zinc-900/50 space-y-4">
          {/* Bukti Kirim */}
          <div className="flex justify-between items-center">
            <span className="text-xs md:text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Bukti Kirim (Resi)
            </span>
            {order.shipping.bukti_kirim ? (
              <div className="flex gap-2 items-center">
                <a
                  href={order.shipping.bukti_kirim}
                  target="_blank"
                  className="text-emerald-600 dark:text-emerald-400 font-semibold underline text-xs hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors duration-150"
                >
                  Lihat Resi
                </a>
                {canDeleteFinishingFile && (
                  <button
                    onClick={() => onFileDelete("shipping_kirim")}
                    className="text-zinc-400 hover:text-red-600 dark:hover:text-red-400 p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors duration-150"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : canUpdateShipping ? (
              <button
                onClick={() => onTriggerUpload("shipping_kirim")}
                className="text-[10px] md:text-xs bg-[#124540] text-white px-3 py-2 rounded-md font-semibold hover:bg-[#0d332f] transition-colors duration-150"
              >
                Upload Resi
              </button>
            ) : (
              <span className="text-[10px] text-zinc-300 dark:text-zinc-600 italic">
                {showPacking
                  ? "Menunggu pengerjaan & packing selesai..."
                  : "Menunggu QC lolos..."}
              </span>
            )}
          </div>

          {/* Bukti Terima */}
          <div className="flex justify-between items-center border-t border-zinc-200 dark:border-zinc-800 pt-4">
            <span className="text-xs md:text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Bukti Terima (User)
            </span>
            {order.shipping.bukti_terima ? (
              <div className="flex gap-2 items-center">
                <a
                  href={order.shipping.bukti_terima}
                  target="_blank"
                  className="text-orange-600 dark:text-orange-400 font-semibold underline text-xs hover:text-orange-700 dark:hover:text-orange-300 transition-colors duration-150"
                >
                  Lihat Bukti
                </a>
                {canDeleteFinishingFile && (
                  <button
                    onClick={() => onFileDelete("shipping_terima")}
                    className="text-zinc-400 hover:text-red-600 dark:hover:text-red-400 p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors duration-150"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : canUpdateShipping && order.shipping.bukti_kirim ? (
              <button
                onClick={() => onTriggerUpload("shipping_terima")}
                className="text-[10px] md:text-xs bg-[#124540] text-white px-3 py-2 rounded-md font-semibold hover:bg-[#0d332f] transition-colors duration-150"
              >
                Upload Terima
              </button>
            ) : (
              <span className="text-[10px] text-zinc-300 dark:text-zinc-600 italic">
                -
              </span>
            )}
          </div>
        </div>

        {/* Catatan Pengiriman */}
        <ProductionNotes
          orderId={order.id}
          kodeProduksi={order.kode_produksi}
          namaPemesan={order.nama_pemesan}
          section="pengiriman"
          currentUser={currentUser}
        />
      </div>
    </>
  );
}
