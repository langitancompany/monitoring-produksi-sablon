"use client";

import React from "react";
import { invoiceDateLong, type InvoiceModel } from "@/lib/finance/invoiceDoc";
import type { InvoiceSettings } from "@/lib/finance/invoiceSettings";

/**
 * Dokumen invoice untuk CUSTOMER, ukuran A5 LANDSCAPE (210 x 148 mm), yaitu
 * kertas A4 yang dipotong dua. Murni tampilan cetak / PDF, tanpa interaksi.
 * Dipaksa light-mode supaya hasil cetak dan html-to-image sama persis.
 *
 * Susunan (atas -> bawah):
 *   header memanjang  ->  judul INVOICE + status  ->  [customer + rincian | total]
 *   ->  [cara pembayaran / ucapan lunas | tanda tangan]  ->  catatan kaki
 * Bila item sangat banyak, tinggi dokumen bertambah (tidak dipotong).
 */

export const INVOICE_W_MM = 210;
export const INVOICE_H_MM = 148;

const rp = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");

const STAMP: Record<string, { text: string; color: string }> = {
  "Belum Bayar": { text: "BELUM BAYAR", color: "#dc2626" },
  DP: { text: "DP DITERIMA", color: "#ea580c" },
  Lunas: { text: "LUNAS", color: "#059669" },
  "Kelebihan Bayar": { text: "LUNAS", color: "#059669" },
};

const LABEL =
  "text-[7.5px] font-mono uppercase tracking-[0.14em] text-zinc-400 m-0";

export default function InvoiceDocument({
  model: m,
  settings,
  headerUrl,
  note,
}: {
  model: InvoiceModel;
  settings: InvoiceSettings;
  /** Gambar kop yang sudah ditentukan pemanggil (pengaturan, atau bawaan). Kosong = kop teks. */
  headerUrl?: string | null;
  note?: string;
}) {
  const stamp = STAMP[m.status] ?? STAMP["Belum Bayar"];
  const storeName = settings.store_name;
  const showPay = !m.isLunas && settings.accounts.length > 0;
  const showSign =
    settings.show_signature &&
    (!!settings.signature_image ||
      !!settings.signature_name ||
      !!settings.signature_title);

  return (
    <div
      className="relative bg-white text-zinc-800"
      style={{
        width: `${INVOICE_W_MM}mm`,
        minHeight: `${INVOICE_H_MM}mm`,
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "9.5px",
        lineHeight: 1.35,
        boxSizing: "border-box",
        padding: "6mm 9mm 5mm",
        colorScheme: "light",
      }}
    >
      {/* Header memanjang (ramping) */}
      {headerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={headerUrl}
          alt={storeName}
          crossOrigin="anonymous"
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            maxHeight: "24mm",
            objectFit: "contain",
            objectPosition: "left center",
          }}
        />
      ) : (
        <div className="pb-1.5">
          <p className="text-[15px] font-semibold m-0">{storeName}</p>
          {settings.store_address && (
            <p className="text-[8px] text-zinc-500 m-0">
              {settings.store_address}
            </p>
          )}
        </div>
      )}

      {/* Judul + status */}
      <div className="flex items-center justify-between gap-3 mt-1.5 py-1.5 border-y-2 border-zinc-900">
        <div className="flex items-baseline gap-3">
          <p className="text-[14px] font-bold tracking-[0.12em] m-0">INVOICE</p>
          <p className="text-[10px] font-semibold font-mono tabular-nums m-0">
            {m.number}
          </p>
          {m.revisionNote && (
            <p className="text-[7.5px] text-zinc-400 m-0">{m.revisionNote}</p>
          )}
        </div>
        <span
          className="inline-block px-2 py-0.5 rounded-md border-2 text-[9px] font-mono font-bold uppercase tracking-[0.1em]"
          style={{ borderColor: stamp.color, color: stamp.color }}
        >
          {stamp.text}
        </span>
      </div>

      <div className="flex gap-4 mt-2.5">
        {/* ── KIRI ── */}
        <div style={{ width: "62%" }}>
          <div className="flex justify-between gap-3 mb-2.5">
            <div style={{ minWidth: 0 }}>
              <p className={`${LABEL} mb-0.5`}>DITAGIHKAN KEPADA</p>
              <p className="font-semibold text-[11px] m-0">{m.customerName}</p>
              {m.customerPhone && (
                <p className="text-zinc-500 m-0">{m.customerPhone}</p>
              )}
              {m.customerAddress && (
                <p className="text-zinc-500 m-0 text-[8.5px]">
                  {m.customerAddress}
                </p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className={`${LABEL} mb-0.5`}>TERBIT</p>
              <p className="font-semibold font-mono tabular-nums m-0">
                {invoiceDateLong(m.issuedAt)}
              </p>
              {!m.isLunas && (
                <>
                  <p className={`${LABEL} mt-1 mb-0.5`}>JATUH TEMPO</p>
                  <p className="font-semibold font-mono tabular-nums m-0">
                    {invoiceDateLong(m.dueDate)}
                  </p>
                </>
              )}
            </div>
          </div>

          <table className="w-full border-collapse text-[9px]">
            <thead>
              <tr className="bg-zinc-100">
                <th className="text-left py-1 px-1.5 font-semibold text-zinc-500">
                  Deskripsi · {m.orderCode}
                </th>
                <th className="text-center py-1 px-1 font-semibold text-zinc-500 w-8">
                  Qty
                </th>
                <th className="text-right py-1 px-1.5 font-semibold text-zinc-500 w-24">
                  Subtotal
                </th>
              </tr>
            </thead>
            <tbody>
              {m.lines.map((l, i) => (
                <tr key={i} className="border-b border-zinc-200">
                  <td className="py-1.5 px-1.5">
                    <span className="font-semibold">{l.label}</span>
                    {l.detail && (
                      <span className="block text-[8px] text-zinc-500">
                        {l.detail}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 px-1 text-center font-mono tabular-nums align-top">
                    {l.qty}
                  </td>
                  <td className="py-1.5 px-1.5 text-right font-mono tabular-nums align-top">
                    {rp(l.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {note?.trim() && (
            <p
              className="text-[8.5px] text-zinc-600 mt-2 mb-0"
              style={{ whiteSpace: "pre-line" }}
            >
              <b>Catatan:</b> {note.trim()}
            </p>
          )}
        </div>

        {/* ── KANAN: total + pembayaran diterima ── */}
        <div style={{ width: "38%" }}>
          <div className="text-[9.5px]">
            <div className="flex justify-between py-0.5 text-zinc-500">
              <span>Subtotal ({m.totalPcs} pcs)</span>
              <span className="font-mono tabular-nums">{rp(m.subtotal)}</span>
            </div>
            {m.discount > 0 && (
              <div className="flex justify-between py-0.5 text-zinc-500">
                <span>Diskon</span>
                <span className="font-mono tabular-nums">
                  − {rp(m.discount)}
                </span>
              </div>
            )}
            <div className="flex justify-between py-1 mt-0.5 border-t border-zinc-300 text-[11px] font-semibold text-zinc-900">
              <span>Total</span>
              <span className="font-mono tabular-nums">{rp(m.total)}</span>
            </div>
            <div className="flex justify-between py-0.5 text-emerald-700">
              <span>Sudah dibayar</span>
              <span className="font-mono tabular-nums">− {rp(m.paid)}</span>
            </div>
            <div
              className="flex justify-between py-1.5 px-2 mt-1 rounded-md text-[11px] font-bold"
              style={{
                backgroundColor: m.balance > 0 ? "#fef2f2" : "#ecfdf5",
                color: m.balance > 0 ? "#b91c1c" : "#047857",
              }}
            >
              <span>{m.overpaid > 0 ? "Lebih bayar" : "Sisa tagihan"}</span>
              <span className="font-mono tabular-nums">
                {rp(m.overpaid > 0 ? m.overpaid : m.balance)}
              </span>
            </div>
          </div>

          {m.payments.length > 0 && (
            <div className="mt-2.5">
              <p className={`${LABEL} mb-0.5`}>PEMBAYARAN DITERIMA</p>
              <table className="w-full border-collapse text-[8.5px]">
                <tbody>
                  {m.payments.map((p, i) => (
                    <tr key={i} className="border-b border-zinc-100">
                      <td className="py-0.5 pr-1.5 font-mono tabular-nums text-zinc-500 whitespace-nowrap align-top">
                        {invoiceDateLong(p.date)}
                      </td>
                      <td
                        className="py-0.5 text-right font-mono tabular-nums whitespace-nowrap align-top"
                        style={{ color: p.isRefund ? "#dc2626" : undefined }}
                      >
                        {p.isRefund ? "− " : ""}
                        {rp(p.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── BAWAH: cara pembayaran / ucapan lunas + tanda tangan ── */}
      {(showPay || m.isLunas || showSign) && (
        <div className="flex gap-4 mt-3 items-stretch">
          <div style={{ flex: 1, minWidth: 0 }}>
            {showPay && (
              <div className="rounded-md border border-zinc-200 px-2.5 py-2">
                <p className={`${LABEL} mb-1`}>CARA PEMBAYARAN</p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      settings.accounts.length > 1 ? "1fr 1fr" : "1fr",
                    gap: "4px 14px",
                  }}
                >
                  {settings.accounts.map((a, i) => (
                    <div key={i} style={{ minWidth: 0 }}>
                      <p className="m-0 text-[8.5px] text-zinc-500">
                        <b className="text-zinc-700">{a.bank}</b>
                        {a.holder ? ` · a.n. ${a.holder}` : ""}
                      </p>
                      <p className="m-0 text-[12px] font-bold font-mono tabular-nums tracking-wide text-zinc-900">
                        {a.number}
                      </p>
                    </div>
                  ))}
                </div>
                {settings.payment_note && (
                  <p className="mt-1 mb-0 text-[8px] text-zinc-500">
                    {settings.payment_note}
                  </p>
                )}
              </div>
            )}
            {m.isLunas && (
              <div
                className="rounded-md px-2.5 py-2 text-[9px]"
                style={{ backgroundColor: "#ecfdf5", color: "#047857" }}
              >
                Pembayaran diterima <b>lunas</b>
                {m.lastPaidAt ? ` pada ${invoiceDateLong(m.lastPaidAt)}` : ""}.
                Terima kasih atas kepercayaan Anda.
              </div>
            )}
          </div>

          {showSign && (
            <div className="text-center shrink-0" style={{ width: "50mm" }}>
              <p className="m-0 text-[8px] text-zinc-500">Hormat kami,</p>
              <div
                style={{
                  height: "17mm",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {settings.signature_image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={settings.signature_image}
                    alt="Tanda tangan"
                    style={{
                      maxHeight: "17mm",
                      maxWidth: "46mm",
                      objectFit: "contain",
                    }}
                  />
                )}
              </div>
              <div className="border-t border-zinc-400 pt-0.5">
                {settings.signature_name && (
                  <p className="m-0 text-[9px] font-semibold">
                    {settings.signature_name}
                  </p>
                )}
                {settings.signature_title && (
                  <p className="m-0 text-[8px] text-zinc-500">
                    {settings.signature_title}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-[7px] text-zinc-400 mt-2 mb-0">
        Dokumen ini dibuat otomatis oleh sistem {storeName}
        {showSign ? "." : " dan sah tanpa tanda tangan."}
      </p>

      {m.isLunas && (
        <div
          aria-hidden
          className="absolute font-mono font-bold uppercase"
          style={{
            top: "66mm",
            left: "50mm",
            transform: "rotate(-14deg)",
            border: `4px solid ${stamp.color}`,
            color: stamp.color,
            padding: "2px 16px",
            borderRadius: "8px",
            fontSize: "34px",
            letterSpacing: "0.14em",
            opacity: 0.22,
            pointerEvents: "none",
          }}
        >
          LUNAS
        </div>
      )}
    </div>
  );
}
