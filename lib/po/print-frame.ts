/**
 * Helper cetak via iframe tersembunyi untuk invoice (A4) dan resi (A6).
 *
 * Komponen cetak (POOrderPrintSlip, POOrderReceiptA6) di-style dengan
 * Tailwind. Iframe adalah dokumen terpisah, jadi class Tailwind TIDAK
 * berlaku kecuali stylesheet halaman utama disalin ke dalamnya. Tanpa itu
 * hasil cetak tampil polos (tanpa tabel, warna, border, dll).
 *
 * Helper ini menyalin <link rel="stylesheet"> dan <style> dari halaman
 * utama, menunggu semuanya (CSS, font, gambar/logo) selesai dimuat, baru
 * memanggil print().
 */

interface PrintHtmlPagesOptions {
  title: string;
  /** HTML halaman-halaman yang akan dicetak (tiap halaman .po-print-page). */
  pagesHtml: string;
  /** CSS tambahan khusus ukuran kertas (.po-print-page & @page). */
  pageCss: string;
  /** Dipanggil saat proses selesai / dibatalkan / gagal. */
  onDone: () => void;
  onError?: (message: string) => void;
}

function collectParentStyles(): string {
  const parts: string[] = [];
  document
    .querySelectorAll<HTMLElement>('link[rel="stylesheet"], style')
    .forEach((el) => {
      if (el instanceof HTMLLinkElement) {
        // href sudah absolut (properti .href), aman dipakai di iframe.
        parts.push(`<link rel="stylesheet" href="${el.href}" />`);
      } else {
        parts.push(`<style>${el.textContent ?? ""}</style>`);
      }
    });
  return parts.join("\n");
}

export function printHtmlPages({
  title,
  pagesHtml,
  pageCss,
  onDone,
  onError,
}: PrintHtmlPagesOptions) {
  const printDocument = `<!DOCTYPE html>
<html lang="id" style="color-scheme: light;">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    ${collectParentStyles()}
    <style>
      html, body { background: #fff !important; color: #27272a; margin: 0; padding: 0; }
      body { font-family: Arial, Helvetica, sans-serif; }
      * {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      ${pageCss}
    </style>
  </head>
  <body>${pagesHtml}</body>
</html>`;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  let finished = false;
  const cleanup = () => {
    if (finished) return;
    finished = true;
    onDone();
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 500);
  };

  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    onDone();
    onError?.("Gagal menyiapkan dokumen cetak. Coba lagi.");
    return;
  }

  doc.open();
  doc.write(printDocument);
  doc.close();

  const waitForAssets = async () => {
    // 1) Semua stylesheet harus selesai dimuat.
    const links = Array.from(
      doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
    );
    await Promise.all(
      links.map(
        (l) =>
          new Promise<void>((resolve) => {
            if (l.sheet) return resolve();
            l.addEventListener("load", () => resolve());
            l.addEventListener("error", () => resolve());
          }),
      ),
    );
    // 2) Semua gambar (kop/logo) harus selesai dimuat.
    const imgs = Array.from(doc.images);
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) return resolve();
            img.addEventListener("load", () => resolve());
            img.addEventListener("error", () => resolve());
          }),
      ),
    );
    // 3) Font.
    try {
      await doc.fonts?.ready;
    } catch {
      /* abaikan */
    }
  };

  let hasPrinted = false;
  const triggerPrint = () => {
    if (hasPrinted) return;
    hasPrinted = true;
    win.focus();
    win.print();
  };

  // Batas tunggu maksimum supaya tidak menggantung kalau ada aset macet.
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 6000));
  Promise.race([waitForAssets(), timeout]).then(() => {
    // Satu frame tambahan agar layout selesai dihitung sebelum print.
    win.requestAnimationFrame(() => setTimeout(triggerPrint, 100));
  });

  win.onafterprint = cleanup;
  // Fallback: kalau dialog print tidak memicu 'afterprint'.
  setTimeout(cleanup, 120000);
}