// app/components/orders/TrashView.tsx

import React from "react";
import { formatDate, getStatusColor } from "@/lib/utils";
import { Order } from "@/types";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";

interface TrashViewProps {
  orders: Order[];
  onRestore: (id: string) => void;
  onPermanentDelete: (id: string) => void;
  /** Proses yang sedang berjalan di menu ini (menampilkan loading di tombol terkait). */
  busy?: { id: string; action: "restore" | "purge" } | null;
}

export default function TrashView({
  orders,
  onRestore,
  onPermanentDelete,
  busy = null,
}: TrashViewProps) {
  // Satu proses pada satu waktu: semua tombol dikunci selama ada yang berjalan.
  const anyBusy = busy !== null;

  return (
    <div className="space-y-4 md:space-y-6 transition-colors duration-150">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold text-zinc-900 dark:text-white">
            Sampah
          </h2>
          <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400 mt-1 font-medium">
            {orders.length} pesanan terhapus
          </p>
        </div>
      </div>

      {orders.length === 0 ? (
        /* EMPTY STATE */
        <div className="text-center py-16 bg-white dark:bg-zinc-950/50 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center">
          <Trash2 className="w-16 h-16 mx-auto text-zinc-300 dark:text-zinc-700 mb-4" />
          <p className="text-zinc-400 dark:text-zinc-500 font-medium">
            Sampah kosong
          </p>
        </div>
      ) : (
        /* GRID LIST SAMPAH: 4 kartu per baris di layar lebar */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {orders.map((order) => {
            const isRestoring =
              busy?.id === order.id && busy.action === "restore";
            const isPurging = busy?.id === order.id && busy.action === "purge";

            return (
              <div
                key={order.id}
                aria-busy={isRestoring || isPurging}
                className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 relative overflow-hidden transition-colors duration-150 hover:border-zinc-300 dark:hover:border-zinc-700"
              >
                {/* BADGE DIHAPUS */}
                <div className="absolute top-0 right-0 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-[9px] px-2 py-0.5 font-semibold rounded-bl-lg uppercase tracking-wider">
                  Dihapus
                </div>

                <div className="flex flex-col items-start gap-1.5 mb-2 mt-4">
                  <span className="text-[10px] font-mono font-semibold text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-md max-w-full truncate">
                    #{order.kode_produksi}
                  </span>
                  <span
                    className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wide whitespace-nowrap ${getStatusColor(order.status)}`}
                  >
                    {order.status}
                  </span>
                </div>

                <h3 className="font-semibold text-sm text-zinc-900 dark:text-white line-clamp-1 mb-0.5 leading-tight">
                  {order.nama_pemesan}
                </h3>

                <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mb-3 font-medium">
                  Dihapus:{" "}
                  {order.deleted_at ? formatDate(order.deleted_at) : "-"}
                </div>

                <div className="flex gap-2">
                  {/* PULIHKAN: outline warna brand, selaras dengan tombol sekunder lain */}
                  <button
                    onClick={() => onRestore(order.id)}
                    disabled={anyBusy}
                    aria-busy={isRestoring}
                    className="flex-1 min-w-0 px-2 py-1.5 rounded-md text-[10px] font-semibold border border-[#124540] dark:border-[#49bfb4] text-[#124540] dark:text-[#49bfb4] hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors duration-150 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  >
                    {isRestoring ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                        <span className="truncate">Memulihkan…</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3 h-3 shrink-0" />
                        <span className="truncate">Pulihkan</span>
                      </>
                    )}
                  </button>

                  {/* HAPUS PERMANEN: merah lembut seperti tombol hapus di daftar pesanan */}
                  <button
                    onClick={() => onPermanentDelete(order.id)}
                    disabled={anyBusy}
                    aria-busy={isPurging}
                    className="flex-1 min-w-0 px-2 py-1.5 rounded-md text-[10px] font-semibold bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors duration-150 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-red-50 dark:disabled:hover:bg-red-900/20"
                  >
                    {isPurging ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                        <span className="truncate">Menghapus…</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3 h-3 shrink-0" />
                        <span className="truncate">Hapus</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
