"use client";

import { useState } from "react";
import { Building2, ChevronDown, Check } from "lucide-react";
import { useUnitAccess, ALL_UNITS } from "@/hooks/useUnitAccess";

interface UnitSwitcherProps {
  userId: string | undefined;
  currentUnitCode: string; // unit tempat aplikasi ini berjalan, misal 'sablon'
}

export default function UnitSwitcher({
  userId,
  currentUnitCode,
}: UnitSwitcherProps) {
  const { units, loading } = useUnitAccess(userId);
  const [open, setOpen] = useState(false);

  // Tidak tampilkan apapun kalau masih loading, atau user cuma punya
  // akses ke unit ini saja (bukan direksi lintas-unit)
  if (loading || units.length <= 1) return null;

  const currentUnit =
    ALL_UNITS.find((u) => u.code === currentUnitCode) ?? units[0];

  function handleSelect(unit: (typeof units)[number]) {
    setOpen(false);
    if (unit.code === currentUnitCode) return; // sudah di unit ini
    window.location.href = `https://${unit.domain}`;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-600 dark:text-zinc-200 hover:text-[#124540] dark:hover:text-[#49BFB4] transition-colors duration-150 text-sm font-semibold"
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        <Building2 className="w-4 h-4" />
        <span className="hidden md:inline">{currentUnit.label}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/10 dark:bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div
            className="
            fixed md:absolute right-4 md:right-0 left-4 md:left-auto top-24 md:top-full md:mt-2
            md:w-56 bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800
            z-40 p-2
          "
          >
            <p className="px-3 py-2 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.14em]">
              Pindah Unit Usaha
            </p>
            {units.map((unit) => {
              const isActive = unit.code === currentUnitCode;
              return (
                <button
                  key={unit.code}
                  onClick={() => handleSelect(unit)}
                  className={`w-full text-left px-3 py-2.5 rounded-md flex items-center justify-between gap-2 text-sm font-semibold transition-colors duration-150
                    ${
                      isActive
                        ? "bg-zinc-100 dark:bg-zinc-900 text-[#124540] dark:text-[#49BFB4]"
                        : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    }`}
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  {unit.label}
                  {isActive && <Check className="w-4 h-4" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
