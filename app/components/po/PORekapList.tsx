"use client";

import { useMemo, useState } from "react";
import { usePOAdminData } from "./POAdminDataContext";
import { useDialog } from "@/app/components/ui/DialogProvider";
import {
  RefreshCw,
  ClipboardList,
  Download,
  AlertTriangle,
  ShoppingBag,
  Shirt,
  Baby,
  Snowflake,
  PackageX,
  PackageCheck,
} from "lucide-react";

/* ── Tipe bantu untuk hasil rekap ── */
type RekapRow = {
  jenis: string; // Warna + Lengan, mis. "Hitam Pendek"
  perUkuran: Record<string, number>; // { S: 1, M: 0, L: 5, ... }
  jumlah: number;
  isExtra: boolean; // true jika kombinasi tidak terdaftar di master produk
};

type RekapProduk = {
  product_id: string;
  product_code: string;
  product_name: string;
  ukuranList: string[]; // urutan kolom, dari available_sizes produk
  rows: RekapRow[];
  totalPerUkuran: Record<string, number>;
  totalJumlah: number;
};

export default function PORekapList() {
  const { orders, products, setting, loading, refreshing, reload } =
    usePOAdminData();
  const { notify } = useDialog();
  const [exporting, setExporting] = useState(false);
  const [exportingShortage, setExportingShortage] = useState(false);
  const [subTab, setSubTab] = useState<"produksi" | "kekurangan">("produksi");

  /* ── Olah data pesanan menjadi rekap per produk ── */
  const rekapList: RekapProduk[] = useMemo(() => {
    if (products.length === 0) return [];

    // Map product_id -> produk master, untuk lookup cepat
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Kumpulkan total qty per (product_id, jenis/Warna+Lengan, ukuran)
    // key: `${product_id}::${jenis}::${ukuran}`
    const qtyMap = new Map<string, number>();
    // Catat product_id mana saja yang punya minimal 1 item pesanan
    const productIdsWithOrders = new Set<string>();

    orders.forEach((order) => {
      order.order_items.forEach((item) => {
        productIdsWithOrders.add(item.product_id);
        const jenis = [item.lengan, item.warna]
          .filter(Boolean)
          .join(" ")
          .trim();
        // Format: "Warna Lengan" sesuai contoh ("Hitam Pendek")
        const jenisLabel = `${item.warna} ${item.lengan}`.trim() || "-";
        const key = `${item.product_id}::${jenisLabel}::${item.ukuran}`;
        qtyMap.set(key, (qtyMap.get(key) || 0) + item.qty);
      });
    });

    const result: RekapProduk[] = [];

    productIdsWithOrders.forEach((productId) => {
      const master = productMap.get(productId);

      // Nama & kode produk: fallback ke data dari order_items jika produk sudah dihapus dari master
      const fallbackItem = orders
        .flatMap((o) => o.order_items)
        .find((i) => i.product_id === productId);

      const productCode = master?.product_code || "—";
      const productName =
        master?.name || fallbackItem?.product_name || "Produk Tidak Dikenal";

      // Daftar ukuran: pakai urutan dari master produk jika ada
      const masterUkuran = master?.available_sizes || [];

      // Daftar kombinasi Warna x Lengan resmi dari master produk
      const masterColors = master?.colors || [];
      const masterSleeves = master?.sleeve_types || [];
      const masterJenisList: string[] = [];
      masterColors.forEach((warna) => {
        masterSleeves.forEach((lengan) => {
          masterJenisList.push(`${warna} ${lengan}`.trim());
        });
      });
      // Jika produk tidak punya sleeve_types (misal produk tanpa varian lengan)
      if (masterSleeves.length === 0) {
        masterColors.forEach((warna) => masterJenisList.push(warna));
      }

      // Temukan semua kombinasi jenis & ukuran yang benar-benar muncul di pesanan untuk produk ini
      const jenisSetFromOrders = new Set<string>();
      const ukuranSetFromOrders = new Set<string>();
      qtyMap.forEach((_, key) => {
        const [pid, jenis, ukuran] = key.split("::");
        if (pid === productId) {
          jenisSetFromOrders.add(jenis);
          ukuranSetFromOrders.add(ukuran);
        }
      });

      // Gabungkan ukuran: urutan master dulu, lalu tambahan yang muncul di order tapi tak ada di master
      const ukuranList = [...masterUkuran];
      ukuranSetFromOrders.forEach((u) => {
        if (!ukuranList.includes(u)) ukuranList.push(u);
      });

      // Gabungkan jenis: urutan master dulu, lalu tambahan ekstra (ditandai isExtra)
      const jenisListFinal: { label: string; isExtra: boolean }[] = [];
      masterJenisList.forEach((j) => {
        jenisListFinal.push({ label: j, isExtra: false });
      });
      jenisSetFromOrders.forEach((j) => {
        if (!masterJenisList.includes(j)) {
          jenisListFinal.push({ label: j, isExtra: true });
        }
      });

      // Bangun baris rekap
      const rows: RekapRow[] = jenisListFinal.map(({ label, isExtra }) => {
        const perUkuran: Record<string, number> = {};
        let jumlah = 0;
        ukuranList.forEach((ukuran) => {
          const qty = qtyMap.get(`${productId}::${label}::${ukuran}`) || 0;
          perUkuran[ukuran] = qty;
          jumlah += qty;
        });
        return { jenis: label, perUkuran, jumlah, isExtra };
      });

      // Hitung total per kolom ukuran & total keseluruhan
      const totalPerUkuran: Record<string, number> = {};
      let totalJumlah = 0;
      ukuranList.forEach((ukuran) => {
        const total = rows.reduce((s, r) => s + (r.perUkuran[ukuran] || 0), 0);
        totalPerUkuran[ukuran] = total;
        totalJumlah += total;
      });

      result.push({
        product_id: productId,
        product_code: productCode,
        product_name: productName,
        ukuranList,
        rows,
        totalPerUkuran,
        totalJumlah,
      });
    });

    // Urutkan berdasarkan sort_order produk master (jika ada), lalu nama produk
    result.sort((a, b) => {
      const ma = productMap.get(a.product_id);
      const mb = productMap.get(b.product_id);
      const sa = ma?.sort_order ?? 999;
      const sb = mb?.sort_order ?? 999;
      if (sa !== sb) return sa - sb;
      return a.product_name.localeCompare(b.product_name);
    });

    return result;
  }, [orders, products]);

  const totalUnitProduksi = rekapList.reduce((s, r) => s + r.totalJumlah, 0);

  /* ── Rekap Belanja Bahan: per Jenis Garmen (lintas semua produk) ── */
  type BelanjaRow = {
    label: string;
    perUkuran: Record<string, number>;
    jumlah: number;
  };
  type BelanjaSection = {
    key: string;
    label: string;
    columns: string[];
    rows: BelanjaRow[];
    totalPerUkuran: Record<string, number>;
    totalJumlah: number;
  };

  const GARMENT_LABELS: Record<string, string> = {
    kaos_dewasa: "Kaos Dewasa",
    kaos_kids: "Kaos Kids",
    sweater: "Sweater",
    hoodie: "Hoodie",
  };
  const GARMENT_ORDER = ["kaos_dewasa", "kaos_kids", "sweater", "hoodie"];

  const belanjaSections: BelanjaSection[] = useMemo(() => {
    if (orders.length === 0 || products.length === 0) return [];
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Kolom ukuran per garment: ambil urutan dari master produk dulu
    const columnsByGarment: Record<string, string[]> = {};
    products.forEach((p) => {
      const gt = p.garment_type || "kaos_dewasa";
      if (!columnsByGarment[gt]) columnsByGarment[gt] = [];
      p.available_sizes.forEach((u) => {
        if (!columnsByGarment[gt].includes(u)) columnsByGarment[gt].push(u);
      });
    });

    // Kumpulkan qty per garment_type::(warna+lengan)::ukuran, lintas SEMUA produk
    const qtyMap = new Map<string, number>();
    orders.forEach((order) => {
      order.order_items.forEach((item) => {
        const master = productMap.get(item.product_id);
        const garmentType = master?.garment_type || "kaos_dewasa";
        const jenisLabel = `${item.warna} ${item.lengan}`.trim() || "-";
        const key = `${garmentType}::${jenisLabel}::${item.ukuran}`;
        qtyMap.set(key, (qtyMap.get(key) || 0) + item.qty);

        // Jaga-jaga kalau ukuran di order tidak ada di master produk manapun
        if (!columnsByGarment[garmentType]) columnsByGarment[garmentType] = [];
        if (!columnsByGarment[garmentType].includes(item.ukuran)) {
          columnsByGarment[garmentType].push(item.ukuran);
        }
      });
    });

    const sections: BelanjaSection[] = [];

    GARMENT_ORDER.forEach((garmentType) => {
      const columns = columnsByGarment[garmentType];
      if (!columns || columns.length === 0) return;

      const jenisSet = new Set<string>();
      qtyMap.forEach((_, key) => {
        const [gt, jenis] = key.split("::");
        if (gt === garmentType) jenisSet.add(jenis);
      });
      if (jenisSet.size === 0) return;

      const rows: BelanjaRow[] = Array.from(jenisSet)
        .sort()
        .map((jenis) => {
          const perUkuran: Record<string, number> = {};
          let jumlah = 0;
          columns.forEach((ukuran) => {
            const qty = qtyMap.get(`${garmentType}::${jenis}::${ukuran}`) || 0;
            perUkuran[ukuran] = qty;
            jumlah += qty;
          });
          return { label: jenis, perUkuran, jumlah };
        });

      const totalPerUkuran: Record<string, number> = {};
      let totalJumlah = 0;
      columns.forEach((ukuran) => {
        const t = rows.reduce((s, r) => s + (r.perUkuran[ukuran] || 0), 0);
        totalPerUkuran[ukuran] = t;
        totalJumlah += t;
      });

      sections.push({
        key: garmentType,
        label: GARMENT_LABELS[garmentType] || garmentType,
        columns,
        rows,
        totalPerUkuran,
        totalJumlah,
      });
    });

    return sections;
  }, [orders, products]);

  /* ── Rekap Kekurangan Stok: independen dari rekapList di atas.
     Sumbernya sama (orders) tapi hanya memproses item yang shortage_qty > 0,
     jadi tidak pernah mengubah/mengganggu perhitungan Rekap Produksi. ── */
  type ShortageDetail = {
    po_number: string;
    customer_name: string;
    qty: number;
  };
  type ShortageRow = {
    jenis: string;
    ukuran: string;
    totalKurang: number;
    details: ShortageDetail[];
  };
  type ShortageProduk = {
    product_id: string;
    product_code: string;
    product_name: string;
    rows: ShortageRow[];
    totalKurang: number;
  };

  const shortageList: ShortageProduk[] = useMemo(() => {
    const productMap = new Map(products.map((p) => [p.id, p]));
    const byProduct = new Map<string, ShortageProduk>();

    orders.forEach((order) => {
      order.order_items.forEach((item) => {
        const shortage = item.shortage_qty || 0;
        if (shortage <= 0) return; // hanya proses item yang ditandai kurang

        const master = productMap.get(item.product_id);
        const productCode = master?.product_code || "—";
        const productName =
          master?.name || item.product_name || "Produk Tidak Dikenal";
        const jenisLabel = `${item.warna} ${item.lengan}`.trim() || "-";

        if (!byProduct.has(item.product_id)) {
          byProduct.set(item.product_id, {
            product_id: item.product_id,
            product_code: productCode,
            product_name: productName,
            rows: [],
            totalKurang: 0,
          });
        }
        const produk = byProduct.get(item.product_id)!;

        let row = produk.rows.find(
          (r) => r.jenis === jenisLabel && r.ukuran === item.ukuran,
        );
        if (!row) {
          row = {
            jenis: jenisLabel,
            ukuran: item.ukuran,
            totalKurang: 0,
            details: [],
          };
          produk.rows.push(row);
        }
        row.totalKurang += shortage;
        row.details.push({
          po_number: order.po_number,
          customer_name: order.customer_name,
          qty: shortage,
        });
        produk.totalKurang += shortage;
      });
    });

    const result = Array.from(byProduct.values());
    result.sort((a, b) => a.product_name.localeCompare(b.product_name));
    result.forEach((p) =>
      p.rows.sort(
        (a, b) =>
          a.jenis.localeCompare(b.jenis) || a.ukuran.localeCompare(b.ukuran),
      ),
    );
    return result;
  }, [orders, products]);

  const totalShortageUnits = shortageList.reduce(
    (s, p) => s + p.totalKurang,
    0,
  );

  /* ── Export Excel: gabung jadi 2 sheet (Belanja & Produksi) ── */
  async function handleExportExcel() {
    if (rekapList.length === 0) {
      notify("Tidak ada data rekap untuk diexport.");
      return;
    }
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      // ── Sheet 1: Rekap Belanja Bahan (semua jenis garmen digabung) ──
      if (belanjaSections.length > 0) {
        const belanjaData: (string | number)[][] = [];
        let maxCols = 0;

        belanjaSections.forEach((section, idx) => {
          if (idx > 0) belanjaData.push([]); // baris kosong pemisah antar section

          belanjaData.push([section.label]);
          const header = ["WARNA / LENGAN", ...section.columns, "JUMLAH"];
          belanjaData.push(header);
          maxCols = Math.max(maxCols, header.length);

          section.rows.forEach((row) => {
            belanjaData.push([
              row.label,
              ...section.columns.map((u) => row.perUkuran[u] || 0),
              row.jumlah,
            ]);
          });

          belanjaData.push([
            "TOTAL",
            ...section.columns.map((u) => section.totalPerUkuran[u] || 0),
            section.totalJumlah,
          ]);
        });

        const wsBelanja = XLSX.utils.aoa_to_sheet(belanjaData);
        wsBelanja["!cols"] = [
          { wch: 24 },
          ...Array(Math.max(maxCols - 2, 0)).fill({ wch: 8 }),
          { wch: 10 },
        ];
        XLSX.utils.book_append_sheet(wb, wsBelanja, "Rekap Belanja Bahan");
      }

      // ── Sheet 2: Rekap Produksi per Produk (semua produk digabung) ──
      const rekapData: (string | number)[][] = [];
      let maxColsProduk = 0;

      rekapList.forEach((rekap, idx) => {
        if (idx > 0) rekapData.push([]); // baris kosong pemisah antar produk

        rekapData.push([`${rekap.product_code} - ${rekap.product_name}`]);
        const header = ["JENIS", ...rekap.ukuranList, "JUMLAH"];
        rekapData.push(header);
        maxColsProduk = Math.max(maxColsProduk, header.length);

        rekap.rows.forEach((row) => {
          rekapData.push([
            row.isExtra ? `${row.jenis} (*)` : row.jenis,
            ...rekap.ukuranList.map((u) => row.perUkuran[u] || 0),
            row.jumlah,
          ]);
        });

        rekapData.push([
          "TOTAL",
          ...rekap.ukuranList.map((u) => rekap.totalPerUkuran[u] || 0),
          rekap.totalJumlah,
        ]);
      });

      const wsRekap = XLSX.utils.aoa_to_sheet(rekapData);
      wsRekap["!cols"] = [
        { wch: 24 },
        ...Array(Math.max(maxColsProduk - 2, 0)).fill({ wch: 8 }),
        { wch: 10 },
      ];
      XLSX.utils.book_append_sheet(wb, wsRekap, "Rekap Produksi");

      const tanggalFile = new Date().toISOString().slice(0, 10);
      const namaPO = (setting?.title || "PO")
        .replace(/[\\/?*[\]:]/g, "") // buang karakter terlarang nama file
        .trim();
      XLSX.writeFile(wb, `Rekap-${namaPO}-${tanggalFile}.xlsx`);
    } catch (err) {
      console.error(err);
      notify(
        "Gagal membuat file Excel. Pastikan package 'xlsx' sudah terinstall.",
      );
    } finally {
      setExporting(false);
    }
  }

  /* ── Export Excel: Rekap Kekurangan Stok ── */
  async function handleExportShortageExcel() {
    if (shortageList.length === 0) {
      notify("Tidak ada data kekurangan untuk diexport.");
      return;
    }
    setExportingShortage(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      // ── Sheet 1: Detail Kekurangan (flat, per PO/customer) ──
      const detailHeader = [
        "KODE PRODUK",
        "NAMA PRODUK",
        "JENIS",
        "UKURAN",
        "NO PO",
        "CUSTOMER",
        "QTY KURANG",
      ];
      const detailData: (string | number)[][] = [detailHeader];

      shortageList.forEach((produk) => {
        produk.rows.forEach((row) => {
          row.details.forEach((d) => {
            detailData.push([
              produk.product_code,
              produk.product_name,
              row.jenis,
              row.ukuran,
              d.po_number,
              d.customer_name,
              d.qty,
            ]);
          });
        });
      });

      detailData.push([]);
      detailData.push(["", "", "", "", "", "TOTAL", totalShortageUnits]);

      const wsDetail = XLSX.utils.aoa_to_sheet(detailData);
      wsDetail["!cols"] = [
        { wch: 14 },
        { wch: 26 },
        { wch: 16 },
        { wch: 8 },
        { wch: 14 },
        { wch: 20 },
        { wch: 12 },
      ];
      XLSX.utils.book_append_sheet(wb, wsDetail, "Detail Kekurangan");

      // ── Sheet 2: Ringkasan per Produk & Jenis/Ukuran ──
      const ringkasanData: (string | number)[][] = [];
      shortageList.forEach((produk, idx) => {
        if (idx > 0) ringkasanData.push([]); // baris kosong pemisah antar produk

        ringkasanData.push([`${produk.product_code} - ${produk.product_name}`]);
        ringkasanData.push(["JENIS", "UKURAN", "QTY KURANG"]);

        produk.rows.forEach((row) => {
          ringkasanData.push([row.jenis, row.ukuran, row.totalKurang]);
        });

        ringkasanData.push(["", "TOTAL", produk.totalKurang]);
      });

      const wsRingkasan = XLSX.utils.aoa_to_sheet(ringkasanData);
      wsRingkasan["!cols"] = [{ wch: 20 }, { wch: 10 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, wsRingkasan, "Ringkasan Kekurangan");

      const tanggalFile = new Date().toISOString().slice(0, 10);
      const namaPO = (setting?.title || "PO")
        .replace(/[\\/?*[\]:]/g, "") // buang karakter terlarang nama file
        .trim();
      XLSX.writeFile(wb, `Kekurangan-${namaPO}-${tanggalFile}.xlsx`);
    } catch (err) {
      console.error(err);
      notify(
        "Gagal membuat file Excel. Pastikan package 'xlsx' sudah terinstall.",
      );
    } finally {
      setExportingShortage(false);
    }
  }

  /* ── Loading ── */
  if (loading)
    return (
      <div className="flex items-center gap-3 py-8 text-zinc-400 dark:text-zinc-500">
        <div className="w-5 h-5 border-2 border-zinc-300 dark:border-zinc-700 border-t-[#49bfb4] rounded-full animate-spin" />
        <span className="text-sm">Memuat rekap...</span>
      </div>
    );

  return (
    <div className="w-full space-y-5">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            <span className="font-mono tabular-nums">{rekapList.length}</span>{" "}
            produk dengan pesanan
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
            Total{" "}
            <span className="font-mono tabular-nums">{totalUnitProduksi}</span>{" "}
            pcs untuk diproduksi
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void reload()}
            disabled={refreshing}
            className="flex justify-center items-center gap-2 text-sm px-4 py-2.5 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors duration-150"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            onClick={
              subTab === "produksi"
                ? handleExportExcel
                : handleExportShortageExcel
            }
            disabled={
              subTab === "produksi"
                ? exporting || rekapList.length === 0
                : exportingShortage || shortageList.length === 0
            }
            className="flex justify-center items-center gap-2 text-sm px-4 py-2.5 bg-[#124540] hover:bg-[#0d332f] disabled:opacity-40 text-white rounded-md font-semibold transition-colors duration-150"
          >
            <Download
              size={14}
              className={
                (subTab === "produksi" ? exporting : exportingShortage)
                  ? "animate-bounce"
                  : ""
              }
            />
            {subTab === "produksi"
              ? exporting
                ? "Membuat..."
                : "Download Excel"
              : exportingShortage
                ? "Membuat..."
                : "Download Kekurangan"}
          </button>
        </div>
      </div>

      {/* ── Switcher Sub-Tab: Rekap Produksi vs Rekap Kekurangan ── */}
      <div className="flex bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-1.5 w-fit">
        <button
          onClick={() => setSubTab("produksi")}
          className={`text-xs font-semibold px-4 py-2 rounded-md transition-colors duration-150 ${
            subTab === "produksi"
              ? "bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
              : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
          }`}
        >
          Rekap Produksi
        </button>
        <button
          onClick={() => setSubTab("kekurangan")}
          className={`flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-md transition-colors duration-150 ${
            subTab === "kekurangan"
              ? "bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
              : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
          }`}
        >
          Rekap Kekurangan
          {totalShortageUnits > 0 && (
            <span className="font-mono tabular-nums bg-red-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none">
              {totalShortageUnits}
            </span>
          )}
        </button>
      </div>

      {subTab === "produksi" && (
        <>
          {/* ── Rekap Belanja Bahan (per Jenis Garmen) ── */}
          {belanjaSections.length > 0 && (
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <ShoppingBag
                  size={16}
                  className="text-zinc-400 dark:text-zinc-500"
                />
                <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                  Rekap Belanja Bahan
                </h2>
                <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">
                  — per warna & lengan, lintas semua produk
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {belanjaSections.map((section) => {
                  const Icon =
                    section.key === "kaos_kids"
                      ? Baby
                      : section.key === "sweater" || section.key === "hoodie"
                        ? Snowflake
                        : Shirt;
                  return (
                    <div
                      key={section.key}
                      className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden"
                    >
                      <div className="bg-zinc-50 dark:bg-zinc-900 px-4 sm:px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <Icon
                            size={16}
                            className="text-zinc-500 dark:text-zinc-400"
                          />
                          <h3 className="font-semibold text-sm text-zinc-800 dark:text-zinc-200">
                            {section.label}
                          </h3>
                        </div>
                        <span className="font-mono tabular-nums text-xs font-semibold text-zinc-900 dark:text-zinc-100 shrink-0">
                          {section.totalJumlah} pcs
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs sm:text-sm min-w-[420px]">
                          <thead>
                            <tr className="bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800">
                              <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                                WARNA / LENGAN
                              </th>
                              {section.columns.map((ukuran) => (
                                <th
                                  key={ukuran}
                                  className="text-center px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400 whitespace-nowrap"
                                >
                                  {ukuran}
                                </th>
                              ))}
                              <th className="text-center px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                                JML
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {section.rows.map((row) => (
                              <tr
                                key={row.label}
                                className="border-b border-zinc-200 dark:border-zinc-800 last:border-0"
                              >
                                <td className="px-4 py-2.5 font-semibold text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                                  {row.label}
                                </td>
                                {section.columns.map((ukuran) => (
                                  <td
                                    key={ukuran}
                                    className="font-mono tabular-nums text-center px-3 py-2.5 text-zinc-600 dark:text-zinc-400"
                                  >
                                    {row.perUkuran[ukuran] > 0
                                      ? row.perUkuran[ukuran]
                                      : ""}
                                  </td>
                                ))}
                                <td className="font-mono tabular-nums text-center px-4 py-2.5 font-semibold text-zinc-800 dark:text-zinc-200">
                                  {row.jumlah}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-zinc-50 dark:bg-zinc-900 border-t-2 border-zinc-300 dark:border-zinc-700">
                              <td className="px-4 py-3 font-semibold text-zinc-800 dark:text-zinc-100">
                                TOTAL
                              </td>
                              {section.columns.map((ukuran) => (
                                <td
                                  key={ukuran}
                                  className="font-mono tabular-nums text-center px-3 py-3 font-semibold text-zinc-800 dark:text-zinc-100"
                                >
                                  {section.totalPerUkuran[ukuran] || 0}
                                </td>
                              ))}
                              <td className="font-mono tabular-nums text-center px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                                {section.totalJumlah}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty State */}
          {rekapList.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3 text-zinc-400 dark:text-zinc-500 border border-zinc-200 dark:border-zinc-800 border-dashed rounded-xl">
              <ClipboardList size={32} strokeWidth={1.2} />
              <p className="text-sm font-semibold">Belum ada data rekap</p>
              <p className="text-xs">
                Rekap akan muncul setelah ada pesanan masuk
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {rekapList.map((rekap) => (
                <div
                  key={rekap.product_id}
                  className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden"
                >
                  {/* Header produk */}
                  <div className="bg-zinc-50 dark:bg-zinc-900 px-4 sm:px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-[10px] font-mono font-semibold text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-2 py-1 rounded-md shrink-0">
                        {rekap.product_code}
                      </span>
                      <h3 className="font-semibold text-sm sm:text-[15px] text-zinc-800 dark:text-zinc-200 truncate">
                        {rekap.product_name}
                      </h3>
                    </div>
                    <span className="font-mono tabular-nums text-xs font-semibold text-zinc-900 dark:text-zinc-100 shrink-0">
                      {rekap.totalJumlah} pcs
                    </span>
                  </div>

                  {/* Tabel rekap */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs sm:text-sm min-w-[480px]">
                      <thead>
                        <tr className="bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800">
                          <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                            JENIS
                          </th>
                          {rekap.ukuranList.map((ukuran) => (
                            <th
                              key={ukuran}
                              className="text-center px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400 whitespace-nowrap"
                            >
                              {ukuran}
                            </th>
                          ))}
                          <th className="text-center px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                            JUMLAH
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rekap.rows.map((row) => (
                          <tr
                            key={row.jenis}
                            className="border-b border-zinc-200 dark:border-zinc-800 last:border-0"
                          >
                            <td className="px-4 py-2.5 font-semibold text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5">
                                {row.jenis}
                                {row.isExtra && (
                                  <span title="Kombinasi ini tidak terdaftar di master produk saat ini">
                                    <AlertTriangle
                                      size={12}
                                      className="text-orange-500"
                                    />
                                  </span>
                                )}
                              </span>
                            </td>
                            {rekap.ukuranList.map((ukuran) => (
                              <td
                                key={ukuran}
                                className="font-mono tabular-nums text-center px-3 py-2.5 text-zinc-600 dark:text-zinc-400"
                              >
                                {row.perUkuran[ukuran] > 0
                                  ? row.perUkuran[ukuran]
                                  : ""}
                              </td>
                            ))}
                            <td className="font-mono tabular-nums text-center px-4 py-2.5 font-semibold text-zinc-800 dark:text-zinc-200">
                              {row.jumlah}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-zinc-50 dark:bg-zinc-900 border-t-2 border-zinc-300 dark:border-zinc-700">
                          <td className="px-4 py-3 font-semibold text-zinc-800 dark:text-zinc-100">
                            TOTAL
                          </td>
                          {rekap.ukuranList.map((ukuran) => (
                            <td
                              key={ukuran}
                              className="font-mono tabular-nums text-center px-3 py-3 font-semibold text-zinc-800 dark:text-zinc-100"
                            >
                              {rekap.totalPerUkuran[ukuran] || 0}
                            </td>
                          ))}
                          <td className="font-mono tabular-nums text-center px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                            {rekap.totalJumlah}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Sub-Tab: Rekap Kekurangan Stok ── */}
      {subTab === "kekurangan" &&
        (shortageList.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3 text-zinc-400 dark:text-zinc-500 border border-zinc-200 dark:border-zinc-800 border-dashed rounded-xl">
            <PackageCheck
              size={32}
              strokeWidth={1.2}
              className="text-emerald-400"
            />
            <p className="text-sm font-semibold">Tidak ada kekurangan stok</p>
            <p className="text-xs">
              Semua item sudah lengkap saat dikemas di tab Pengemasan
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <PackageX size={16} className="text-red-600" />
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                Rekap Kekurangan Stok
              </h2>
              <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">
                — total{" "}
                <span className="font-mono tabular-nums">
                  {totalShortageUnits}
                </span>{" "}
                pcs kurang, dikelompokkan per kode produk
              </span>
            </div>

            {shortageList.map((produk) => (
              <div
                key={produk.product_id}
                className="border border-red-200 dark:border-red-900/50 rounded-xl overflow-hidden"
              >
                <div className="bg-red-50 dark:bg-red-950/30 px-4 sm:px-5 py-3.5 border-b border-red-200 dark:border-red-900/50 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-[10px] font-mono font-semibold text-red-600 dark:text-red-400 bg-white dark:bg-zinc-950 border border-red-200 dark:border-red-900/50 px-2 py-1 rounded-md shrink-0">
                      {produk.product_code}
                    </span>
                    <h3 className="font-semibold text-sm sm:text-[15px] text-zinc-800 dark:text-zinc-200 truncate">
                      {produk.product_name}
                    </h3>
                  </div>
                  <span className="font-mono tabular-nums text-xs font-semibold text-red-600 dark:text-red-400 shrink-0">
                    {produk.totalKurang} pcs kurang
                  </span>
                </div>

                <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {produk.rows.map((row) => (
                    <div
                      key={`${row.jenis}::${row.ukuran}`}
                      className="px-4 sm:px-5 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                          {row.jenis} · Ukuran {row.ukuran}
                        </p>
                        <span className="text-xs font-semibold text-red-600 dark:text-red-400 shrink-0">
                          Kurang{" "}
                          <span className="font-mono tabular-nums">
                            {row.totalKurang}
                          </span>
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {row.details.map((d, i) => (
                          <span
                            key={i}
                            className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-2 py-1 rounded-md"
                          >
                            {d.po_number} · {d.customer_name} (
                            <span className="font-mono tabular-nums">
                              {d.qty}
                            </span>
                            )
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
