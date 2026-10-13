// hooks/usePOTabIdentity.ts
//
// Judul + ikon tab browser untuk halaman reseller, mengikuti katalog PO:
//   Katalog  → "(Nama PO) | Langitan.co"
//   Reseller → "(Nama PO) - Reseller | Langitan.co"
// Ikon tab diambil dari "Ikon PO" di Pengaturan PO (sama dengan katalog).
//
// Dipakai di client component karena halaman reseller membaca slug dari
// query (?slug=...), bukan dari path seperti katalog (/po/[slug]).

import { useEffect } from "react";
import type { POSetting } from "@/types/po";

const BRAND = "Langitan.co";
const ICON_RELS = ["icon", "shortcut icon", "apple-touch-icon"] as const;

export function usePOTabIdentity(
  setting: Pick<POSetting, "title" | "icon_image_url"> | null | undefined,
  label = "Reseller",
) {
  const title = setting?.title?.trim() || "";
  const iconUrl = setting?.icon_image_url?.trim() || "";
  const loaded = !!setting;

  // ── Judul tab ──
  useEffect(() => {
    // Sebelum data PO tiba (atau tanpa slug) pakai judul umum, bukan "Sabmoon"
    document.title = loaded
      ? `${title || "Katalog PO"} - ${label} | ${BRAND}`
      : `Portal ${label} | ${BRAND}`;
  }, [loaded, title, label]);

  // ── Ikon tab ──
  useEffect(() => {
    if (!iconUrl) return;

    type Saved = {
      el: HTMLLinkElement;
      created: boolean;
      href: string | null;
      type: string | null;
      sizes: string | null;
    };
    const saved: Saved[] = [];

    ICON_RELS.forEach((rel) => {
      const found = Array.from(
        document.head.querySelectorAll<HTMLLinkElement>("link[rel]"),
      ).filter((l) => l.getAttribute("rel") === rel);
      const targets = found.length
        ? found
        : [Object.assign(document.createElement("link"), { rel })];

      targets.forEach((el) => {
        const created = !el.isConnected;
        saved.push({
          el,
          created,
          href: el.getAttribute("href"),
          type: el.getAttribute("type"),
          sizes: el.getAttribute("sizes"),
        });
        // type/sizes bawaan favicon.ico bisa membuat browser menolak gambar PNG/JPG
        el.removeAttribute("type");
        el.removeAttribute("sizes");
        el.setAttribute("href", iconUrl);
        if (created) document.head.appendChild(el);
      });
    });

    return () => {
      saved.forEach(({ el, created, href, type, sizes }) => {
        if (created) {
          el.remove();
          return;
        }
        if (href !== null) el.setAttribute("href", href);
        if (type !== null) el.setAttribute("type", type);
        if (sizes !== null) el.setAttribute("sizes", sizes);
      });
    };
  }, [iconUrl]);
}