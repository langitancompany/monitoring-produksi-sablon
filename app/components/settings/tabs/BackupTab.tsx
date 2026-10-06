// app/components/settings/tabs/BackupTab.tsx
// Tab Backup — download semua data aplikasi (JSON)
"use client";

import React, { useState } from "react";

export default function BackupTab() {
  const [backupLoading, setBackupLoading] = useState(false);

  // ─── Backup handler ──────────────────────────────────────────────────────────
  const handleBackup = async () => {
    setBackupLoading(true);
    try {
      const res = await fetch("/api/backup");

      // Tambah ini untuk debug
      console.log("Status:", res.status);
      const text = await res.text();
      console.log("Response:", text);

      if (!res.ok) throw new Error(`Gagal: ${res.status} - ${text}`);

      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setBackupLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 md:p-6">
        <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Backup Data
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Download semua data aplikasi dalam format JSON. Hanya dapat diakses
          oleh admin.
        </p>
      </div>

      <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 md:p-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Export semua data
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Mencakup semua tabel: pesanan, produksi, pengguna, dan lainnya.
          </p>
        </div>
        <button
          onClick={handleBackup}
          disabled={backupLoading}
          className="shrink-0 flex items-center gap-2 bg-[#124540] hover:bg-[#0d332f] text-white px-4 py-2 rounded-md text-sm font-semibold transition-colors duration-150 disabled:opacity-50"
        >
          {backupLoading ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Menyiapkan...
            </>
          ) : (
            <>Download Backup</>
          )}
        </button>
      </div>
    </div>
  );
}
