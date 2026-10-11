// app/components/apps/ActivityLogView.tsx
"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
  Clock,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  Package,
} from "lucide-react";

// Cache di memori (hidup selama tab browser tidak di-refresh). Komponen ini di-unmount tiap pindah
// menu, jadi tanpa cache setiap membuka "Log Aktivitas" selalu mulai dari kosong + spinner.
// Dengan cache: data terakhir langsung tampil, lalu diperbarui di latar belakang.
let logsCache: any[] | null = null;

// Hanya kolom yang benar-benar ditampilkan tabel. `metadata`, `old_value`, `new_value`, dst. tidak dipakai.
const LOG_COLUMNS =
  "id, created_at, kode_produksi, category, event_name, description, oleh";

export default function ActivityLogView() {
  // --- STATE DATA ---
  const [logs, setLogs] = useState<any[]>(logsCache ?? []);
  const [loading, setLoading] = useState(logsCache === null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // --- STATE FILTER & SEARCH ---
  const [filterCategory, setFilterCategory] = useState("ALL");
  const [search, setSearch] = useState("");

  // --- STATE PAGINATION ---
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ),
    [],
  );

  const fetchLogs = useCallback(async () => {
    // Jika sudah ada data (cache), jangan tampilkan spinner penuh: perbarui diam-diam.
    if (logsCache === null) setLoading(true);

    // Ambil 1000 log terakhir. Batas waktu 20 dtk per percobaan + 1x coba ulang,
    // supaya koneksi macet tidak membuat spinner berputar sampai menit.
    const attempt = () => {
      const q = supabase
        .from("order_logs")
        .select(LOG_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(1000);
      return typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
        ? q.abortSignal(AbortSignal.timeout(20000))
        : q;
    };

    let rows: any[] | null = null;
    try {
      let res = await attempt();
      if (res.error) {
        await new Promise((r) => setTimeout(r, 1000));
        res = await attempt();
      }
      rows = res.error ? null : (res.data as any[] | null);
    } catch {
      rows = null;
    }

    if (rows) {
      logsCache = rows;
      setLogs(rows);
      setLoadError(null);
    } else {
      setLoadError(
        "Log belum berhasil dimuat. Periksa koneksi internet, lalu coba lagi.",
      );
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  // Reset halaman ke 1 jika filter berubah
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterCategory]);

  // Tutup dropdown pagination jika klik di luar
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- LOGIKA FILTER & PAGINATION ---
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchCat =
        filterCategory === "ALL" || log.category === filterCategory;
      const matchSearch =
        log.kode_produksi?.toLowerCase().includes(search.toLowerCase()) ||
        log.event_name?.toLowerCase().includes(search.toLowerCase()) ||
        log.description?.toLowerCase().includes(search.toLowerCase()) ||
        log.oleh?.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [logs, filterCategory, search]);

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredLogs.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage((prev) => prev + 1);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage((prev) => prev - 1);
  };

  // --- STATISTIK ---
  const stats = useMemo(() => {
    return {
      total: logs.length,
      kendala: logs.filter((l) => l.category === "KENDALA").length,
      revisi: logs.filter((l) => l.category === "REVISI").length,
      files: logs.filter((l) => l.category === "FILE").length,
    };
  }, [logs]);

  // Warna teks kategori — sesuai resep "status = indikator/teks berwarna,
  // bukan kotak/badge besar". KENDALA & REVISI disamakan dengan token yang
  // sudah dipakai di HeroSection/ActionList; QC & FILE dapat warna berbeda
  // supaya tidak tabrakan makna dengan token status yang sudah dipatenkan.
  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case "STATUS":
        return "text-zinc-600 dark:text-zinc-400";
      case "FILE":
        return "text-[#2589ff]";
      case "KENDALA":
        return "text-purple-600 dark:text-purple-400";
      case "QC":
        return "text-amber-600 dark:text-amber-400";
      case "REVISI":
        return "text-rose-600 dark:text-rose-400";
      default:
        return "text-zinc-400";
    }
  };

  return (
    <div className="space-y-6 pb-10 transition-colors duration-150">
      {/* HEADER & CONTROL BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* JUDUL */}
        <div className="hidden md:block">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
            Log Aktivitas & R&D
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">
            Rekam jejak seluruh aktivitas produksi
          </p>
        </div>

        {/* CONTROL BAR (FILTER & SEARCH) */}
        <div className="grid grid-cols-2 gap-3 md:flex md:flex-row w-full md:w-auto h-10">
          {/* FILTER KATEGORI */}
          <div className="relative h-full w-full">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
              <Filter className="h-4 w-4 text-zinc-400" />
            </div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="h-full w-full pl-9 pr-8 border border-zinc-300 dark:border-zinc-700 rounded-lg text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-[#124540] bg-white dark:bg-zinc-950 dark:text-zinc-200 appearance-none cursor-pointer transition-colors duration-150"
            >
              <option value="ALL">Filter</option>
              <option value="STATUS">Status</option>
              <option value="FILE">File</option>
              <option value="KENDALA">Kendala</option>
              <option value="QC">QC</option>
              <option value="REVISI">Revisi</option>
            </select>
            <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none">
              <ChevronDown className="h-3 w-3 text-zinc-400" />
            </div>
          </div>

          {/* SEARCH INPUT */}
          <div className="relative h-full w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Pencarian"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-full w-full pl-9 pr-4 border border-zinc-300 dark:border-zinc-700 rounded-lg text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-[#124540] bg-white dark:bg-zinc-950 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-500 transition-colors duration-150"
            />
          </div>
        </div>
      </div>

      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-xs text-red-700 dark:text-red-300">
          <span>{loadError}</span>
          <button
            onClick={() => void fetchLogs()}
            className="font-semibold underline shrink-0"
          >
            Coba lagi
          </button>
        </div>
      )}

      {/* STATS CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {/* Card 1: Total Aktivitas */}
        <div className="bg-white dark:bg-zinc-950 p-3 md:p-5 rounded-xl border border-zinc-200 dark:border-zinc-800">
          <p className="text-[10px] md:text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
            Total Log
          </p>
          <h3 className="text-xl md:text-3xl font-mono tabular-nums font-semibold text-zinc-900 dark:text-white mt-1">
            {stats.total}
          </h3>
        </div>

        {/* Card 2: Kendala */}
        <div className="bg-white dark:bg-zinc-950 p-3 md:p-5 rounded-xl border border-zinc-200 dark:border-zinc-800">
          <p className="text-[10px] md:text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
            Kendala
          </p>
          <h3 className="text-xl md:text-3xl font-mono tabular-nums font-semibold text-zinc-900 dark:text-white mt-1">
            {stats.kendala}
          </h3>
        </div>

        {/* Card 3: Revisi */}
        <div className="bg-white dark:bg-zinc-950 p-3 md:p-5 rounded-xl border border-zinc-200 dark:border-zinc-800">
          <p className="text-[10px] md:text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
            Revisi
          </p>
          <h3 className="text-xl md:text-3xl font-mono tabular-nums font-semibold text-zinc-900 dark:text-white mt-1">
            {stats.revisi}
          </h3>
        </div>

        {/* Card 4: File Upload */}
        <div className="bg-white dark:bg-zinc-950 p-3 md:p-5 rounded-xl border border-zinc-200 dark:border-zinc-800">
          <p className="text-[10px] md:text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
            File Upload
          </p>
          <h3 className="text-xl md:text-3xl font-mono tabular-nums font-semibold text-zinc-900 dark:text-white mt-1">
            {stats.files}
          </h3>
        </div>
      </div>

      {/* TABEL DATA */}
      <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col">
        <div className="overflow-x-auto overflow-y-auto max-h-[60vh] min-h-[300px] custom-scrollbar relative">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            {/* STICKY HEADER */}
            <thead className="sticky top-0 z-10">
              <tr className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-[10px] md:text-xs text-zinc-500 dark:text-zinc-400 uppercase font-semibold tracking-[0.12em]">
                <th className="px-4 py-3 md:px-6 md:py-4 bg-inherit">Waktu</th>
                <th className="px-4 py-3 md:px-6 md:py-4 bg-inherit">
                  Order ID
                </th>
                <th className="px-4 py-3 md:px-6 md:py-4 bg-inherit">
                  Kategori
                </th>
                <th className="px-4 py-3 md:px-6 md:py-4 bg-inherit">
                  Kejadian
                </th>
                <th className="px-4 py-3 md:px-6 md:py-4 bg-inherit">
                  Keterangan
                </th>
                <th className="px-4 py-3 md:px-6 md:py-4 bg-inherit">Oleh</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900 text-xs md:text-sm">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-0 border-none">
                    <div className="sticky left-0 w-[calc(100vw-2rem)] md:w-full min-h-[300px] flex flex-col items-center justify-center gap-3 px-4">
                      <div className="w-10 h-10 border-4 border-zinc-200 dark:border-zinc-800 border-t-[#2589ff] rounded-full animate-spin" />
                      <p className="text-zinc-500 dark:text-zinc-400 font-medium">
                        Memuat data log...
                      </p>
                    </div>
                  </td>
                </tr>
              ) : currentItems.length > 0 ? (
                currentItems.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50 transition-colors duration-150 group"
                  >
                    <td className="px-4 py-3 md:px-6 md:py-4 font-mono text-zinc-500 dark:text-zinc-400">
                      <div className="flex items-center gap-2">
                        <Clock size={14} className="opacity-70" />
                        {new Date(log.created_at).toLocaleString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 md:px-6 md:py-4 font-semibold text-zinc-700 dark:text-zinc-200">
                      {log.kode_produksi || "-"}
                    </td>
                    <td className="px-4 py-3 md:px-6 md:py-4">
                      <span
                        className={`text-[10px] md:text-[11px] font-semibold uppercase tracking-wide ${getCategoryColor(log.category)}`}
                      >
                        {log.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 md:px-6 md:py-4 font-medium text-zinc-800 dark:text-zinc-100">
                      {log.event_name}
                    </td>
                    <td
                      className="px-4 py-3 md:px-6 md:py-4 text-zinc-500 dark:text-zinc-400 max-w-[200px] truncate"
                      title={log.description}
                    >
                      {log.description}
                    </td>
                    <td className="px-4 py-3 md:px-6 md:py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">
                          {log.oleh?.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                          {log.oleh}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="p-0 border-none">
                    <div className="sticky left-0 w-[calc(100vw-2rem)] md:w-full min-h-[300px] flex flex-col items-center justify-center gap-3 px-4">
                      <Package className="w-12 h-12 opacity-20 text-zinc-500 dark:text-zinc-400" />
                      <div className="text-center">
                        <p className="text-zinc-500 dark:text-zinc-400 font-medium">
                          Tidak ada data log yang ditemukan.
                        </p>
                        {filterCategory !== "ALL" && (
                          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                            Coba ubah filter kategori atau pencarian.
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* FOOTER PAGINATION */}
        <div className="bg-zinc-50 dark:bg-zinc-900 px-4 py-3 md:px-6 md:py-4 border-t border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row justify-between items-center gap-3 z-20 relative">
          <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center gap-2 relative" ref={dropdownRef}>
              <span className="text-[10px] md:text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                Tampil:
              </span>
              <div className="relative">
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center gap-1 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 text-[10px] md:text-xs rounded-lg px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150 min-w-[90px] justify-between h-8"
                >
                  <span className="font-mono tabular-nums">
                    {itemsPerPage} Baris
                  </span>
                  <ChevronDown
                    className={`w-3 h-3 transition-colors duration-150 ${isDropdownOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {isDropdownOpen && (
                  <div className="absolute bottom-full left-0 mb-2 w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg z-50 overflow-hidden">
                    {[10, 25, 50, 100].map((num) => (
                      <button
                        key={num}
                        onClick={() => {
                          setItemsPerPage(num);
                          setCurrentPage(1);
                          setIsDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-[10px] md:text-xs font-mono tabular-nums transition-colors duration-150 flex items-center justify-between ${itemsPerPage === num ? "font-semibold text-[#2589ff] bg-[#2589ff]/10" : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900"}`}
                      >
                        {num}
                        {itemsPerPage === num && <Check className="w-3 h-3" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <p className="text-[10px] md:text-xs text-zinc-500 dark:text-zinc-400">
              Hal{" "}
              <span className="font-mono tabular-nums font-semibold text-zinc-700 dark:text-zinc-200">
                {currentPage}
              </span>{" "}
              dari{" "}
              <span className="font-mono tabular-nums font-semibold text-zinc-700 dark:text-zinc-200">
                {totalPages}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-center md:justify-end">
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 1}
              className="p-1.5 md:p-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors duration-150"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-[10px] md:text-xs font-mono tabular-nums font-semibold text-zinc-500 dark:text-zinc-400 px-2 whitespace-nowrap">
              {indexOfFirstItem + 1} -{" "}
              {Math.min(indexOfLastItem, filteredLogs.length)} dari{" "}
              {filteredLogs.length}
            </div>
            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages || totalPages === 0}
              className="p-1.5 md:p-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors duration-150"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
