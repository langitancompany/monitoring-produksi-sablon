// app/components/ui/TablePagination.tsx
//
// Footer tabel: pilih jumlah baris, nomor halaman, tombol sebelumnya/berikutnya.
// Dipakai Pesanan Selesai dan Log Aktivitas (tampilan sama dengan Sablon).
"use client";

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  page: number;
  perPage: number;
  total: number;
  onPage: (page: number) => void;
  onPerPage: (perPage: number) => void;
  perPageOptions?: number[];
}

const btnCls =
  "p-1.5 md:p-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors duration-150";

export default function TablePagination({
  page,
  perPage,
  total,
  onPage,
  onPerPage,
  perPageOptions = [10, 20, 50],
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (current - 1) * perPage + 1;
  const to = Math.min(current * perPage, total);

  return (
    <div className="bg-zinc-50 dark:bg-zinc-900 px-4 py-3 md:px-6 md:py-4 border-t border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row justify-between items-center gap-3">
      <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
        <label className="flex items-center gap-2 text-[10px] md:text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          Tampil:
          <select
            value={perPage}
            onChange={(e) => {
              onPerPage(Number(e.target.value));
              onPage(1);
            }}
            className="h-8 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 text-[10px] md:text-xs font-mono tabular-nums rounded-lg px-2 focus:outline-none focus:ring-2 focus:ring-[#124540] cursor-pointer"
          >
            {perPageOptions.map((n) => (
              <option key={n} value={n}>
                {n} baris
              </option>
            ))}
          </select>
        </label>
        <p className="text-[10px] md:text-xs text-zinc-500 dark:text-zinc-400">
          Hal{" "}
          <span className="font-mono tabular-nums font-semibold text-zinc-700 dark:text-zinc-200">{current}</span> dari{" "}
          <span className="font-mono tabular-nums font-semibold text-zinc-700 dark:text-zinc-200">{totalPages}</span>
        </p>
      </div>

      <div className="flex items-center gap-2 w-full md:w-auto justify-center md:justify-end">
        <button onClick={() => onPage(current - 1)} disabled={current <= 1} className={btnCls} aria-label="Halaman sebelumnya">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-[10px] md:text-xs font-mono tabular-nums font-semibold text-zinc-500 dark:text-zinc-400 px-2 whitespace-nowrap">
          {from} - {to} dari {total}
        </div>
        <button
          onClick={() => onPage(current + 1)}
          disabled={current >= totalPages}
          className={btnCls}
          aria-label="Halaman berikutnya"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
