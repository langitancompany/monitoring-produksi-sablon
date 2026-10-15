// app/components/orders/CompletedOrders.tsx - V.8.3 (Add Action Button)

"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import { Order } from "@/types";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Archive,
  CheckCircle2,
  Package,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  Calendar,
  Eye,
} from "lucide-react";
import { formatDate, orderTypeLabel } from "@/lib/utils";

interface CompletedOrdersProps {
  orders: Order[];
  onSelectOrder: (id: string) => void;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  itemsPerPage?: number;
  onItemsPerPageChange?: (n: number) => void;
}

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

// ─── Tooltip kustom chart — sesuai resep tema (jangan pakai contentStyle bawaan) ─
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-0.5">
        {label}
      </p>
      <p className="font-mono tabular-nums text-xs font-semibold text-zinc-900 dark:text-white">
        {payload[0].value} selesai
      </p>
    </div>
  );
}

export default function CompletedOrders({
  orders,
  onSelectOrder,
  currentPage: currentPageProp,
  onPageChange,
  itemsPerPage: itemsPerPageProp,
  onItemsPerPageChange,
}: CompletedOrdersProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("all");

  // Fallback ke state lokal kalau parent tidak mengontrol
  const [internalPage, setInternalPage] = useState(1);
  const [internalItemsPerPage, setInternalItemsPerPage] = useState(10);

  const currentPage = currentPageProp ?? internalPage;
  const setCurrentPage = onPageChange ?? setInternalPage;
  const itemsPerPage = itemsPerPageProp ?? internalItemsPerPage;
  const setItemsPerPage = onItemsPerPageChange ?? setInternalItemsPerPage;

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const finishedOrders = useMemo(() => {
    let data = orders.filter((o) => o.status === "Selesai");

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      data = data.filter(
        (o) =>
          o.nama_pemesan.toLowerCase().includes(lower) ||
          o.kode_produksi.toLowerCase().includes(lower),
      );
    }

    if (selectedMonth !== "all") {
      const monthIndex = parseInt(selectedMonth);
      data = data.filter((o) => {
        const date = new Date(o.deadline);
        return date.getMonth() === monthIndex;
      });
    }

    return data.sort(
      (a, b) => new Date(b.deadline).getTime() - new Date(a.deadline).getTime(),
    );
  }, [orders, searchTerm, selectedMonth]);

  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setCurrentPage(1);
  }, [searchTerm, selectedMonth]);

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

  const stats = useMemo(() => {
    return {
      totalOrder: finishedOrders.length,
      totalPcs: finishedOrders.reduce((acc, curr) => acc + curr.jumlah, 0),
    };
  }, [finishedOrders]);

  const chartData = useMemo(() => {
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const data: any[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const monthIdx = d.getMonth();
      const year = d.getFullYear();

      const count = finishedOrders.filter((o) => {
        const date = new Date(o.deadline);
        return date.getMonth() === monthIdx && date.getFullYear() === year;
      }).length;
      data.push({ name: months[monthIdx], selesai: count });
    }
    return data;
  }, [finishedOrders]);

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = finishedOrders.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(finishedOrders.length / itemsPerPage);

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  return (
    <div className="space-y-6 pb-10 transition-colors duration-150">
      {/* HEADER & SEARCH */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="hidden md:block">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
            Arsip Produksi Selesai
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">
            Rekapitulasi pesanan yang telah rampung
          </p>
        </div>

        {/* CONTROL BAR */}
        <div className="grid grid-cols-2 gap-3 md:flex md:flex-row w-full md:w-auto h-10">
          {/* DROPDOWN FILTER BULAN */}
          <div className="relative h-full w-full">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
              <Calendar className="h-4 w-4 text-zinc-400" />
            </div>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-full w-full pl-9 pr-8 border border-zinc-300 dark:border-zinc-700 rounded-lg text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-[#124540] bg-white dark:bg-zinc-950 dark:text-zinc-200 appearance-none cursor-pointer transition-colors duration-150"
            >
              <option value="all">Semua</option>
              {MONTH_NAMES.map((month, index) => (
                <option key={index} value={index}>
                  {month}
                </option>
              ))}
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
              placeholder="Cari..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-full w-full pl-9 pr-4 border border-zinc-300 dark:border-zinc-700 rounded-lg text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-[#124540] bg-white dark:bg-zinc-950 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-500 transition-colors duration-150"
            />
          </div>
        </div>
      </div>

      {/* STATS & GRAFIK SECTION */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        {/* STATS CARDS */}
        <div className="bg-white dark:bg-zinc-950 p-3 md:p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row items-start md:items-center justify-between">
          <div>
            <p className="text-[10px] md:text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
              Total Order
            </p>
            <h3 className="text-xl md:text-3xl font-mono tabular-nums font-semibold text-zinc-900 dark:text-white mt-1">
              {stats.totalOrder}
            </h3>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-semibold border border-zinc-300/70 dark:border-zinc-700 bg-white/80 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 mt-2">
              {selectedMonth !== "all"
                ? MONTH_NAMES[parseInt(selectedMonth)]
                : "All Time"}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-950 p-3 md:p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row items-start md:items-center justify-between">
          <div>
            <p className="text-[10px] md:text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
              Total Pakaian
            </p>
            <h3 className="text-xl md:text-3xl font-mono tabular-nums font-semibold text-zinc-900 dark:text-white mt-1">
              {stats.totalPcs.toLocaleString("id-ID")}
            </h3>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-semibold border border-zinc-300/70 dark:border-zinc-700 bg-white/80 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 mt-2">
              Pcs
            </span>
          </div>
        </div>

        <div className="col-span-2 md:col-span-1 bg-white dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
          <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2">
            Tren{" "}
            {selectedMonth !== "all"
              ? MONTH_NAMES[parseInt(selectedMonth)]
              : "6 Bulan Terakhir"}
          </p>
          <div className="h-20 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorSelesai" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  content={<ChartTooltip />}
                  cursor={{ stroke: "#059669", strokeWidth: 1 }}
                />
                <Area
                  type="monotone"
                  dataKey="selesai"
                  stroke="#059669"
                  fillOpacity={1}
                  fill="url(#colorSelesai)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* TABEL DATA */}
      <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col">
        <div className="overflow-x-auto overflow-y-auto max-h-[60vh] min-h-[300px] custom-scrollbar relative">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            {/* STICKY HEADER */}
            <thead className="sticky top-0 z-10">
              <tr className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-[10px] md:text-xs text-zinc-500 dark:text-zinc-400 uppercase font-semibold tracking-[0.12em]">
                <th className="px-4 py-3 md:px-6 md:py-4 bg-inherit">
                  No. Order
                </th>
                <th className="px-4 py-3 md:px-6 md:py-4 bg-inherit">
                  Pemesan
                </th>
                <th className="px-4 py-3 md:px-6 md:py-4 bg-inherit">
                  Jenis Produksi
                </th>
                <th className="px-4 py-3 md:px-6 md:py-4 bg-inherit text-center">
                  Jml (Pcs)
                </th>
                <th className="px-4 py-3 md:px-6 md:py-4 bg-inherit">
                  Tgl. Selesai
                </th>
                <th className="px-4 py-3 md:px-6 md:py-4 bg-inherit text-center">
                  Status
                </th>
                {/* 🟢 KOLOM AKSI BARU */}
                <th className="px-4 py-3 md:px-6 md:py-4 text-center sticky right-0 bg-zinc-50 dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800">
                  Aksi
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900 text-xs md:text-sm">
              {currentItems.length > 0 ? (
                currentItems.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50 transition-colors duration-150 group"
                  >
                    <td className="px-4 py-3 md:px-6 md:py-4 font-mono text-zinc-500 dark:text-zinc-400">
                      #{order.kode_produksi}
                    </td>
                    <td className="px-4 py-3 md:px-6 md:py-4 font-semibold text-zinc-700 dark:text-zinc-200">
                      {order.nama_pemesan}
                    </td>
                    <td className="px-4 py-3 md:px-6 md:py-4">
                      <span className="inline-block px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 text-[9px] md:text-[10px] font-semibold text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900 uppercase">
                        {orderTypeLabel(order)}
                      </span>
                    </td>
                    <td className="px-4 py-3 md:px-6 md:py-4 text-center font-mono tabular-nums font-semibold text-zinc-700 dark:text-zinc-200">
                      {order.jumlah}
                    </td>
                    <td className="px-4 py-3 md:px-6 md:py-4 font-mono text-zinc-500 dark:text-zinc-400">
                      {formatDate(order.deadline)}
                    </td>
                    <td className="px-4 py-3 md:px-6 md:py-4 text-center">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] md:text-xs font-semibold bg-emerald-600 text-white">
                        Selesai <CheckCircle2 className="w-3 h-3" />
                      </span>
                    </td>
                    {/* 🟢 TOMBOL AKSI */}
                    <td className="px-4 py-3 md:px-6 md:py-4 text-center sticky right-0 bg-white dark:bg-zinc-950 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-900/50 border-l border-zinc-100 dark:border-zinc-900 transition-colors duration-150">
                      <button
                        onClick={() => onSelectOrder(order.id)}
                        className="p-2 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-[#49BFB4] hover:border-[#124540] hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150 flex items-center justify-center gap-1.5 mx-auto"
                        title="Lihat Detail Pesanan"
                      >
                        <Eye className="w-4 h-4" />
                        <span className="hidden md:inline text-[10px] font-semibold">
                          Detail
                        </span>
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                // EMPTY STATE
                <tr>
                  <td colSpan={7} className="p-0 border-none">
                    <div className="sticky left-0 w-[calc(100vw-3.5rem)] md:w-full min-h-[300px] flex flex-col items-center justify-center gap-3 px-4">
                      <Package className="w-12 h-12 opacity-20 text-zinc-500 dark:text-zinc-400" />
                      <div className="text-center">
                        <p className="text-zinc-500 dark:text-zinc-400 font-medium">
                          {selectedMonth !== "all"
                            ? `Tidak ada pesanan selesai di bulan ${MONTH_NAMES[parseInt(selectedMonth)]}.`
                            : "Belum ada data pesanan selesai yang ditemukan."}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* FOOTER TABEL */}
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
                    {[10, 20, 50].map((num) => (
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
              {Math.min(indexOfLastItem, finishedOrders.length)} dari{" "}
              {finishedOrders.length}
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
