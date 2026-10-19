"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Download, MessageCircle, Printer, Share2 } from "lucide-react";
import { useDialog } from "@/app/components/ui/DialogProvider";
import { finFetch, errMsg } from "@/hooks/useFinanceApi";
import { useInvoiceSettings } from "@/hooks/useInvoiceSettings";
import type { OrderFinanceDetail } from "@/lib/finance/types";
import {
  buildInvoiceModel,
  buildWaText,
  normalizeWaNumber,
} from "@/lib/finance/invoiceDoc";
import { formatAccountsText } from "@/lib/finance/invoiceSettings";
import { printHtmlPages } from "@/lib/po/print-frame";
import InvoiceDocument, { INVOICE_H_MM, INVOICE_W_MM } from "./InvoiceDocument";
import ScaledDoc from "./ScaledDoc";
import { ModalShell, Field, inputCls, GhostButton } from "./ui";
import { StatusBadge } from "./StatusBadge";

/**
 * Invoice untuk customer: pratinjau, unduh PDF, bagikan (lampiran file di HP),
 * kirim lewat WhatsApp, atau cetak. Data selalu dimuat ulang dari server saat
 * dibuka, jadi setelah order lunas, invoice otomatis berstatus LUNAS.
 * Header, rekening, dan TTD diambil dari Keuangan > Pengaturan.
 */
export default function InvoiceShareModal({
  orderId,
  onClose,
}: {
  orderId: string;
  onClose: () => void;
}) {
  const { notify } = useDialog();
  const { settings } = useInvoiceSettings();
  const [detail, setDetail] = useState<OrderFinanceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<null | "pdf" | "share" | "print">(null);
  const captureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    finFetch<OrderFinanceDetail>(`/api/finance/orders/${orderId}`)
      .then((d) => alive && setDetail(d))
      .catch((e) => alive && setError(errMsg(e)));
    return () => {
      alive = false;
    };
  }, [orderId]);

  const model = useMemo(
    () => (detail ? buildInvoiceModel(detail) : null),
    [detail],
  );

  // Kop: gambar dari pengaturan; jika belum diunggah, pakai kop bawaan aplikasi.
  const headerUrl = settings
    ? (settings.header_image ??
      (typeof window !== "undefined"
        ? `${window.location.origin}/header-nota.png`
        : null))
    : null;

  const docProps =
    model && settings ? { model, settings, headerUrl, note } : null;

  const fileName = model
    ? `Invoice ${model.number} ${model.customerName}${model.isLunas ? " (LUNAS)" : ""}.pdf`.replace(
        /[\\/:*?"<>|]/g,
        "-",
      )
    : "invoice.pdf";

  /** Render dokumen A5 landscape (yang tersembunyi) -> file PDF satu halaman. */
  const makePdf = useCallback(async (): Promise<Blob> => {
    const node = captureRef.current;
    if (!node) throw new Error("Dokumen belum siap");
    const [{ toJpeg }, { default: jsPDF }] = await Promise.all([
      import("html-to-image"),
      import("jspdf"),
    ]);
    await new Promise((r) => setTimeout(r, 150));
    const dataUrl = await toJpeg(node, {
      pixelRatio: 2.5,
      quality: 0.95,
      cacheBust: true,
      backgroundColor: "#ffffff",
    });
    const heightMm = Math.max(
      INVOICE_H_MM,
      (node.offsetHeight / node.offsetWidth) * INVOICE_W_MM,
    );
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: [INVOICE_W_MM, heightMm],
    });
    pdf.addImage(dataUrl, "JPEG", 0, 0, INVOICE_W_MM, heightMm);
    return pdf.output("blob");
  }, []);

  const saveBlob = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const waText = () =>
    model && settings
      ? buildWaText(
          model,
          settings.store_name,
          formatAccountsText(settings.accounts),
        )
      : "";

  const onDownload = async () => {
    setBusy("pdf");
    try {
      saveBlob(await makePdf());
    } catch (e) {
      notify(errMsg(e), { title: "Gagal membuat PDF" });
    } finally {
      setBusy(null);
    }
  };

  const canNativeShare =
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    typeof File !== "undefined" &&
    navigator.canShare({
      files: [new File([""], "x.pdf", { type: "application/pdf" })],
    });

  const onShare = async () => {
    if (!model) return;
    setBusy("share");
    try {
      const blob = await makePdf();
      const file = new File([blob], fileName, { type: "application/pdf" });
      await navigator.share({
        files: [file],
        title: model.number,
        text: waText(),
      });
    } catch (e) {
      // Pengguna menutup sheet bagikan = bukan error.
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        notify(errMsg(e), { title: "Gagal membagikan" });
      }
    } finally {
      setBusy(null);
    }
  };

  const waNumber = normalizeWaNumber(model?.customerPhone);

  const onWhatsApp = () => {
    if (!model) return;
    const url = `https://wa.me/${waNumber ?? ""}?text=${encodeURIComponent(waText())}`;
    window.open(url, "_blank", "noopener,noreferrer");
    notify(
      'WhatsApp dibuka dengan pesan siap kirim. Lampirkan file PDF invoice (klik "Unduh PDF" lebih dulu) sebelum mengirim.',
      { title: "Jangan lupa lampiran" },
    );
  };

  const onPrint = () => {
    if (!docProps) return;
    setBusy("print");
    const pagesHtml = renderToStaticMarkup(
      <div className="inv-print-page">
        <InvoiceDocument {...docProps} />
      </div>,
    );
    printHtmlPages({
      title: `Invoice ${docProps.model.number}`,
      pagesHtml,
      pageCss: `
        .inv-print-page { page-break-inside: avoid; break-inside: avoid; }
        @page { size: 210mm 148mm; margin: 0; }
      `,
      onDone: () => setBusy(null),
      onError: (msg) => notify(msg),
    });
  };

  const noAccounts =
    !!model && !model.isLunas && !!settings && settings.accounts.length === 0;

  return (
    <ModalShell
      title="Invoice customer"
      subtitle={model ? `${model.number} · ${model.customerName}` : undefined}
      onClose={onClose}
      wide
    >
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      {(!detail || !settings) && !error && (
        <p className="text-xs text-zinc-400">Memuat invoice…</p>
      )}
      {detail && !model && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Order ini belum punya tagihan aktif. Terbitkan tagihan terlebih dulu
          untuk membuat invoice.
        </p>
      )}

      {model && docProps && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <StatusBadge status={model.status} />
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono tabular-nums">
              {model.isLunas
                ? "Lunas · invoice berstatus LUNAS"
                : `Sisa Rp ${model.balance.toLocaleString("id-ID")}`}
            </p>
          </div>

          <ScaledDoc>
            <InvoiceDocument {...docProps} />
          </ScaledDoc>

          {noAccounts && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-md px-3 py-2">
              Rekening pembayaran belum diatur, jadi invoice ini belum memuat
              cara pembayaran. Super Admin dapat mengisinya di{" "}
              <b>Keuangan → Pengaturan</b>.
            </p>
          )}

          <Field label="Catatan di invoice (opsional)">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              className={inputCls}
              placeholder="Mis. Pesanan diproses setelah DP diterima"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onDownload}
              disabled={busy !== null}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-[#124540] hover:bg-[#0d332f] text-white rounded-md text-sm font-semibold transition-colors duration-150 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {busy === "pdf" ? "Membuat…" : "Unduh PDF"}
            </button>
            {canNativeShare ? (
              <GhostButton onClick={onShare} disabled={busy !== null}>
                <span className="flex items-center justify-center gap-2">
                  <Share2 className="w-4 h-4" />
                  {busy === "share" ? "Menyiapkan…" : "Bagikan file"}
                </span>
              </GhostButton>
            ) : (
              <GhostButton onClick={onPrint} disabled={busy !== null}>
                <span className="flex items-center justify-center gap-2">
                  <Printer className="w-4 h-4" /> Cetak
                </span>
              </GhostButton>
            )}
            <GhostButton onClick={onWhatsApp} disabled={busy !== null}>
              <span className="flex items-center justify-center gap-2">
                <MessageCircle className="w-4 h-4" /> Kirim via WhatsApp
              </span>
            </GhostButton>
            {canNativeShare && (
              <GhostButton onClick={onPrint} disabled={busy !== null}>
                <span className="flex items-center justify-center gap-2">
                  <Printer className="w-4 h-4" /> Cetak
                </span>
              </GhostButton>
            )}
          </div>
          <p className="text-[10px] text-zinc-400">
            Ukuran invoice A5 landscape (210×148 mm). Saat mencetak, pilih
            ukuran kertas <b>A5</b> dan skala 100% (jangan &quot;fit to
            page&quot;).
          </p>
          {!waNumber && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400">
              Nomor HP customer kosong atau tidak valid, jadi WhatsApp akan
              dibuka tanpa penerima. Pilih kontaknya secara manual.
            </p>
          )}
        </div>
      )}

      {/* Dokumen asli untuk di-capture jadi PDF (di luar layar, tanpa skala) */}
      {docProps && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: -10000,
            top: 0,
            pointerEvents: "none",
          }}
        >
          <div ref={captureRef} style={{ width: `${INVOICE_W_MM}mm` }}>
            <InvoiceDocument {...docProps} />
          </div>
        </div>
      )}
    </ModalShell>
  );
}
