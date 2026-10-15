import { AlertCircle } from "lucide-react";
import { ActionItem } from "@/hooks/useDashboard";
import { formatDate, orderTypeLabel } from "@/lib/utils";

interface ShareTicketProps {
  item: ActionItem;
}

// Gaya dokumen/worksheet produksi. Tetap dipaksa LIGHT MODE agar hasil
// gambar yang di-share bersih seperti kertas terlepas dari mode aktif.
const THEME: Record<string, { accent: string; softBg: string; stamp: string }> =
  {
    KENDALA: {
      accent: "text-purple-700",
      softBg: "bg-purple-50",
      stamp: "border-purple-600 text-purple-700",
    },
    REVISI: {
      accent: "text-rose-700",
      softBg: "bg-rose-50",
      stamp: "border-rose-600 text-rose-700",
    },
    TELAT: {
      accent: "text-red-700",
      softBg: "bg-red-50",
      stamp: "border-red-600 text-red-700",
    },
    URGENT: {
      accent: "text-orange-700",
      softBg: "bg-orange-50",
      stamp: "border-orange-600 text-orange-700",
    },
  };

export function ShareTicket({ item }: ShareTicketProps) {
  const { order, type, detail } = item;
  const theme = THEME[type] ?? THEME.KENDALA;
  const label =
    {
      KENDALA: "Kendala Produksi",
      REVISI: "Revisi QC",
      TELAT: "Telat Deadline",
      URGENT: "Mendesak",
    }[type as keyof typeof THEME] ?? "Info";

  return (
    <div className="w-[600px] bg-white text-zinc-800 p-10 font-sans border border-zinc-300 rounded-lg">
      {/* Kop dokumen */}
      <div className="border-b-2 border-zinc-900 pb-4 mb-6 flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400 mb-1">
            LCO · Production Control
          </p>
          <h1 className="text-xl font-bold text-zinc-900 tracking-tight">
            Kartu Kontrol Produksi
          </h1>
        </div>
        <p className="font-mono text-xs text-zinc-400">
          {new Date().toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </p>
      </div>

      {/* Identitas order + stempel status */}
      <div className="flex items-start justify-between gap-6 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">
            {order.nama_pemesan}
          </h2>
          <p className="font-mono text-sm text-zinc-500 mt-1">
            #{order.kode_produksi}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Dibuat: {formatDate(order.tanggal_masuk)}
          </p>
        </div>
        {/* Stempel */}
        <div className={`border-2 px-4 py-2 rounded ${theme.stamp}`}>
          <p className="font-mono text-xs font-bold uppercase tracking-[0.18em]">
            {label}
          </p>
        </div>
      </div>

      {/* Detail grid */}
      <div className="grid grid-cols-3 gap-px bg-zinc-200 border border-zinc-200 rounded-md overflow-hidden mb-6">
        <div className="bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-400 mb-1">
            Jumlah
          </p>
          <p className="font-mono text-xl font-semibold text-zinc-900">
            {order.jumlah} pcs
          </p>
        </div>
        <div className="bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-400 mb-1">
            Tipe
          </p>
          <p className="font-mono text-xl font-semibold text-zinc-900 uppercase">
            {orderTypeLabel(order)}
          </p>
        </div>
        <div className={`p-4 ${theme.softBg}`}>
          <p
            className={`font-mono text-[10px] uppercase tracking-wider mb-1 ${theme.accent}`}
          >
            Deadline
          </p>
          <p className={`font-mono text-xl font-semibold ${theme.accent}`}>
            {formatDate(order.deadline)}
          </p>
        </div>
      </div>

      {/* Catatan */}
      <div
        className={`border-l-2 border-zinc-900 ${theme.softBg} p-4 rounded-r-md`}
      >
        <div className="flex items-start gap-3">
          <AlertCircle
            className={`w-4 h-4 mt-0.5 flex-shrink-0 ${theme.accent}`}
          />
          <div>
            <p
              className={`font-mono text-[10px] uppercase tracking-wider mb-1 ${theme.accent}`}
            >
              Catatan {type === "KENDALA" ? "produksi" : "sistem"}
            </p>
            <p className="text-base font-semibold text-zinc-900 leading-snug">
              {detail}
            </p>
            <p className="font-mono text-[10px] text-zinc-400 mt-2">
              Dicetak {new Date().toLocaleString("id-ID")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
