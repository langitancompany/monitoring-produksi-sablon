"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import { INVOICE_W_MM } from "./InvoiceDocument";

const DOC_W_PX = (INVOICE_W_MM / 25.4) * 96; // 210 mm @ 96 dpi

/** Menampilkan dokumen berukuran fisik (210 mm) mengecil mengikuti lebar kontainer. Hanya untuk pratinjau layar. */
export default function ScaledDoc({ children }: { children: React.ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [docH, setDocH] = useState(DOC_W_PX * 0.705);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const doc = docRef.current;
    if (!box) return;
    const update = () => {
      setScale(Math.min(1, box.clientWidth / DOC_W_PX));
      if (doc) setDocH(doc.offsetHeight);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(box);
    if (doc) ro.observe(doc);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={boxRef}
      className="w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 overflow-hidden"
      style={{ height: docH * scale }}
    >
      <div
        ref={docRef}
        style={{
          width: DOC_W_PX,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}
