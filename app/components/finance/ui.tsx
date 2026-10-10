"use client";

import React, { useEffect } from "react";
import { X, Search } from "lucide-react";

// Primitif UI modul Keuangan. Gaya mengikuti aplikasi:
// palet zinc, kartu datar (tanpa shadow), tombol utama hijau #124540, sudut rounded-md.

export function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[99] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`bg-white dark:bg-zinc-950 w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-md"} rounded-t-xl sm:rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden max-h-[92vh] flex flex-col`}
      >
        <div className="flex items-start justify-between px-4 md:px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="min-w-0">
            <p className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 truncate">
              {title}
            </p>
            {subtitle && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono tabular-nums truncate mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors duration-150"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-4 md:p-5">{children}</div>
      </div>
    </div>
  );
}

export const inputCls =
  "w-full border border-zinc-200 dark:border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600 transition-colors duration-150 placeholder-zinc-400 dark:placeholder-zinc-500 disabled:opacity-60 dark:[color-scheme:dark]";

export const labelCls =
  "block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] mb-1";

export function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={labelCls}>
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      {hint && (
        <span className="block text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">
          {hint}
        </span>
      )}
    </label>
  );
}

export function PrimaryButton({
  children,
  loading,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`flex items-center justify-center gap-2 px-4 py-2 bg-[#124540] hover:bg-[#0d332f] text-white rounded-md text-sm font-semibold transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${rest.className ?? ""}`}
    >
      {loading && (
        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`px-4 py-2 border border-zinc-200 dark:border-zinc-800 rounded-md text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150 disabled:opacity-50 ${rest.className ?? ""}`}
    >
      {children}
    </button>
  );
}

/** Tombol kecil di dalam kartu/baris (Rincian, Lihat bukti, dst.). */
export const smallBtnCls =
  "flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-md transition-colors duration-150 disabled:opacity-50";
export const smallGhostBtnCls = `${smallBtnCls} border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900`;
export const smallPrimaryBtnCls = `${smallBtnCls} bg-[#124540] hover:bg-[#0d332f] text-white`;

/** Kartu datar standar aplikasi. */
export const cardCls =
  "bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800";

/** Judul kecil huruf kapital di header kartu. */
export const sectionLabelCls =
  "text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em]";

/** Input kontrol di toolbar filter: tinggi seragam (h-10) agar sejajar dengan tombol. */
export const filterInputCls = `${inputCls} h-10 sm:min-w-[10rem]`;

/** Kartu toolbar yang membungkus filter di tiap tab. */
export const toolbarCls = `${"bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800"} p-4 md:p-5`;

/** Satu kolom filter: label kecil di atas, input di bawah dengan jarak yang lega. */
export function FilterField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 min-w-0 ${className}`}>
      <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em]">
        {label}
      </span>
      {children}
    </label>
  );
}

/** Kolom cari dengan ikon kaca pembesar yang selalu di tengah vertikal. */
export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative flex-1 min-w-0">
      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400 dark:text-zinc-500">
        <Search className="w-4 h-4" />
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputCls} h-10 !pl-9`}
      />
    </div>
  );
}
