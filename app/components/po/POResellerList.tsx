"use client";

import { useMarkPODataStaleOnLeave } from "./POAdminDataContext";
import { useDialog } from "@/app/components/ui/DialogProvider";
import { useEffect, useState } from "react";
import {
  getAllResellers,
  createReseller,
  updateReseller,
  toggleResellerActive,
  deleteReseller,
  confirmReseller,
  getPOSettingAdmin,
} from "@/lib/po/admin";
import { POResellerFull } from "@/types/po";
import {
  ArrowLeft,
  Plus,
  UserCheck,
  UserX,
  Pencil,
  Trash2,
  Users,
  Phone,
  MapPin,
  Hash,
  Lock,
  Store,
  Clock,
  MessageCircleMore,
} from "lucide-react";
import { buildConfirmationMessage, buildWaLink } from "@/lib/po/wa-messages";

const EMPTY_FORM = { kode: "", pin_hash: "", nama: "", whatsapp: "", kota: "" };

// Wajibkan komponen menerima properti poId
interface POResellerListProps {
  poId: string;
}

export default function POResellerList({ poId }: POResellerListProps) {
  const { notify, confirmAsync } = useDialog();
  useMarkPODataStaleOnLeave();
  const [resellers, setResellers] = useState<POResellerFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<POResellerFull | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [tab, setTab] = useState<"aktif" | "pending">("aktif");
  const [urlSlug, setUrlSlug] = useState<string>("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    load();
    // Gunakan poId untuk mendapatkan pengaturan URL Slug khusus PO ini
    getPOSettingAdmin(poId).then((s) => {
      if (s?.url_slug) setUrlSlug(s.url_slug);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poId]);

  async function load() {
    setLoading(true);
    const data = await getAllResellers();
    setResellers(data);
    setLoading(false);
  }

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(r: POResellerFull) {
    setEditTarget(r);
    setForm({
      kode: r.kode,
      pin_hash: "",
      nama: r.nama,
      whatsapp: r.whatsapp || "",
      kota: r.kota || "",
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.kode || !form.nama) {
      notify("Kode dan nama wajib diisi.");
      return;
    }
    if (!editTarget && !form.pin_hash) {
      notify("PIN wajib diisi untuk reseller baru.");
      return;
    }
    setSaving(true);

    if (editTarget) {
      const updates: any = {
        nama: form.nama,
        whatsapp: form.whatsapp,
        kota: form.kota,
      };
      if (form.pin_hash) updates.pin_hash = form.pin_hash;
      await updateReseller(editTarget.id, updates);
    } else {
      await createReseller({
        kode: form.kode.toUpperCase(),
        pin_hash: form.pin_hash,
        nama: form.nama,
        whatsapp: form.whatsapp || undefined,
        kota: form.kota || undefined,
      });
    }

    setSaving(false);
    setShowForm(false);
    load();
  }

  async function handleToggle(id: string, current: boolean) {
    await toggleResellerActive(id, !current);
    setResellers((prev) =>
      prev.map((r) => (r.id === id ? { ...r, is_active: !current } : r)),
    );
  }

  async function handleDelete(id: string, nama: string) {
    if (!(await confirmAsync(`Hapus reseller "${nama}"?`))) return;
    await deleteReseller(id);
    setResellers((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleConfirm(r: POResellerFull) {
    setConfirmingId(r.id);

    const portalUrl = urlSlug
      ? `${window.location.origin}/po/reseller?slug=${urlSlug}`
      : window.location.origin;

    const message = buildConfirmationMessage(r, portalUrl);
    const waLink = buildWaLink(r.whatsapp || "", message);

    await confirmReseller(r.id);

    setResellers((prev) =>
      prev.map((x) =>
        x.id === r.id ? { ...x, status: "confirmed", is_active: true } : x,
      ),
    );
    setConfirmingId(null);
    window.open(waLink, "_blank");
  }

  const filteredResellers = resellers.filter((r) =>
    tab === "pending" ? r.status === "pending" : r.status !== "pending",
  );
  const pendingCount = resellers.filter((r) => r.status === "pending").length;

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-8 text-zinc-400 dark:text-zinc-500">
        <Users size={16} className="animate-pulse" />
        <span className="text-sm">Memuat reseller...</span>
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="w-full max-w-3xl mx-auto">
        <button
          onClick={() => setShowForm(false)}
          className="flex items-center gap-1.5 text-sm text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 font-semibold mb-6 transition-colors duration-150"
        >
          <ArrowLeft size={16} /> Kembali
        </button>
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">
              {editTarget ? "Edit Reseller" : "Tambah Reseller Baru"}
            </h2>
            <p className="text-xs text-zinc-500 mt-1">
              Lengkapi data informasi pendaftaran reseller.
            </p>
          </div>
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">
                  <Hash size={11} /> Kode Reseller *
                </label>
                <input
                  type="text"
                  value={form.kode}
                  onChange={(e) => setForm({ ...form, kode: e.target.value })}
                  placeholder="BOS-01"
                  className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-md px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 hover:border-[#49bfb4]/50 focus:outline-none focus:ring-2 focus:ring-[#49bfb4] focus:border-[#49bfb4] transition-colors duration-150 uppercase"
                  disabled={!!editTarget}
                />
                {editTarget && (
                  <p className="text-[10px] text-orange-600 mt-1">
                    Kode tidak dapat diubah
                  </p>
                )}
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">
                  <Lock size={11} /> PIN Login{" "}
                  {editTarget ? "(Kosongkan jika tidak ubah)" : "*"}
                </label>
                <input
                  type="text"
                  value={form.pin_hash}
                  onChange={(e) =>
                    setForm({ ...form, pin_hash: e.target.value })
                  }
                  placeholder="123456"
                  className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-md px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 hover:border-[#49bfb4]/50 focus:outline-none focus:ring-2 focus:ring-[#49bfb4] focus:border-[#49bfb4] transition-colors duration-150"
                />
              </div>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">
                <Store size={11} /> Nama Lengkap / Toko *
              </label>
              <input
                type="text"
                value={form.nama}
                onChange={(e) => setForm({ ...form, nama: e.target.value })}
                placeholder="Toko Berkah Abadi"
                className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-md px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 hover:border-[#49bfb4]/50 focus:outline-none focus:ring-2 focus:ring-[#49bfb4] focus:border-[#49bfb4] transition-colors duration-150"
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">
                <Phone size={11} /> WhatsApp
              </label>
              <input
                type="text"
                value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                placeholder="628123456789"
                className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-md px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 hover:border-[#49bfb4]/50 focus:outline-none focus:ring-2 focus:ring-[#49bfb4] focus:border-[#49bfb4] transition-colors duration-150"
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">
                <MapPin size={11} /> Kota / Alamat
              </label>
              <textarea
                value={form.kota}
                onChange={(e) => setForm({ ...form, kota: e.target.value })}
                placeholder="Bandung, Jawa Barat"
                rows={2}
                className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-md px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 hover:border-[#49bfb4]/50 focus:outline-none focus:ring-2 focus:ring-[#49bfb4] focus:border-[#49bfb4] transition-colors duration-150"
              />
            </div>
          </div>
          <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3">
            <button
              onClick={() => setShowForm(false)}
              className="px-5 py-2 text-sm font-semibold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors duration-150"
            >
              Batal
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-[#124540] hover:bg-[#0d332f] text-white px-6 py-2 rounded-md text-sm font-semibold transition-colors duration-150 disabled:opacity-50"
            >
              {saving ? "Menyimpan..." : "Simpan Data"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 md:p-6">
        <div className="flex gap-2 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-md">
          <button
            onClick={() => setTab("aktif")}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors duration-150 ${tab === "aktif" ? "bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100" : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"}`}
          >
            Reseller Aktif
          </button>
          <button
            onClick={() => setTab("pending")}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors duration-150 flex items-center gap-2 ${tab === "pending" ? "bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100" : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"}`}
          >
            Pendaftar Baru
            {pendingCount > 0 && (
              <span className="font-mono tabular-nums bg-red-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {pendingCount}
              </span>
            )}
          </button>
        </div>
        {tab === "aktif" && (
          <button
            onClick={openCreate}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#124540] hover:bg-[#0d332f] text-white px-5 py-2.5 rounded-md text-sm font-semibold transition-colors duration-150"
          >
            <Plus size={16} /> Tambah
          </button>
        )}
      </div>

      {filteredResellers.length === 0 ? (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950">
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-400 dark:text-zinc-600">
            <Users size={32} strokeWidth={1.5} />
            <p className="text-sm font-medium">
              {tab === "pending"
                ? "Tidak ada pendaftar baru."
                : "Belum ada reseller."}
            </p>
            {tab === "aktif" && (
              <button
                onClick={openCreate}
                className="text-sm text-[#49bfb4] font-semibold hover:underline"
              >
                Tambah reseller pertama
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 text-[10px] uppercase font-semibold tracking-wider border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className="px-4 py-3.5 pl-6">Kode & Nama</th>
                <th className="px-4 py-3.5">Kontak</th>
                <th className="px-4 py-3.5">Kota</th>
                {tab === "pending" && (
                  <th className="px-4 py-3.5">Waktu Daftar</th>
                )}
                <th className="px-4 py-3.5 text-right pr-6">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filteredResellers.map((r) => (
                <tr
                  key={r.id}
                  className="hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150"
                >
                  <td className="px-4 py-3.5 pl-6">
                    <div className="flex flex-col">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                        {r.nama}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-[10px] font-semibold text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-md tracking-wide">
                          {r.kode}
                        </span>
                        {!r.is_active && r.status !== "pending" && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-red-600">
                            Nonaktif
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    {r.whatsapp ? (
                      <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
                        <Phone size={12} className="text-zinc-400" />
                        <span className="font-medium">{r.whatsapp}</span>
                      </div>
                    ) : (
                      <span className="text-zinc-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-300">
                    {r.kota || "-"}
                  </td>
                  {tab === "pending" && (
                    <td className="px-4 py-3.5 text-xs text-zinc-500">
                      <div className="flex items-center gap-1.5 font-mono tabular-nums">
                        <Clock size={12} />
                        {new Date(r.created_at).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-3.5">
                    <div className="flex gap-1 justify-end">
                      {r.status === "pending" ? (
                        <>
                          <button
                            onClick={() => handleConfirm(r)}
                            disabled={confirmingId === r.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#124540] hover:bg-[#0d332f] text-white rounded-md text-xs font-semibold transition-colors duration-150 disabled:opacity-50"
                          >
                            {confirmingId === r.id ? (
                              "Memproses..."
                            ) : (
                              <>
                                <MessageCircleMore size={13} /> Konfirmasi WA
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => handleDelete(r.id, r.nama)}
                            title="Tolak"
                            className="p-1.5 border border-red-200 dark:border-red-900/50 rounded-md text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors duration-150"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleToggle(r.id, r.is_active)}
                            title={r.is_active ? "Nonaktifkan" : "Aktifkan"}
                            className="p-1.5 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors duration-150"
                          >
                            {r.is_active ? (
                              <UserX size={13} />
                            ) : (
                              <UserCheck size={13} />
                            )}
                          </button>
                          <button
                            onClick={() => openEdit(r)}
                            title="Edit"
                            className="p-1.5 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors duration-150"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(r.id, r.nama)}
                            title="Hapus"
                            className="p-1.5 border border-red-200 dark:border-red-900/50 rounded-md text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors duration-150"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
