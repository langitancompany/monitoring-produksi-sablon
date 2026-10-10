"use client";

import POOrderPrintSlip from "./POOrderPrintSlip";
import { useRef, useState } from "react";
import POOrderEditForm from "./POOrderEditForm";

import { deletePOOrder, updatePaymentStatus } from "@/lib/po/admin";
import { usePOAdminData } from "./POAdminDataContext";
import { useDialog } from "@/app/components/ui/DialogProvider";
import { usePagedList } from "@/hooks/usePagedList";
import { getStoreInfo } from "@/lib/po/store-info";
import LoadMore from "./LoadMore";
import { formatRupiah } from "@/lib/po/pricing";
import { POOrder, PaymentStatus } from "@/types/po";
import {
  buildWaLink,
  buildOrderConfirmationMessage,
} from "@/lib/po/wa-messages";
import {
  Search,
  RefreshCw,
  ArrowLeft,
  MessageCircle,
  Trash2,
  ChevronRight,
  Package,
  Download,
  CheckCircle2,
  CircleDollarSign,
  XCircle,
  Pencil,
  ChevronDown,
} from "lucide-react";

/* ── Konfigurasi tampilan status pembayaran ─────────────────── */
const PAYMENT_CONFIG: Record<
  PaymentStatus,
  {
    label: string;
    icon: typeof CheckCircle2;
    className: string;
    iconClass: string;
  }
> = {
  BELUM_BAYAR: {
    label: "Belum Bayar",
    icon: XCircle,
    className: "text-red-600 dark:text-red-500",
    iconClass: "text-red-600 dark:text-red-500",
  },
  DP: {
    label: "DP",
    icon: CircleDollarSign,
    className: "text-orange-600 dark:text-orange-500",
    iconClass: "text-orange-600 dark:text-orange-500",
  },
  LUNAS: {
    label: "Lunas",
    icon: CheckCircle2,
    className: "text-emerald-600 dark:text-emerald-500",
    iconClass: "text-emerald-600 dark:text-emerald-500",
  },
};

const PAYMENT_OPTIONS: PaymentStatus[] = ["BELUM_BAYAR", "DP", "LUNAS"];

/* ── Dropdown badge untuk ubah status pembayaran ────────────── */
function PaymentStatusBadge({
  order,
  onChange,
}: {
  order: POOrder;
  onChange: (id: string, status: PaymentStatus, paidAmount?: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showDpInput, setShowDpInput] = useState(false);
  const [dpValue, setDpValue] = useState(order.paid_amount?.toString() || "");

  const config =
    PAYMENT_CONFIG[order.payment_status] ?? PAYMENT_CONFIG.BELUM_BAYAR;
  const Icon = config.icon;

  function handleSelect(status: PaymentStatus) {
    if (status === "DP") {
      setShowDpInput(true);
      setOpen(false);
      return;
    }
    onChange(order.id, status);
    setOpen(false);
  }

  function handleConfirmDp() {
    const amount = parseFloat(dpValue) || 0;
    onChange(order.id, "DP", amount);
    setShowDpInput(false);
  }

  if (showDpInput) {
    return (
      <div
        className="flex items-center gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="number"
          autoFocus
          placeholder="Nominal DP"
          value={dpValue}
          onChange={(e) => setDpValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleConfirmDp()}
          className="w-24 text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 hover:border-[#49bfb4]/50 focus:ring-2 focus:ring-[#49bfb4] focus:border-[#49bfb4] outline-none transition-colors duration-150"
        />
        <button
          onClick={handleConfirmDp}
          className="text-[10px] font-semibold px-2 py-1 bg-[#124540] hover:bg-[#0d332f] text-white rounded-md transition-colors duration-150"
        >
          OK
        </button>
        <button
          onClick={() => setShowDpInput(false)}
          className="text-[10px] font-semibold px-2 py-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors duration-150"
        >
          Batal
        </button>
      </div>
    );
  }

  return (
    <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors duration-150 ${config.className}`}
      >
        <Icon size={11} />
        {config.label}
        {order.payment_status === "DP" && order.paid_amount > 0 && (
          <span className="font-mono tabular-nums normal-case opacity-75">
            · {formatRupiah(order.paid_amount)}
          </span>
        )}
        <ChevronDown size={11} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1.5 right-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md overflow-hidden min-w-[140px]">
            {PAYMENT_OPTIONS.map((status) => {
              const c = PAYMENT_CONFIG[status];
              const I = c.icon;
              return (
                <button
                  key={status}
                  onClick={() => handleSelect(status)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors duration-150 text-left"
                >
                  <I size={13} className={c.iconClass} />
                  {c.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function POOrderList() {
  const { orders, setOrders, products, setting, loading, refreshing, reload } =
    usePOAdminData();
  const { notify, confirmAsync } = useDialog();
  const [selected, setSelected] = useState<POOrder | null>(null);
  const [editing, setEditing] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [filterType, setFilterType] = useState<"ALL" | "PUBLIC" | "RESELLER">(
    "ALL",
  );
  const [filterPayment, setFilterPayment] = useState<"ALL" | PaymentStatus>(
    "ALL",
  );
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  async function handleDownloadPdf(order: POOrder) {
    setDownloadingPdf(true);
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const { jsPDF } = await import("jspdf");

      const node = printRef.current;
      if (!node) return;

      const canvas = await html2canvas(node, {
        scale: 3,
        backgroundColor: "#ffffff",
        useCORS: true,
      });

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      // ── Atur margin di sini (mm) ──
      const MARGIN_MM = 10;

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const contentWidthMM = pageWidth - MARGIN_MM * 2;
      const contentHeightMM = pageHeight - MARGIN_MM * 2;

      // Berapa piksel canvas asli setara 1mm konten, lalu berapa piksel muat 1 halaman
      const pxPerMm = canvas.width / contentWidthMM;
      const pageHeightPx = Math.floor(contentHeightMM * pxPerMm);

      const totalPages = Math.max(1, Math.ceil(canvas.height / pageHeightPx));

      for (let i = 0; i < totalPages; i++) {
        const sourceY = i * pageHeightPx;
        const sliceHeightPx = Math.min(pageHeightPx, canvas.height - sourceY);

        // Potong canvas asli jadi satu halaman penuh (bukan cuma digeser)
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeightPx;
        const ctx = pageCanvas.getContext("2d");
        if (!ctx) continue;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(
          canvas,
          0,
          sourceY,
          canvas.width,
          sliceHeightPx,
          0,
          0,
          canvas.width,
          sliceHeightPx,
        );

        const sliceImgData = pageCanvas.toDataURL("image/jpeg", 0.75);
        const sliceHeightMM = sliceHeightPx / pxPerMm;

        if (i > 0) pdf.addPage();
        pdf.addImage(
          sliceImgData,
          "JPEG",
          MARGIN_MM,
          MARGIN_MM,
          contentWidthMM,
          sliceHeightMM,
          undefined,
          "FAST",
        );
      }

      pdf.save(`Struk-${order.po_number}.pdf`);
    } catch (err) {
      console.error(err);
      notify("Gagal membuat PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  // Produk & pengaturan sudah dimuat bersama pesanan; hanya muat ulang
  // kalau sebelumnya gagal terambil.
  async function openEditMode() {
    if (products.length === 0 || !setting) {
      setLoadingMeta(true);
      await reload();
      setLoadingMeta(false);
    }
    setEditing(true);
  }

  function handleOrderSaved(updated: POOrder) {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    setSelected(updated);
    setEditing(false);
  }

  async function handleDelete(id: string, po_number: string) {
    const ok = await confirmAsync(
      `Hapus pesanan ${po_number}? Tindakan ini tidak bisa dibatalkan.`,
      { title: "Hapus Pesanan" },
    );
    if (!ok) return;
    const result = await deletePOOrder(id);
    if (result.success) {
      setOrders((prev) => prev.filter((o) => o.id !== id));
      if (selected?.id === id) setSelected(null);
    } else {
      notify("Gagal menghapus: " + result.error);
    }
  }

  async function handlePaymentChange(
    id: string,
    status: PaymentStatus,
    paidAmount?: number,
  ) {
    const target = orders.find((o) => o.id === id);
    const resolvedAmount =
      paidAmount !== undefined
        ? paidAmount
        : status === "LUNAS"
          ? (target?.total_amount ?? 0)
          : status === "BELUM_BAYAR"
            ? 0
            : (target?.paid_amount ?? 0);

    // Optimistic update di UI dulu
    setOrders((prev) =>
      prev.map((o) =>
        o.id === id
          ? { ...o, payment_status: status, paid_amount: resolvedAmount }
          : o,
      ),
    );
    if (selected?.id === id) {
      setSelected((prev) =>
        prev
          ? { ...prev, payment_status: status, paid_amount: resolvedAmount }
          : prev,
      );
    }

    const result = await updatePaymentStatus(id, status, resolvedAmount);
    if (!result.success) {
      notify("Gagal update status pembayaran: " + result.error);
      void reload(); // rollback dengan reload data asli dari server
    }
  }

  const filtered = orders.filter((o) => {
    const matchType = filterType === "ALL" || o.customer_type === filterType;
    const matchPayment =
      filterPayment === "ALL" || o.payment_status === filterPayment;
    const matchSearch =
      o.po_number.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_name.toLowerCase().includes(search.toLowerCase());
    return matchType && matchPayment && matchSearch;
  });

  // Tabel hanya menampilkan sebagian dulu supaya ringan; ekspor Excel
  // tetap memakai seluruh `filtered`.
  const { visible, remaining, showMore, showAll } = usePagedList(
    filtered,
    50,
    `${search}|${filterType}|${filterPayment}`,
  );

  /* ── Export Excel (sesuai data yang sedang ter-filter) ──────── */
  async function handleExportExcel() {
    if (filtered.length === 0) {
      notify("Tidak ada data untuk diexport.");
      return;
    }
    setExporting(true);
    try {
      const XLSX = await import("xlsx");

      const paymentLabel = (status: PaymentStatus) =>
        PAYMENT_CONFIG[status]?.label ?? status;

      // ── Sheet 1: Rekap per item (1 baris = 1 item produk) ──
      const itemRows: Record<string, any>[] = [];
      filtered.forEach((order) => {
        order.order_items.forEach((item) => {
          itemRows.push({
            "Kode PO": order.po_number,
            Tipe: order.customer_type,
            Reseller: order.po_resellers
              ? `${order.po_resellers.nama} (${order.po_resellers.kode})`
              : "-",
            Pelanggan: order.customer_name,
            WhatsApp: order.customer_wa,
            "Status Bayar": paymentLabel(order.payment_status),
            "Jumlah Dibayar": order.paid_amount || 0,
            "Metode Kirim": order.delivery_method,
            Alamat: order.shipping_address || "-",
            Produk: item.product_name,
            Warna: item.warna,
            Lengan: item.lengan,
            Ukuran: item.ukuran,
            Qty: item.qty,
            "Harga Satuan": item.harga_satuan,
            Subtotal: item.subtotal,
            Catatan: order.notes || "-",
            Tanggal: new Date(order.created_at).toLocaleString("id-ID", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
          });
        });
      });

      // ── Sheet 2: Rekap per pesanan (1 baris = 1 PO) ──
      const orderRows = filtered.map((order) => ({
        "Kode PO": order.po_number,
        Tipe: order.customer_type,
        Reseller: order.po_resellers
          ? `${order.po_resellers.nama} (${order.po_resellers.kode})`
          : "-",
        Pelanggan: order.customer_name,
        WhatsApp: order.customer_wa,
        "Status Bayar": paymentLabel(order.payment_status),
        "Jumlah Dibayar": order.paid_amount || 0,
        "Sisa Tagihan": Math.max(
          0,
          order.total_amount - (order.paid_amount || 0),
        ),
        "Metode Kirim": order.delivery_method,
        Alamat: order.shipping_address || "-",
        "Jumlah Item": order.order_items.reduce((s, i) => s + i.qty, 0),
        "Total (Rp)": order.total_amount,
        Catatan: order.notes || "-",
        Tanggal: new Date(order.created_at).toLocaleString("id-ID", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      }));

      const wb = XLSX.utils.book_new();

      const wsOrders = XLSX.utils.json_to_sheet(orderRows);
      wsOrders["!cols"] = [
        { wch: 14 }, // Kode PO
        { wch: 10 }, // Tipe
        { wch: 22 }, // Reseller
        { wch: 20 }, // Pelanggan
        { wch: 16 }, // WhatsApp
        { wch: 13 }, // Status Bayar
        { wch: 14 }, // Jumlah Dibayar
        { wch: 14 }, // Sisa Tagihan
        { wch: 12 }, // Metode Kirim
        { wch: 28 }, // Alamat
        { wch: 12 }, // Jumlah Item
        { wch: 14 }, // Total
        { wch: 24 }, // Catatan
        { wch: 18 }, // Tanggal
      ];
      XLSX.utils.book_append_sheet(wb, wsOrders, "Rekap Pesanan");

      const wsItems = XLSX.utils.json_to_sheet(itemRows);
      wsItems["!cols"] = [
        { wch: 14 }, // Kode PO
        { wch: 10 }, // Tipe
        { wch: 22 }, // Reseller
        { wch: 20 }, // Pelanggan
        { wch: 16 }, // WhatsApp
        { wch: 13 }, // Status Bayar
        { wch: 14 }, // Jumlah Dibayar
        { wch: 12 }, // Metode Kirim
        { wch: 28 }, // Alamat
        { wch: 22 }, // Produk
        { wch: 12 }, // Warna
        { wch: 10 }, // Lengan
        { wch: 10 }, // Ukuran
        { wch: 8 }, // Qty
        { wch: 14 }, // Harga Satuan
        { wch: 14 }, // Subtotal
        { wch: 24 }, // Catatan
        { wch: 18 }, // Tanggal
      ];
      XLSX.utils.book_append_sheet(wb, wsItems, "Detail Item");

      const tanggalFile = new Date().toISOString().slice(0, 10);
      const labelFilter =
        filterType === "ALL"
          ? "Semua"
          : filterType === "PUBLIC"
            ? "Public"
            : "Reseller";
      const labelPayment =
        filterPayment === "ALL" ? "" : `-${paymentLabel(filterPayment)}`;

      XLSX.writeFile(
        wb,
        `Rekap-PO-${labelFilter}${labelPayment}-${tanggalFile}.xlsx`,
      );
    } catch (err) {
      console.error(err);
      notify(
        "Gagal membuat file Excel. Pastikan package 'xlsx' sudah terinstall.",
      );
    } finally {
      setExporting(false);
    }
  }

  async function handleExportExcelAll() {
    if (orders.length === 0) {
      notify("Tidak ada data untuk diexport.");
      return;
    }
    setExporting(true);
    try {
      const XLSX = await import("xlsx");

      const paymentLabel = (status: PaymentStatus) =>
        PAYMENT_CONFIG[status]?.label ?? status;

      const itemRows: Record<string, any>[] = [];
      orders.forEach((order) => {
        // ← pakai orders, bukan filtered
        order.order_items.forEach((item) => {
          itemRows.push({
            "Kode PO": order.po_number,
            Tipe: order.customer_type,
            Reseller: order.po_resellers
              ? `${order.po_resellers.nama} (${order.po_resellers.kode})`
              : "-",
            Pelanggan: order.customer_name,
            WhatsApp: order.customer_wa,
            "Status Bayar": paymentLabel(order.payment_status),
            "Jumlah Dibayar": order.paid_amount || 0,
            "Metode Kirim": order.delivery_method,
            Alamat: order.shipping_address || "-",
            Produk: item.product_name,
            Warna: item.warna,
            Lengan: item.lengan,
            Ukuran: item.ukuran,
            Qty: item.qty,
            "Harga Satuan": item.harga_satuan,
            Subtotal: item.subtotal,
            Catatan: order.notes || "-",
            Tanggal: new Date(order.created_at).toLocaleString("id-ID", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
          });
        });
      });

      const orderRows = orders.map((order) => ({
        // ← pakai orders juga
        "Kode PO": order.po_number,
        Tipe: order.customer_type,
        Reseller: order.po_resellers
          ? `${order.po_resellers.nama} (${order.po_resellers.kode})`
          : "-",
        Pelanggan: order.customer_name,
        WhatsApp: order.customer_wa,
        "Status Bayar": paymentLabel(order.payment_status),
        "Jumlah Dibayar": order.paid_amount || 0,
        "Sisa Tagihan": Math.max(
          0,
          order.total_amount - (order.paid_amount || 0),
        ),
        "Metode Kirim": order.delivery_method,
        Alamat: order.shipping_address || "-",
        "Jumlah Item": order.order_items.reduce((s, i) => s + i.qty, 0),
        "Total (Rp)": order.total_amount,
        Catatan: order.notes || "-",
        Tanggal: new Date(order.created_at).toLocaleString("id-ID", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      }));

      const wb = XLSX.utils.book_new();
      const wsOrders = XLSX.utils.json_to_sheet(orderRows);
      XLSX.utils.book_append_sheet(wb, wsOrders, "Rekap Pesanan");
      const wsItems = XLSX.utils.json_to_sheet(itemRows);
      XLSX.utils.book_append_sheet(wb, wsItems, "Detail Item");

      const tanggalFile = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `Rekap-PO-SEMUA-${tanggalFile}.xlsx`);
    } catch (err) {
      console.error(err);
      notify("Gagal membuat file Excel.");
    } finally {
      setExporting(false);
    }
  }

  /* ── Loading ───────────────────────────────────────────────── */
  if (loading)
    return (
      <div className="flex items-center gap-3 py-8 text-zinc-400 dark:text-zinc-500">
        <div className="w-5 h-5 border-2 border-zinc-300 dark:border-zinc-600 border-t-[#49bfb4] rounded-full animate-spin" />
        <span className="text-sm">Memuat pesanan...</span>
      </div>
    );

  /* ── Edit View ─────────────────────────────────────────────── */
  if (editing && selected && setting) {
    return (
      <POOrderEditForm
        order={selected}
        products={products}
        setting={setting}
        onCancel={() => setEditing(false)}
        onSaved={handleOrderSaved}
      />
    );
  }

  /* ── Detail View ───────────────────────────────────────────── */
  if (selected) {
    return (
      <div className="w-full max-w-4xl mx-auto space-y-5">
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-2 text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-white transition-colors duration-150"
        >
          <ArrowLeft size={15} /> Kembali ke daftar
        </button>

        <div className="space-y-4 md:space-y-5">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500 mb-1">
                Kode PO
              </p>
              <p className="text-2xl md:text-3xl font-semibold text-zinc-900 dark:text-white font-mono tabular-nums tracking-tight">
                {selected.po_number}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span
                className={`inline-flex w-max text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full border border-zinc-300/70 dark:border-zinc-700 bg-white/80 dark:bg-zinc-800/80
                ${
                  selected.customer_type === "RESELLER"
                    ? "text-[#49bfb4]"
                    : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                {selected.customer_type}
              </span>
              <PaymentStatusBadge
                order={selected}
                onChange={handlePaymentChange}
              />
            </div>
          </div>

          {/* Info Card */}
          <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 md:p-5 space-y-4 text-sm">
            {[
              { label: "Nama", value: selected.customer_name, bold: true },
              {
                label: "WhatsApp",
                value: (
                  <a
                    href={`https://wa.me/${selected.customer_wa}`}
                    target="_blank"
                    className="font-semibold text-[#49bfb4] hover:underline"
                  >
                    {selected.customer_wa}
                  </a>
                ),
              },
              { label: "Metode Kirim", value: selected.delivery_method },
              selected.shipping_address && {
                label: "Alamat",
                value: selected.shipping_address,
              },
              selected.po_resellers && {
                label: "Reseller",
                value: `${selected.po_resellers.nama} (${selected.po_resellers.kode})`,
              },
              selected.payment_status === "DP" && {
                label: "Sisa Tagihan",
                value: formatRupiah(
                  Math.max(
                    0,
                    selected.total_amount - (selected.paid_amount || 0),
                  ),
                ),
              },
              {
                label: "Tanggal",
                value: new Date(selected.created_at).toLocaleDateString(
                  "id-ID",
                  {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  },
                ),
              },
            ]
              .filter(Boolean)
              .map((row: any, idx) => (
                <div
                  key={row.label}
                  className={`flex flex-col sm:flex-row sm:justify-between items-start gap-1 sm:gap-4 ${
                    idx !== 0
                      ? "pt-3 border-t border-zinc-200 dark:border-zinc-800"
                      : ""
                  }`}
                >
                  <span className="text-zinc-500 dark:text-zinc-400 shrink-0 text-xs sm:text-sm font-semibold sm:font-normal">
                    {row.label}
                  </span>
                  <span
                    className={`sm:text-right ${
                      row.bold
                        ? "font-semibold text-zinc-900 dark:text-white"
                        : "text-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    {row.value}
                  </span>
                </div>
              ))}
          </div>

          {/* Items Table */}
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden overflow-x-auto">
            <div className="bg-zinc-50 dark:bg-zinc-900 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                <Package size={12} /> Item Pesanan
              </p>
            </div>
            <table className="w-full text-xs min-w-[500px]">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500 bg-white dark:bg-zinc-950">
                  <th className="text-left px-4 py-3 font-semibold">Produk</th>
                  <th className="text-center px-3 py-3 font-semibold">Warna</th>
                  <th className="text-center px-3 py-3 font-semibold">
                    Lengan
                  </th>
                  <th className="text-center px-3 py-3 font-semibold">
                    Ukuran
                  </th>
                  <th className="text-center px-3 py-3 font-semibold">Qty</th>
                  <th className="text-right px-4 py-3 font-semibold">
                    Subtotal
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-transparent">
                {selected.order_items.map((item, i) => (
                  <tr
                    key={i}
                    className="border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150"
                  >
                    <td className="px-4 py-3 font-semibold text-zinc-800 dark:text-zinc-200">
                      {item.product_name}
                    </td>
                    <td className="px-3 py-3 text-center text-zinc-600 dark:text-zinc-400">
                      {item.warna}
                    </td>
                    <td className="px-3 py-3 text-center text-zinc-600 dark:text-zinc-400">
                      {item.lengan}
                    </td>
                    <td className="px-3 py-3 text-center text-zinc-600 dark:text-zinc-400">
                      {item.ukuran}
                    </td>
                    <td className="px-3 py-3 text-center font-mono tabular-nums font-semibold text-zinc-700 dark:text-zinc-300">
                      {item.qty}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">
                      {formatRupiah(item.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-between items-center px-4 py-4 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Total Keseluruhan
              </span>
              <span className="font-mono tabular-nums text-lg font-semibold text-emerald-600 dark:text-emerald-500">
                {formatRupiah(selected.total_amount)}
              </span>
            </div>
          </div>

          {selected.notes && (
            <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3.5 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 block mb-1">
                Catatan Pembeli
              </span>
              {selected.notes}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={openEditMode}
              disabled={loadingMeta}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 text-sm border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 py-3 rounded-md font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150 disabled:opacity-50"
            >
              {loadingMeta ? (
                <div className="w-4 h-4 border-2 border-zinc-300 border-t-[#49bfb4] rounded-full animate-spin" />
              ) : (
                <Pencil size={15} />
              )}
              Edit Pesanan
            </button>

            {/* Cetak resi A6 satu-satuan sudah dipindah & ditangani penuh
                di tab "Pengiriman" (cetak massal), jadi tombol Print di
                sini sengaja dihapus supaya tidak ada dua jalur cetak. */}
            <button
              onClick={() => handleDownloadPdf(selected)}
              disabled={downloadingPdf}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 text-sm border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 py-3 rounded-md font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150 disabled:opacity-50"
            >
              <Download
                size={15}
                className={downloadingPdf ? "animate-bounce" : ""}
              />
              {downloadingPdf ? "Membuat..." : "Download PDF"}
            </button>
            {/* ── akhir tombol baru ── */}

            <a
              href={buildWaLink(
                selected.customer_wa,
                buildOrderConfirmationMessage(selected),
              )}
              target="_blank"
              className="w-full sm:flex-1 flex items-center justify-center gap-2 text-sm font-semibold bg-[#124540] hover:bg-[#0d332f] text-white py-3 rounded-md transition-colors duration-150"
            >
              <MessageCircle size={16} /> Hubungi via WhatsApp
            </a>
            <button
              onClick={() => handleDelete(selected.id, selected.po_number)}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 text-sm border border-red-200 dark:border-red-900 text-red-600 dark:text-red-500 py-3 rounded-md font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors duration-150"
            >
              <Trash2 size={15} /> Hapus Pesanan
            </button>
          </div>
        </div>
        {/* Area A4 KHUSUS untuk Download PDF (html2canvas) */}
        <div
          style={{ position: "absolute", left: "-9999px", top: 0 }}
          ref={printRef}
        >
          <POOrderPrintSlip
            order={selected}
            {...getStoreInfo(setting)}
            logoUrl={setting?.logo_image_url || undefined}
          />
        </div>
      </div>
    );
  }

  /* ── List View ─────────────────────────────────────────────── */
  return (
    <div className="w-full space-y-4">
      {/* Filter & Search */}
      <div className="flex flex-col lg:flex-row gap-3">
        {/* Search Bar */}
        <div className="relative w-full lg:flex-1">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
          />
          <input
            type="text"
            placeholder="Cari nama atau kode PO..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-md pl-10 pr-4 py-3 text-sm text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 hover:border-[#49bfb4]/50 focus:ring-2 focus:ring-[#49bfb4] focus:border-[#49bfb4] outline-none transition-colors duration-150"
          />
        </div>

        {/* Refresh & Export */}
        <div className="flex flex-row gap-2 sm:gap-3">
          <button
            onClick={() => void reload()}
            disabled={refreshing}
            className="flex-1 sm:w-auto flex justify-center items-center gap-2 text-sm px-3 sm:px-5 py-3 border border-zinc-300 dark:border-zinc-700 rounded-md text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>

          <button
            onClick={handleExportExcel}
            disabled={exporting || filtered.length === 0}
            className="flex-1 sm:w-auto flex justify-center items-center gap-2 text-sm px-3 sm:px-5 py-3 bg-[#124540] hover:bg-[#0d332f] disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white rounded-md font-semibold transition-colors duration-150"
          >
            <Download size={14} className={exporting ? "animate-bounce" : ""} />
            {exporting ? "Membuat..." : "Excel"}
          </button>
        </div>
      </div>

      {/* Tab Filter Tipe & Pembayaran */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <div className="flex w-full sm:w-auto bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md p-1.5">
          {(["ALL", "PUBLIC", "RESELLER"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`flex-1 sm:flex-none text-xs font-semibold px-4 py-2 rounded-md transition-colors duration-150
                ${
                  filterType === type
                    ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
                    : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
                }`}
            >
              {type === "ALL" ? "Semua" : type}
            </button>
          ))}
        </div>

        <div className="flex w-full sm:w-auto bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md p-1.5">
          {(["ALL", "BELUM_BAYAR", "DP", "LUNAS"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilterPayment(status)}
              className={`flex-1 sm:flex-none text-xs font-semibold px-4 py-2 rounded-md transition-colors duration-150
                ${
                  filterPayment === status
                    ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
                    : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
                }`}
            >
              {status === "ALL" ? "Semua Bayar" : PAYMENT_CONFIG[status].label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        <span className="font-mono tabular-nums">{filtered.length}</span>{" "}
        pesanan ditemukan
      </p>

      {/* Empty State */}
      {filtered.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-3 text-zinc-400 dark:text-zinc-500 border border-zinc-200 dark:border-zinc-800 border-dashed rounded-xl">
          <Package size={32} strokeWidth={1.2} />
          <p className="text-sm font-semibold">Belum ada pesanan</p>
          <p className="text-xs">Coba ubah filter atau kata kunci pencarian</p>
        </div>
      ) : (
        /* Order Table */
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden overflow-x-auto bg-white dark:bg-zinc-950">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                <th className="text-left px-5 py-3.5">Kode PO</th>
                <th className="text-left px-5 py-3.5">Pelanggan</th>
                <th className="text-center px-5 py-3.5">Tipe</th>
                <th className="text-center px-5 py-3.5">Pembayaran</th>
                <th className="text-right px-5 py-3.5">Total</th>
                <th className="text-right px-5 py-3.5">Tanggal</th>
                <th className="px-5 py-3.5 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => setSelected(order)}
                  className="border-b border-zinc-100 dark:border-zinc-800/60 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-900 cursor-pointer group transition-colors duration-150"
                >
                  <td className="px-5 py-4">
                    <span className="font-mono tabular-nums text-xs font-semibold px-2.5 py-1 rounded-full border border-zinc-300/70 dark:border-zinc-700 bg-white/80 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300">
                      {order.po_number}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-semibold text-zinc-800 dark:text-zinc-200">
                      {order.customer_name}
                    </p>
                    {order.po_resellers && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {order.po_resellers.kode}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wide
                      ${
                        order.customer_type === "RESELLER"
                          ? "text-[#49bfb4]"
                          : "text-zinc-400 dark:text-zinc-500"
                      }`}
                    >
                      {order.customer_type}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <PaymentStatusBadge
                      order={order}
                      onChange={handlePaymentChange}
                    />
                  </td>
                  <td className="px-5 py-4 text-right font-mono tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">
                    {formatRupiah(order.total_amount)}
                  </td>
                  <td className="px-5 py-4 text-right font-mono tabular-nums text-xs text-zinc-500 dark:text-zinc-400">
                    {new Date(order.created_at).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                    })}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <ChevronRight
                      size={18}
                      className="text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-500 dark:group-hover:text-zinc-400 transition-colors duration-150 ml-auto"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoadMore
        remaining={remaining}
        onShowMore={showMore}
        onShowAll={showAll}
      />
    </div>
  );
}
