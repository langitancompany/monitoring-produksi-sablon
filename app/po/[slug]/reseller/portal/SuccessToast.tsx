"use client";

import { useEffect } from "react";
import { MessageCircleMore } from "lucide-react";

interface SuccessToastProps {
  poNumber: string;
  waUrl: string;
  onClose: () => void;
}

export function SuccessToast({ poNumber, waUrl, onClose }: SuccessToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 12000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 inset-x-0 px-4 z-100 flex justify-center animate-slide-up pointer-events-none">
      <div className="bg-[#0e0e0e] w-full max-w-[420px] pointer-events-auto text-white rounded-[14px] shadow-[0_8px_32px_rgba(0,0,0,0.28)] overflow-hidden">
        <div className="h-[3px] bg-[#4ade80]" />
        <div className="p-[16px_18px]">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="flex items-center gap-[7px] mb-1">
                <div className="w-[7px] h-[7px] rounded-full bg-[#4ade80]" />
                <span className="text-[12px] font-bold tracking-[0.08em] uppercase text-white/60">
                  Pesanan Tersimpan
                </span>
              </div>
              <div className="text-[11.5px] text-white/50">
                Kode PO bisa dilihat lagi di tab Riwayat
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/30 hover:text-white/70 transition-colors mt-px shrink-0"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M12 4L4 12M4 4l8 8"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          <div className="bg-white/[0.07] border border-white/10 rounded-lg px-3.5 py-[9px] mb-3 flex items-center justify-between">
            <span className="text-[11px] text-white/40 font-semibold">
              Kode PO
            </span>
            <span className="text-[16px] font-extrabold tracking-[0.08em] font-mono text-white">
              {poNumber}
            </span>
          </div>

          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-[#25D366] text-white py-[9px] rounded-lg text-[13px] font-bold flex items-center justify-center gap-[7px] hover:opacity-90 transition-opacity decoration-transparent"
          >
            <MessageCircleMore size={16} />
            Konfirmasi via WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
