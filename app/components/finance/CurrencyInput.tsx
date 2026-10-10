import React, { useState } from "react";
import { formatRupiah } from "./utils";

interface CurrencyInputProps {
  label: string;
  value: number;
  onChange?: (v: number) => void;
  readOnly?: boolean;
  required?: boolean;
}

export function CurrencyInput({
  label,
  value,
  onChange,
  readOnly = false,
  required = false,
}: CurrencyInputProps) {
  const [raw, setRaw] = useState(value > 0 ? value.toString() : "");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/[^0-9]/g, "");
    setRaw(digits);
    onChange?.(parseInt(digits, 10) || 0);
  };

  const display = readOnly
    ? formatRupiah(value)
    : raw
      ? `Rp ${parseInt(raw || "0", 10).toLocaleString("id-ID")}`
      : "";

  const baseCls =
    "w-full border rounded-md px-3 py-2 text-sm font-mono tabular-nums transition-colors duration-150 outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600";
  const editCls =
    "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500";
  const readonlyCls =
    "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 cursor-not-allowed";

  return (
    <div>
      <label className="block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {readOnly ? (
        <div className={`${baseCls} ${readonlyCls}`}>{display || "Rp 0"}</div>
      ) : (
        <input
          type="text"
          inputMode="numeric"
          value={display}
          onChange={handleChange}
          placeholder="Rp 0"
          className={`${baseCls} ${editCls}`}
        />
      )}
    </div>
  );
}
