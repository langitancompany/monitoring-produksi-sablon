"use client";

interface LoadMoreProps {
  remaining: number;
  onShowMore: () => void;
  onShowAll: () => void;
}

/** Tombol di bawah tabel/daftar panjang: tampilkan sisa data bertahap. */
export default function LoadMore({
  remaining,
  onShowMore,
  onShowAll,
}: LoadMoreProps) {
  if (remaining <= 0) return null;
  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-3">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        <span className="font-mono tabular-nums">{remaining}</span> pesanan lagi
        disembunyikan
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onShowMore}
          className="text-xs font-semibold px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors duration-150"
        >
          Tampilkan lebih banyak
        </button>
        <button
          type="button"
          onClick={onShowAll}
          className="text-xs font-semibold px-3 py-1.5 text-zinc-500 dark:text-zinc-400 hover:text-[#49bfb4] transition-colors duration-150"
        >
          Tampilkan semua
        </button>
      </div>
    </div>
  );
}
