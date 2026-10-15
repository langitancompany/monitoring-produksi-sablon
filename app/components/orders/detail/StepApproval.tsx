// app/components/orders/detail/StepApproval.tsx

import React from "react";
import { Order } from "@/types";
import { Eye, Image as ImageIcon, Trash2, Upload } from "lucide-react";

interface StepApprovalProps {
  order: Order;
  canUploadApproval: boolean;
  canDeleteApprovalFile: boolean;
  /** false = tanpa Form Approval otomatis (pesanan merchandise): cukup upload & lihat mockup. */
  showApprovalForm?: boolean;
  onTriggerUpload: (type: string) => void;
  onFileDelete: (field: string) => void;
}

export default function StepApproval({
  order,
  canUploadApproval,
  canDeleteApprovalFile,
  showApprovalForm = true,
  onTriggerUpload,
  onFileDelete,
}: StepApprovalProps) {
  return (
    <div className="bg-white dark:bg-zinc-950 p-5 md:p-6 rounded-xl border border-zinc-200 dark:border-zinc-800">
      <h3 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
        <span className="font-mono tabular-nums text-[10px] text-zinc-400 dark:text-zinc-500">
          01
        </span>
        Approval Desain
      </h3>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4 last:border-0 gap-3">
        <div>
          {order.link_approval?.link ? (
            <>
              <div className="font-semibold text-sm md:text-base text-zinc-900 dark:text-zinc-200">
                {showApprovalForm
                  ? "Mockup Terupload — Form Approval Siap"
                  : "Mockup Terupload"}
              </div>
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                Oleh: {order.link_approval.by} | {order.link_approval.timestamp}
              </div>
              <div className="flex items-center gap-4 mt-1">
                {showApprovalForm && (
                  <a
                    href={`/approval/${order.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1 hover:underline"
                  >
                    <Eye className="w-3.5 h-3.5" /> Lihat Form Approval
                  </a>
                )}
                <a
                  href={order.link_approval.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-zinc-500 dark:text-zinc-400 font-semibold flex items-center gap-1 hover:underline"
                >
                  <ImageIcon className="w-3.5 h-3.5" /> Lihat Mockup
                </a>
              </div>
            </>
          ) : (
            <>
              <div className="font-semibold text-sm md:text-base text-zinc-400 dark:text-zinc-600">
                Mockup Desain
              </div>
              <div className="text-[10px] text-zinc-400 dark:text-zinc-600 italic">
                {showApprovalForm
                  ? "Upload mockup, form approval akan dibuat otomatis..."
                  : "Upload mockup desain yang sudah disetujui customer..."}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {order.link_approval?.link ? (
            <>
              <div className="flex items-center gap-1.5 pl-2 border-l-2 border-emerald-600">
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                  Selesai
                </span>
              </div>
              {canDeleteApprovalFile && (
                <button
                  onClick={() => onFileDelete("approval")}
                  className="text-red-400 hover:text-red-600 transition-colors duration-150 ml-1 p-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </>
          ) : (
            canUploadApproval && (
              <button
                onClick={() => onTriggerUpload("approval")}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-2 rounded-md text-xs font-semibold text-zinc-600 dark:text-zinc-300 flex items-center justify-center gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors duration-150 w-full sm:w-auto"
              >
                <Upload className="w-4 h-4" /> Upload Mockup
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
