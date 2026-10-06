// app/components/settings/tabs/AnnouncementsTab.tsx
// Tab Pengumuman — buat & kelola pengumuman
"use client";

import React, { useState, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { UserData, Announcement } from "@/types";
import {
  inputCls,
  labelCls,
  useSupabaseBrowser,
} from "@/app/components/settings/settingsShared";

interface AnnouncementsTabProps {
  currentUser: UserData;
}

export default function AnnouncementsTab({
  currentUser,
}: AnnouncementsTabProps) {
  const supabase = useSupabaseBrowser();

  // ─── State: Announcement ────────────────────────────────────────────────────
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [annForm, setAnnForm] = useState({
    title: "",
    message: "",
    type: "info" as Announcement["type"],
    expires_at: "",
  });
  const [annLoading, setAnnLoading] = useState(false);

  // ─── Fetch Announcements ────────────────────────────────────────────────────
  useEffect(() => {
    const fetchAnnouncements = async () => {
      const { data } = await supabase
        .from("announcements")
        .select("*")
        .order("created_at", { ascending: false });
      if (data) setAnnouncements(data);
    };
    fetchAnnouncements();
  }, []);

  // ─── Announcement handlers ──────────────────────────────────────────────────

  const refreshAnnouncements = async () => {
    const { data } = await supabase
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setAnnouncements(data);
  };

  const handlePostAnnouncement = async () => {
    if (!annForm.title.trim() || !annForm.message.trim()) return;
    setAnnLoading(true);

    // Konversi ke ISO agar Supabase tahu ini waktu lokal, bukan UTC
    const expiresAt = annForm.expires_at
      ? new Date(annForm.expires_at).toISOString()
      : null;

    await supabase.from("announcements").insert({
      title: annForm.title,
      message: annForm.message,
      type: annForm.type,
      is_active: true,
      created_by: currentUser.name,
      expires_at: expiresAt, // ← pakai yang sudah dikonversi
    });

    setAnnForm({ title: "", message: "", type: "info", expires_at: "" });
    await refreshAnnouncements();
    setAnnLoading(false);
  };

  const handleToggleAnnouncement = async (id: string, current: boolean) => {
    await supabase
      .from("announcements")
      .update({ is_active: !current })
      .eq("id", id);
    setAnnouncements((prev) =>
      prev.map((a) => (a.id === id ? { ...a, is_active: !current } : a)),
    );
  };

  const handleDeleteAnnouncement = async (id: string) => {
    await supabase.from("announcements").delete().eq("id", id);
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
  };

  // Status = indikator titik + teks berwarna (bukan badge kotak penuh)
  const typeTextColors: Record<Announcement["type"], string> = {
    info: "text-zinc-500 dark:text-zinc-400",
    warning: "text-orange-600 dark:text-orange-500",
    success: "text-emerald-600 dark:text-emerald-500",
    update: "text-purple-600 dark:text-purple-500",
  };

  const typeDotColors: Record<Announcement["type"], string> = {
    info: "bg-zinc-400",
    warning: "bg-orange-600",
    success: "bg-emerald-600",
    update: "bg-purple-600",
  };

  const typeLabels: Record<Announcement["type"], string> = {
    info: "Info",
    warning: "Peringatan",
    success: "Sukses",
    update: "Update",
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 md:p-6">
        <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Pengumuman
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Kirim informasi atau update ke semua anggota
        </p>
      </div>

      {/* Form buat pengumuman */}
      <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="px-4 md:px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em]">
            Buat Pengumuman Baru
          </p>
        </div>
        <div className="p-5 md:p-6 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Judul</label>
              <input
                className={inputCls}
                placeholder="Judul pengumuman"
                value={annForm.title}
                onChange={(e) =>
                  setAnnForm({ ...annForm, title: e.target.value })
                }
              />
            </div>
            <div>
              <label className={labelCls}>Tipe</label>
              <select
                className={inputCls}
                value={annForm.type}
                onChange={(e) =>
                  setAnnForm({
                    ...annForm,
                    type: e.target.value as Announcement["type"],
                  })
                }
              >
                <option value="info">Info</option>
                <option value="warning">Peringatan</option>
                <option value="success">Sukses</option>
                <option value="update">Update Aplikasi</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Pesan</label>
            <textarea
              className={`${inputCls} resize-none h-20`}
              placeholder="Isi pengumuman..."
              value={annForm.message}
              onChange={(e) =>
                setAnnForm({ ...annForm, message: e.target.value })
              }
            />
          </div>
          <div>
            <label className={labelCls}>Berlaku Sampai (Opsional)</label>
            <input
              type="datetime-local"
              className={inputCls}
              value={annForm.expires_at}
              onChange={(e) =>
                setAnnForm({ ...annForm, expires_at: e.target.value })
              }
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={handlePostAnnouncement}
              disabled={
                !annForm.title.trim() || !annForm.message.trim() || annLoading
              }
              className="bg-[#124540] hover:bg-[#0d332f] text-white px-4 py-2 rounded-md text-sm font-semibold transition-colors duration-150 disabled:opacity-50"
            >
              {annLoading ? "Mengirim..." : "Kirim Pengumuman"}
            </button>
          </div>
        </div>
      </div>

      {/* Daftar pengumuman */}
      {announcements.length > 0 && (
        <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-4 md:px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
            <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em]">
              Riwayat Pengumuman
            </p>
          </div>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {announcements.map((a) => (
              <li
                key={a.id}
                className="flex items-start justify-between gap-3 px-4 py-3"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${typeDotColors[a.type]}`}
                      />
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${typeTextColors[a.type]}`}
                      >
                        {typeLabels[a.type]}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${a.is_active ? "bg-emerald-600" : "bg-zinc-400"}`}
                      />
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${
                          a.is_active
                            ? "text-emerald-600 dark:text-emerald-500"
                            : "text-zinc-400 dark:text-zinc-500"
                        }`}
                      >
                        {a.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                    {a.title}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                    {a.message}
                  </p>
                  {a.expires_at && (
                    <p className="font-mono tabular-nums text-[10px] text-zinc-400 dark:text-zinc-500">
                      Expired:{" "}
                      {new Date(a.expires_at).toLocaleString("id-ID", {
                        timeZone: "Asia/Jakarta",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 pt-1">
                  <button
                    onClick={() => handleToggleAnnouncement(a.id, a.is_active)}
                    className={`text-xs font-semibold px-2 py-1 rounded-md transition-colors duration-150 ${
                      a.is_active
                        ? "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        : "text-emerald-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {a.is_active ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                  <button
                    onClick={() => handleDeleteAnnouncement(a.id)}
                    className="p-1.5 text-zinc-300 dark:text-zinc-600 hover:text-red-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors duration-150"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
