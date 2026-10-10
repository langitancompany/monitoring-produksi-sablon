"use client";

import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { updateItemShortage } from "@/lib/po/admin";
import { POOrder, POOrderItem } from "@/types/po";
import { usePOAdminData } from "./POAdminDataContext";
import { useDialog } from "@/app/components/ui/DialogProvider";
import { usePagedList } from "@/hooks/usePagedList";
import { getStoreInfo } from "@/lib/po/store-info";
import LoadMore from "./LoadMore";
import POOrderPrintSlip from "./POOrderPrintSlip";
import { printHtmlPages } from "@/lib/po/print-frame";
import {
  Search,
  Printer,
  CheckSquare,
  Users,
  Globe,
  Loader2,
  PackageX,
  PackageCheck,
  RotateCcw,
  ClipboardList,
  X,
} from "lucide-react";

/* ── Modal detail packing: kemas item satu-satu, tandai stok kurang ── */
function PackingDetailModal({
  order,
  onClose,
  onOrderUpdated,
}: {
  order: POOrder;
  onClose: () => void;
  onOrderUpdated: (updated: POOrder) => void;
}) {
  const { notify } = useDialog();
  const [items, setItems] = useState<POOrderItem[]>([...order.order_items]);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<number>(0);

  // Klik "Stok Tidak Ada" -> defaultnya dianggap kurang SEMUA (= qty item).
  // Admin cukup klik Simpan kalau memang kurang semua, atau ubah angkanya
  // dulu kalau cuma kurang sebagian.
  function startShortage(index: number) {
    setEditingIndex(index);
    setEditValue(items[index].qty);
  }

  function startEditExisting(index: number) {
    setEditingIndex(index);
    setEditValue(items[index].shortage_qty || 0);
  }

  async function confirmShortage(index: number) {
    const qty = items[index].qty;
    const clamped = Math.max(0, Math.min(editValue, qty));
    setSavingIndex(index);
    const result = await updateItemShortage(order.id, index, clamped);
    setSavingIndex(null);
    if (!result.success) {
      notify("Gagal menyimpan status stok: " + result.error);
      return;
    }
    const updatedItems = items.map((it, i) =>
      i === index ? { ...it, shortage_qty: clamped } : it,
    );
    setItems(updatedItems);
    setEditingIndex(null);
    onOrderUpdated({ ...order, order_items: updatedItems });
  }

  async function resetShortage(index: number) {
    setSavingIndex(index);
    const result = await updateItemShortage(order.id, index, 0);
    setSavingIndex(null);
    if (!result.success) {
      notify("Gagal reset status stok: " + result.error);
      return;
    }
    const updatedItems = items.map((it, i) =>
      i === index ? { ...it, shortage_qty: 0 } : it,
    );
    setItems(updatedItems);
    setEditingIndex(null);
    onOrderUpdated({ ...order, order_items: updatedItems });
  }

  const totalKurang = items.reduce((s, it) => s + (it.shortage_qty || 0), 0);

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-950 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 px-5 py-4 flex items-center justify-between z-10">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
              Kemas Pesanan
            </p>
            <h3 className="font-mono font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              {order.po_number}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
              {order.customer_name}
              {totalKurang > 0 && (
                <span className="ml-2 text-red-600 dark:text-red-400 font-semibold">
                  · {totalKurang} pcs kurang
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 shrink-0 transition-colors duration-150"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-2.5">
          {items.map((item, i) => {
            const isEditing = editingIndex === i;
            const isSaving = savingIndex === i;
            const hasShortage = (item.shortage_qty || 0) > 0;
            return (
              <div
                key={i}
                className={`border rounded-xl p-3.5 transition-colors duration-150 ${
                  hasShortage
                    ? "border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <p className="font-semibold text-sm text-zinc-800 dark:text-zinc-200 truncate">
                  {item.product_name}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                  {item.ukuran} · {item.lengan} · {item.warna} · Qty {item.qty}
                </p>

                {isEditing ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={item.qty}
                      value={editValue}
                      onChange={(e) => setEditValue(Number(e.target.value))}
                      autoFocus
                      className="w-20 text-sm text-center bg-white dark:bg-zinc-950 border border-red-300 dark:border-red-700 rounded-md px-2 py-1.5"
                    />
                    <span className="text-xs text-zinc-400">
                      / {item.qty} pcs kurang
                    </span>
                    <button
                      onClick={() => confirmShortage(i)}
                      disabled={isSaving}
                      className="text-xs font-semibold px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-md transition-colors duration-150"
                    >
                      {isSaving ? "..." : "Simpan"}
                    </button>
                    <button
                      onClick={() => setEditingIndex(null)}
                      className="text-xs font-semibold px-3 py-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors duration-150"
                    >
                      Batal
                    </button>
                  </div>
                ) : hasShortage ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
                      <PackageX size={12} /> Kurang {item.shortage_qty} pcs
                    </span>
                    <button
                      onClick={() => startEditExisting(i)}
                      className="text-xs font-semibold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors duration-150"
                    >
                      Ubah
                    </button>
                    <button
                      onClick={() => resetShortage(i)}
                      disabled={isSaving}
                      className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 flex items-center gap-1 disabled:opacity-50 transition-colors duration-150"
                    >
                      <RotateCcw size={11} /> Stok Lengkap
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => startShortage(i)}
                    className="text-xs font-semibold px-3 py-1.5 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors duration-150"
                  >
                    Stok Tidak Ada
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function POPackingList() {
  const { orders, setOrders, setting, loading } = usePOAdminData();
  const { notify } = useDialog();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "PUBLIC" | "RESELLER">(
    "ALL",
  );

  // State untuk menyimpan ID pesanan yang dicentang
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // State loading saat menyiapkan dokumen cetak
  const [printing, setPrinting] = useState(false);
  // Pesanan yang sedang dibuka detail packing-nya (modal)
  const [detailOrder, setDetailOrder] = useState<POOrder | null>(null);

  // Update satu order di state lokal setelah status stok item berubah,
  // supaya badge di tabel & modal langsung sinkron tanpa perlu refetch.
  function handleOrderUpdated(updated: POOrder) {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    setDetailOrder(updated);
  }

  // Filter Data — sengaja cuma satu filter: Tipe Customer
  const filtered = orders.filter((o) => {
    const matchType = filterType === "ALL" || o.customer_type === filterType;
    const matchSearch =
      o.po_number.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_name.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  // Tampilan bertahap; pilih-semua & cetak tetap memakai seluruh `filtered`.
  const { visible, remaining, showMore, showAll } = usePagedList(
    filtered,
    50,
    `${search}|${filterType}`,
  );

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
      notify("Pilih minimal satu pesanan untuk dicetak.");
      return;
    }

    const ordersToPrint = orders.filter((o) => selectedIds.has(o.id));
    if (ordersToPrint.length === 0) return;

    setPrinting(true);

    // Render tiap invoice jadi HTML statis (pakai komponen asli
    // POOrderPrintSlip — sama persis dengan yang dipakai di tombol
    // "Download PDF" pada detail pesanan).
    const pagesHtml = ordersToPrint
      .map((order) =>
        renderToStaticMarkup(
          <div className="po-print-page">
            <POOrderPrintSlip
              order={order}
              {...getStoreInfo(setting)}
              logoUrl={setting?.logo_image_url || undefined}
            />
          </div>,
        ),
      )
      .join("");

    // Dicetak lewat iframe terpisah; stylesheet aplikasi (Tailwind) disalin
    // ke dalamnya oleh helper supaya tampilan invoice sama seperti aslinya.
    printHtmlPages({
      title: "Cetak Invoice",
      pagesHtml,
      pageCss: `
        .po-print-page {
          page-break-after: always;
          break-after: page;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .po-print-page:last-child {
          page-break-after: auto;
          break-after: auto;
        }
        @page { size: 210mm 297mm portrait; margin: 0; }
      `,
      onDone: () => setPrinting(false),
      onError: (msg) => notify(msg),
    });
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-8 text-zinc-400">
        <div className="w-5 h-5 border-2 border-zinc-300 border-t-[#49bfb4] rounded-full animate-spin" />
        <span className="text-sm">Memuat data pengemasan...</span>
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

        {/* Filter Tipe (Public/Reseller) — satu-satunya filter di tab ini */}
        <div className="flex bg-zinc-100 dark:bg-zinc-900 rounded-md p-1.5 overflow-x-auto no-scrollbar">
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

        {/* Tombol Cetak */}
        <button
          onClick={handlePrintMassal}
          disabled={selectedIds.size === 0 || printing}
          className="flex items-center justify-center gap-2 px-5 py-3 bg-[#124540] hover:bg-[#0d332f] disabled:opacity-50 text-white rounded-md font-semibold text-sm transition-colors duration-150 min-w-[210px]"
        >
          {printing ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Menyiapkan dokumen...
            </>
          ) : (
            <>
              <Printer size={16} />
              Cetak Invoice ({selectedIds.size})
            </>
          )}
        </button>
      </div>

      {/* ── TABEL DATA PENGEMASAN ── */}
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden overflow-x-auto bg-white dark:bg-zinc-950">
        <table className="w-full text-sm min-w-[850px]">
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
              <th className="text-left px-5 py-3.5">Tipe</th>
              <th className="text-left px-5 py-3.5">Jumlah Item</th>
              <th className="text-left px-5 py-3.5">Status Stok</th>
              <th className="text-right px-5 py-3.5">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-zinc-400">
                  Tidak ada data yang cocok dengan filter.
                </td>
              </tr>
            ) : (
              visible.map((order) => {
                const isSelected = selectedIds.has(order.id);
                const totalQty = order.order_items.reduce(
                  (sum, item) => sum + item.qty,
                  0,
                );
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
                        {order.customer_type === "RESELLER" ? (
                          <Users size={12} />
                        ) : (
                          <Globe size={12} />
                        )}
                        {order.customer_type}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-mono tabular-nums text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                      {totalQty} pcs · {order.order_items.length} item
                    </td>
                    <td className="px-5 py-4">
                      {(() => {
                        const totalKurang = order.order_items.reduce(
                          (s, it) => s + (it.shortage_qty || 0),
                          0,
                        );
                        if (totalKurang === 0) {
                          return (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-500">
                              <PackageCheck size={12} /> Lengkap
                            </span>
                          );
                        }
                        return (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 dark:text-red-400">
                            <PackageX size={12} /> Kurang {totalKurang}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailOrder(order);
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors duration-150"
                      >
                        <ClipboardList size={13} /> Kemas
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <LoadMore
        remaining={remaining}
        onShowMore={showMore}
        onShowAll={showAll}
      />

      {detailOrder && (
        <PackingDetailModal
          order={detailOrder}
          onClose={() => setDetailOrder(null)}
          onOrderUpdated={handleOrderUpdated}
        />
      )}

      {/* Area cetak invoice TIDAK dirender di sini. Saat tombol "Cetak
          Invoice" diklik, dokumen dibuat langsung di dalam iframe
          tersembunyi yang berdiri sendiri (lihat handlePrintMassal). */}
    </div>
  );
}
