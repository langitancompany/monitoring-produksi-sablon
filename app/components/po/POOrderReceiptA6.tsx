"use client";

import { DEFAULT_STORE_NAME } from "@/lib/po/store-info";
import { POOrder } from "@/types/po";

/**
 * Resi cetak A6 (thermal/label), dirender sebagai gambar/print oleh
 * pemanggilnya. Styling mengikuti resep "Dokumen / tiket hasil render
 * (html-to-image)" dari THEME-GUIDE "LCO Flat" — dipaksa light-mode
 * penuh, palet zinc, angka/kode pakai font-mono tabular-nums, status
 * pakai stempel border.
 */

interface POOrderReceiptA6Props {
  order: POOrder;
  storeName?: string;
  storeAddress?: string;
  adminPhone?: string;
  logoUrl?: string;
}

const PAYMENT_LABEL: Record<string, string> = {
  BELUM_BAYAR: "Belum Bayar",
  DP: "DP",
  LUNAS: "Lunas",
};

export default function POOrderReceiptA6({
  order,
  storeName = DEFAULT_STORE_NAME,
  storeAddress,
  adminPhone,
  logoUrl,
}: POOrderReceiptA6Props) {
  const printedAt = new Date().toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const isDikirim = order.delivery_method === "Dikirim";

  // Urutkan item: kode/nama produk -> lengan -> warna -> ukuran.
  const sortedItems = [...order.order_items].sort((a, b) => {
    const kodeA = a.product_name || "";
    const kodeB = b.product_name || "";
    if (kodeA !== kodeB)
      return kodeA.localeCompare(kodeB, undefined, { numeric: true });

    const lenganA = a.lengan || "";
    const lenganB = b.lengan || "";
    if (lenganA !== lenganB) return lenganA.localeCompare(lenganB);

    const warnaA = a.warna || "";
    const warnaB = b.warna || "";
    if (warnaA !== warnaB) return warnaA.localeCompare(warnaB);

    return (a.ukuran || "").localeCompare(b.ukuran || "", undefined, {
      numeric: true,
    });
  });

  return (
    <div
      className="w-full bg-white text-zinc-800 leading-snug"
      style={{ fontFamily: "Arial, Helvetica, sans-serif", fontSize: "10px" }}
    >
      {/* ── HEADER RESI ── */}
      <div
        className={`text-center mb-3 ${
          logoUrl ? "" : "border-b-2 border-zinc-900 pb-2.5"
        }`}
      >
        {logoUrl ? (
          // Gambar kop/header custom, selebar area cetak — dianggap
          // sudah lengkap dengan nama, alamat, kontak, dsb di dalam
          // desainnya sendiri, jadi semua teks & garis pembatas bawaan
          // sengaja disembunyikan supaya tidak dobel.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={storeName}
            className="w-full h-auto block mx-auto"
          />
        ) : (
          // Fallback teks: dipakai hanya kalau logo belum diupload,
          // supaya header resi tidak kosong.
          <>
            <h2 className="text-base font-semibold uppercase tracking-[0.06em] m-0 mb-1">
              {storeName}
            </h2>
            {storeAddress && (
              <p className="m-0 mb-1 text-[9px]">{storeAddress}</p>
            )}
            {adminPhone && (
              <p className="m-0 text-[9px] font-semibold">
                Layanan Pelanggan (WA): {adminPhone}
              </p>
            )}
          </>
        )}
      </div>

      {/* ── INFO TRANSAKSI ── */}
      <table className="w-full mb-2.5 text-[10px]">
        <tbody>
          <tr>
            <td className="align-top w-1/2">
              <p className="m-0 mb-0.5 font-mono tabular-nums">
                <span className="font-semibold not-italic font-sans">
                  No. PO:
                </span>{" "}
                {order.po_number}
              </p>
              <p className="m-0 font-mono tabular-nums">
                <span className="font-semibold font-sans">Tgl:</span>{" "}
                {new Date(order.created_at).toLocaleDateString("id-ID")}
              </p>
            </td>
            <td className="align-top text-right w-1/2">
              <p className="m-0 mb-1">
                <span className="font-semibold">Status Bayar: </span>
                <span className="px-1.5 py-0.5 border border-zinc-900 rounded-md font-semibold uppercase text-[9px]">
                  {PAYMENT_LABEL[order.payment_status] ?? order.payment_status}
                </span>
              </p>
              <p className="m-0">
                <span className="font-semibold">Metode:</span>{" "}
                {order.delivery_method}
              </p>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── DETAIL PENGIRIMAN ── */}
      <div className="border-2 border-zinc-900 rounded-md p-2 mb-3">
        <table className="w-full text-[9px]">
          <tbody>
            <tr>
              <td
                className={`w-1/2 align-top pr-2.5 ${
                  isDikirim ? "border-r border-dashed border-zinc-300" : ""
                }`}
              >
                <p className="m-0 mb-1 text-[8px] text-zinc-500 font-semibold uppercase tracking-wide">
                  Pengirim
                </p>
                <p className="m-0 mb-0.5 font-semibold text-[10px]">
                  {storeName}
                </p>
                {storeAddress && <p className="m-0 mb-0.5">{storeAddress}</p>}
                {adminPhone && <p className="m-0">{adminPhone}</p>}
              </td>

              {isDikirim ? (
                <td className="w-1/2 align-top pl-2.5">
                  <p className="m-0 mb-1 text-[8px] text-zinc-500 font-semibold uppercase tracking-wide">
                    Penerima
                  </p>
                  <p className="m-0 mb-0.5 font-semibold text-[10px]">
                    {order.customer_name}
                  </p>
                  <p className="m-0 mb-0.5">{order.customer_wa}</p>
                  <p className="m-0 whitespace-pre-wrap">
                    {order.shipping_address}
                  </p>
                </td>
              ) : (
                <td className="w-1/2 align-top pl-2.5">
                  <p className="m-0 mb-1 text-[8px] text-zinc-500 font-semibold uppercase tracking-wide">
                    Pemesan (Ambil di Toko)
                  </p>
                  <p className="m-0 mb-0.5 font-semibold text-[10px]">
                    {order.customer_name}
                  </p>
                  <p className="m-0">{order.customer_wa}</p>
                </td>
              )}
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── TABEL PESANAN ── */}
      <table className="w-full border-collapse mb-2.5 text-[9px]">
        <thead>
          <tr className="border-t-2 border-b-2 border-zinc-900">
            <th className="text-left py-1.5 w-4/5 font-semibold">Item</th>
            <th className="text-center py-1.5 w-1/5 font-semibold">Qty</th>
          </tr>
        </thead>
        <tbody>
          {sortedItems.map((item, i) => (
            <tr key={i} className="border-b border-dotted border-zinc-400">
              <td className="py-1.5">
                <span className="font-semibold">{item.product_name}</span>
                <span className="text-[8px] text-zinc-500">
                  {" "}
                  — {item.ukuran} | {item.lengan} | {item.warna}
                </span>
              </td>
              <td className="text-center py-1.5 align-top font-semibold font-mono tabular-nums">
                {item.qty}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── CATATAN PEMBELI ── */}
      {order.notes && (
        <div className="border border-dashed border-zinc-900 p-1.5 mb-3 text-[9px] bg-zinc-50">
          <strong className="block mb-0.5">Catatan Pembeli:</strong>
          {order.notes}
        </div>
      )}

      {/* ── FOOTER RESI ── */}
      <div className="text-center text-[9px] mt-4 border-t border-dashed border-zinc-900 pt-2.5">
        <p className="m-0 mb-1 font-semibold text-[10px]">Terima Kasih!</p>
        <p className="m-0 mb-1">
          Harap melakukan video unboxing disaat membuka paket.
        </p>
        <p className="m-0 text-zinc-500 text-[8px]">Dicetak: {printedAt}</p>
      </div>
    </div>
  );
}
