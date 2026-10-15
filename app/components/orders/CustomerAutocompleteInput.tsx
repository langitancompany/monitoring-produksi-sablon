// app/components/orders/CustomerAutocompleteInput.tsx
//
// Kolom isian (Nama / No HP) yang menampilkan saran PELANGGAN LAMA saat
// diketik. Memilih satu saran mengisi Nama, No HP, dan Alamat sekaligus
// (lewat onPick), jadi pelanggan repeat order tidak perlu diketik ulang.
//
// Dipakai di form Buat Pesanan (Kaos) dan Buat Pesanan Merchandise.

import React, { useId, useMemo, useState } from "react";
import { History } from "lucide-react";
import {
  Customer,
  displayPhone,
  searchCustomers,
} from "@/lib/customers";

interface CustomerAutocompleteInputProps {
  field: "nama" | "hp";
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  customers: Customer[];
  onPick: (customer: Customer) => void;
  className: string;
  placeholder: string;
}

export default function CustomerAutocompleteInput({
  field,
  value,
  onChange,
  onBlur,
  customers,
  onPick,
  className,
  placeholder,
}: CustomerAutocompleteInputProps) {
  const listId = useId();
  // Saran hanya muncul saat pengguna MENGETIK (bukan saat sekadar fokus),
  // dan tertutup setelah memilih.
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const suggestions = useMemo(
    () => searchCustomers(customers, value, field),
    [customers, value, field],
  );
  const showList = open && suggestions.length > 0;

  const pick = (c: Customer) => {
    onPick(c);
    setOpen(false);
    setActive(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showList) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div className="relative">
      <input
        className={className}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          setOpen(false);
          setActive(-1);
          onBlur?.();
        }}
      />

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          <li
            aria-hidden
            className="flex items-center gap-1 px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500"
          >
            <History className="h-3 w-3" />
            Pelanggan lama
          </li>
          {suggestions.map((c, i) => (
            <li
              key={c.key}
              role="option"
              aria-selected={i === active}
              // mousedown + preventDefault: input tidak kehilangan fokus
              // sebelum pilihan terbaca (penting di layar sentuh).
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(c)}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 ${
                i === active
                  ? "bg-zinc-100 dark:bg-zinc-800"
                  : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {c.nama || "(tanpa nama)"}
                </span>
                <span className="shrink-0 text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
                  {c.orderCount}× pesanan
                </span>
              </div>
              <div className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                {displayPhone(c.hp) || "-"}
              </div>
              {c.alamat && (
                <div className="truncate text-[11px] text-zinc-400 dark:text-zinc-500">
                  {c.alamat}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
