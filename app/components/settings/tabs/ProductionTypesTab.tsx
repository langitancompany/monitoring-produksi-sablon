// app/components/settings/tabs/ProductionTypesTab.tsx
// Tab Jenis Produksi — master data varian produksi
"use client";

import React, { useState } from "react";
import { Trash2, Pencil } from "lucide-react";
import { ProductionTypeData } from "@/types";
import { inputCls, labelCls } from "@/app/components/settings/settingsShared";

interface ProductionTypesTabProps {
  productionTypes: ProductionTypeData[];
  onSaveProductionType: (t: any) => void;
  onDeleteProductionType: (id: string) => void;
}

export default function ProductionTypesTab({
  productionTypes,
  onSaveProductionType,
  onDeleteProductionType,
}: ProductionTypesTabProps) {
  // ─── State: Production Type ─────────────────────────────────────────────────
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<any>(null);

  // ─── Type handlers ──────────────────────────────────────────────────────────

  const openTypeModal = (type?: ProductionTypeData) => {
    setEditingType(type || { name: "", value: "" });
    setIsTypeModalOpen(true);
  };

  const handleTypeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveProductionType(editingType);
    setIsTypeModalOpen(false);
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-between items-center bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 md:p-6">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Jenis Produksi
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Master data varian produksi
            </p>
          </div>
          <button
            onClick={() => openTypeModal()}
            className="bg-[#124540] hover:bg-[#0d332f] text-white px-3 py-1.5 rounded-md text-xs font-semibold transition-colors duration-150"
          >
            + Tambah
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {productionTypes.map((pt) => (
            <div
              key={pt.id}
              className="bg-white dark:bg-zinc-950 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 flex justify-between items-center"
            >
              <div>
                <div className="font-semibold text-zinc-800 dark:text-zinc-200 text-sm">
                  {pt.name}
                </div>
                <div className="font-mono tabular-nums text-[11px] px-2.5 py-1 rounded-full border border-zinc-300/70 dark:border-zinc-700 bg-white/80 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 mt-1 w-fit">
                  {pt.value}
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => openTypeModal(pt)}
                  className="p-1.5 text-zinc-300 dark:text-zinc-600 hover:text-[#2589ff] hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors duration-150"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDeleteProductionType(pt.id)}
                  className="p-1.5 text-zinc-300 dark:text-zinc-600 hover:text-red-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors duration-150"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {isTypeModalOpen && editingType && (
        <div className="fixed inset-0 bg-black/70 z-99 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-950 p-6 rounded-xl w-full max-w-sm border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-base font-semibold tracking-tight mb-4 text-zinc-900 dark:text-zinc-100">
              {editingType.id ? "Edit" : "Tambah"} Jenis Produksi
            </h3>
            <form onSubmit={handleTypeSubmit} className="space-y-4">
              <div>
                <label className={labelCls}>Nama</label>
                <input
                  autoFocus
                  className={inputCls}
                  value={editingType.name}
                  onChange={(e) =>
                    setEditingType({ ...editingType, name: e.target.value })
                  }
                  placeholder="Nama"
                />
              </div>
              <div>
                <label className={labelCls}>Value (Kode)</label>
                <input
                  className={`${inputCls} font-mono`}
                  value={editingType.value}
                  onChange={(e) =>
                    setEditingType({ ...editingType, value: e.target.value })
                  }
                  placeholder="value"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTypeModalOpen(false)}
                  className="flex-1 py-2 border border-zinc-200 dark:border-zinc-800 rounded-md font-semibold text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150 text-sm"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-[#124540] hover:bg-[#0d332f] text-white rounded-md font-semibold transition-colors duration-150 text-sm"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
