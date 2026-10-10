import { useState } from "react";

/**
 * Tampilkan daftar panjang bertahap ("Tampilkan lebih banyak") supaya
 * render tetap ringan saat pesanan sudah ratusan. Filter, pencarian,
 * pilih-semua, ekspor, dan cetak tetap memakai SELURUH data (bukan hanya
 * yang tampil) — jadi hasilnya sama seperti sebelumnya.
 *
 * resetKey: ganti nilainya (mis. gabungan filter + kata kunci) untuk
 * mengembalikan tampilan ke halaman pertama.
 */
export function usePagedList<T>(items: T[], pageSize = 50, resetKey = "") {
  // Batas tampil disimpan bersama kuncinya. Kalau kunci berubah (filter
  // diganti), batas otomatis kembali ke pageSize tanpa perlu effect.
  const [state, setState] = useState({ key: resetKey, limit: pageSize });
  const limit = state.key === resetKey ? state.limit : pageSize;

  const visible = items.length > limit ? items.slice(0, limit) : items;
  const remaining = Math.max(0, items.length - visible.length);

  return {
    visible,
    remaining,
    hasMore: remaining > 0,
    showMore: () => setState({ key: resetKey, limit: limit + pageSize }),
    showAll: () => setState({ key: resetKey, limit: items.length }),
  };
}