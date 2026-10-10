"use client";

import { useEffect, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getAllPOOrders, getPOSettingAdmin } from "@/lib/po/admin";
import { POOrder, POSetting } from "@/types/po";
import POOrderReceiptA6 from "./POOrderReceiptA6";
import { printHtmlPages } from "@/lib/po/print-frame";
import {
  Search,
  Printer,
  CheckSquare,
  Truck,
  Store,
  Loader2,
} from "lucide-react";

interface POShippingListProps {
  poId: string;
}

export default function POShippingList({ poId }: POShippingListProps) {
  const [orders, setOrders] = useState<POOrder[]>([]);
  const [setting, setSetting] = useState<POSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterMetode, setFilterMetode] = useState<
    "ALL" | "Dikirim" | "Diambil"
  >("ALL");
  const [filterType, setFilterType] = useState<"ALL" | "PUBLIC" | "RESELLER">(
    "ALL",
  );

  // State untuk menyimpan ID pesanan yang dicentang
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // State loading saat menyiapkan dokumen cetak (mirip "Menyiapkan dokumen..." di Shopee)
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const [ords, st] = await Promise.all([
        getAllPOOrders(poId),
        getPOSettingAdmin(poId),
      ]);
      setOrders(ords || []);
      setSetting(st);
      setLoading(false);
    }
    loadData();
  }, [poId]);

  // Filter Data
  const filtered = orders.filter((o) => {
    const matchMetode =
      filterMetode === "ALL" || o.delivery_method === filterMetode;
    const matchType = filterType === "ALL" || o.customer_type === filterType;
    const matchSearch =
      o.po_number.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_name.toLowerCase().includes(search.toLowerCase());
    return matchMetode && matchType && matchSearch;
  });

  // Handle Checkbox
  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set()); // Uncheck all
    } else {
      setSelectedIds(new Set(filtered.map((o) => o.id))); // Check all visible
    }
  };

  const handlePrintMassal = () => {
    if (selectedIds.size === 0) {
      alert("Pilih minimal satu pesanan untuk dicetak.");
      return;
    }

    const ordersToPrint = orders.filter((o) => selectedIds.has(o.id));
    if (ordersToPrint.length === 0) return;

    setPrinting(true);

    // Render tiap resi jadi HTML statis (pakai komponen asli POOrderReceiptA6,
    // jadi tampilannya selalu sama persis dengan yang dipakai di tempat lain).
    const pagesHtml = ordersToPrint
      .map((order) =>
        renderToStaticMarkup(
          <div className="po-print-page">
            <POOrderReceiptA6
              order={order}
              storeName="Langitan.co"
              storeAddress="Mandungan, Widang, Tuban, Jawa Timur"
              adminPhone={setting?.wa_admin_phone || ""}
              logoUrl={setting?.logo_image_url || undefined}
            />
          </div>,
        ),
      )
      .join("");

    // Dicetak lewat iframe terpisah; stylesheet aplikasi (Tailwind) disalin
    // ke dalamnya oleh helper supaya tampilan resi sama seperti aslinya.
    printHtmlPages({
      title: "Cetak Resi",
      pagesHtml,
      pageCss: `
        .po-print-page {
          width: 105mm;
          min-height: 148mm;
          padding: 7mm;
          box-sizing: border-box;
          page-break-after: always;
          break-after: page;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .po-print-page:last-child {
          page-break-after: auto;
          break-after: auto;
        }
        @page { size: 105mm 148mm portrait; margin: 0; }
      `,
      onDone: () => setPrinting(false),
      onError: (msg) => alert(msg),
    });
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-8 text-zinc-400">
        <div className="w-5 h-5 border-2 border-zinc-300 border-t-[#49bfb4] rounded-full animate-spin" />
        <span className="text-sm">Memuat data pengiriman...</span>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* ── HEADER & FILTER ── */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative w-full lg:flex-1">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400"
          />
          <input
            type="text"
            placeholder="Cari nama atau kode PO..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-md pl-10 pr-4 py-3 text-sm text-zinc-800 dark:text-zinc-100 hover:border-[#49bfb4]/50 focus:outline-none focus:ring-2 focus:ring-[#49bfb4] focus:border-[#49bfb4] transition-colors duration-150"
          />
        </div>

        <div className="flex flex-row gap-2 overflow-x-auto no-scrollbar">
          {/* Filter Tipe (Public/Reseller) */}
          <div className="flex bg-zinc-100 dark:bg-zinc-900 rounded-md p-1.5">
            {(["ALL", "PUBLIC", "RESELLER"] as const).map((tipe) => (
              <button
                key={tipe}
                onClick={() => setFilterType(tipe)}
                className={`text-xs font-semibold px-4 py-2 rounded-md transition-colors duration-150 whitespace-nowrap ${
                  filterType === tipe
                    ? "bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                }`}
              >
                {tipe === "ALL" ? "Semua Tipe" : tipe}
              </button>
            ))}
          </div>

          {/* Filter Metode (Dikirim/Diambil) */}
          <div className="flex bg-zinc-100 dark:bg-zinc-900 rounded-md p-1.5">
            {(["ALL", "Dikirim", "Diambil"] as const).map((metode) => (
              <button
                key={metode}
                onClick={() => setFilterMetode(metode)}
                className={`text-xs font-semibold px-4 py-2 rounded-md transition-colors duration-150 whitespace-nowrap ${
                  filterMetode === metode
                    ? "bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                }`}
              >
                {metode === "ALL" ? "Semua Metode" : metode}
              </button>
            ))}
          </div>
        </div>

        {/* Tombol Cetak */}
        <button
          onClick={handlePrintMassal}
          disabled={selectedIds.size === 0 || printing}
          className="flex items-center justify-center gap-2 px-5 py-3 bg-[#124540] hover:bg-[#0d332f] disabled:opacity-50 text-white rounded-md font-semibold text-sm transition-colors duration-150 min-w-[190px]"
        >
          {printing ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Menyiapkan dokumen...
            </>
          ) : (
            <>
              <Printer size={16} />
              Cetak ({selectedIds.size})
            </>
          )}
        </button>
      </div>

      {/* ── TABEL DATA PENGIRIMAN ── */}
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden overflow-x-auto bg-white dark:bg-zinc-950">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-semibold tracking-wider">
            <tr>
              <th className="px-5 py-3.5 text-left w-12">
                <button
                  onClick={toggleSelectAll}
                  className="text-zinc-400 hover:text-[#49bfb4] transition-colors duration-150"
                >
                  <CheckSquare
                    size={18}
                    className={
                      selectedIds.size === filtered.length &&
                      filtered.length > 0
                        ? "text-[#49bfb4]"
                        : ""
                    }
                  />
                </button>
              </th>
              <th className="text-left px-5 py-3.5">Kode PO</th>
              <th className="text-left px-5 py-3.5">Pelanggan</th>
              <th className="text-left px-5 py-3.5">Metode</th>
              <th className="text-left px-5 py-3.5">Alamat</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-zinc-400">
                  Tidak ada data yang cocok dengan filter.
                </td>
              </tr>
            ) : (
              filtered.map((order) => {
                const isSelected = selectedIds.has(order.id);
                return (
                  <tr
                    key={order.id}
                    onClick={() => toggleSelect(order.id)}
                    className={`border-b border-zinc-200 dark:border-zinc-800 last:border-0 cursor-pointer transition-colors duration-150 ${
                      isSelected
                        ? "bg-[#49bfb4]/10"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    }`}
                  >
                    <td className="px-5 py-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        className="w-4 h-4 accent-[#49bfb4] rounded border-zinc-300 pointer-events-none"
                      />
                    </td>
                    <td className="px-5 py-4 font-mono tabular-nums text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      {order.po_number}
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold">{order.customer_name}</p>
                      <p className="text-xs text-zinc-500">
                        {order.customer_wa}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border border-zinc-300/70 dark:border-zinc-700 bg-white/80 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300">
                        {order.delivery_method === "Dikirim" ? (
                          <Truck size={12} />
                        ) : (
                          <Store size={12} />
                        )}
                        {order.delivery_method}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs text-zinc-600 dark:text-zinc-400 max-w-[250px] truncate">
                      {order.shipping_address || "-"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Area cetak resi TIDAK LAGI dirender di sini. Saat tombol "Cetak"
          diklik, dokumen cetak dibuat langsung di dalam iframe tersembunyi
          yang berdiri sendiri (lihat handlePrintMassal) — jadi tidak ada
          elemen tersembunyi yang perlu dijaga di pohon komponen ini. */}
    </div>
  );
}
