"use client";

import { useDialog } from "@/app/components/ui/DialogProvider";
import { useEffect, useState } from "react";
import { getAllPOSettings, createPOSetting } from "@/lib/po/admin";
import { POSetting } from "@/types/po";
import { Plus, ShoppingBag, CalendarDays, X, Loader2 } from "lucide-react";

interface POListSelectorProps {
  onSelect: (poId: string) => void;
}

export default function POListSelector({ onSelect }: POListSelectorProps) {
  const { notify } = useDialog();
  const [list, setList] = useState<POSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const data = await getAllPOSettings();
    setList(data);
    setLoading(false);
  }

  function handleTitleChange(v: string) {
    setTitle(v);
    setSlug(
      v
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, ""),
    );
  }

  async function handleCreate() {
    if (!title.trim() || !slug.trim()) {
      notify("Judul dan slug URL wajib diisi.");
      return;
    }
    setCreating(true);
    const result = await createPOSetting({
      title: title.trim(),
      url_slug: slug.trim(),
    });
    setCreating(false);
    if (!result.success || !result.id) {
      notify("Gagal membuat PO: " + result.error);
      return;
    }
    setShowCreate(false);
    setTitle("");
    setSlug("");
    onSelect(result.id);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-12 text-zinc-400 dark:text-zinc-500 justify-center">
        <Loader2 className="animate-spin text-[#49BFB4]" size={20} />
        <span className="text-sm font-medium">Memuat daftar PO...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Pilih PO
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            <span className="font-mono tabular-nums">{list.length}</span>{" "}
            campaign PO tersimpan
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 text-sm font-semibold bg-[#124540] hover:bg-[#0d332f] text-white px-4 py-2.5 rounded-md transition-colors duration-150"
        >
          <Plus size={16} /> Buat PO Baru
        </button>
      </div>

      {list.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-3 text-zinc-400 dark:text-zinc-500 border border-zinc-200 dark:border-zinc-800 border-dashed rounded-xl">
          <ShoppingBag size={32} strokeWidth={1.2} />
          <p className="text-sm font-semibold">Belum ada PO</p>
          <p className="text-xs">Klik "Buat PO Baru" untuk memulai</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5 gap-3">
          {list.map((po) => (
            <button
              key={po.id}
              onClick={() => onSelect(po.id)}
              className="text-left bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 hover:border-[#49BFB4]/50 transition-colors duration-150"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="p-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded-md">
                  <ShoppingBag size={18} />
                </div>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-[0.1em] px-2.5 py-1 rounded-full border ${
                    po.is_active
                      ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700"
                  }`}
                >
                  {po.is_active ? "Aktif" : "Tidak Aktif"}
                </span>
              </div>
              <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm mb-1">
                {po.title}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 font-mono tabular-nums">
                <CalendarDays size={12} />
                {po.periode_mulai || "-"} — {po.periode_selesai || "-"}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Modal Buat PO Baru */}
      {showCreate && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 w-full max-w-sm space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                Buat PO Baru
              </h3>
              <button
                onClick={() => setShowCreate(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors duration-150"
              >
                <X size={18} />
              </button>
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-2">
                Judul PO
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Contoh: PO Batch Juli 2026"
                className="w-full px-3.5 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-md text-sm bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 outline-none hover:border-[#49BFB4]/50 focus:ring-2 focus:ring-[#49BFB4] focus:border-[#49BFB4] transition-colors duration-150"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-2">
                Slug URL
              </label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="po-batch-juli-2026"
                className="w-full px-3.5 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-md text-sm bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 outline-none hover:border-[#49BFB4]/50 focus:ring-2 focus:ring-[#49BFB4] focus:border-[#49BFB4] transition-colors duration-150 font-mono"
              />
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1.5 font-mono">
                Dipakai di URL katalog publik: /po/{slug || "..."}
              </p>
            </div>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full bg-[#124540] hover:bg-[#0d332f] disabled:opacity-50 text-white font-semibold py-2.5 rounded-md text-sm transition-colors duration-150"
            >
              {creating ? "Membuat..." : "Buat & Buka PO"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
