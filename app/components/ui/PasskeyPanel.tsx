// app/components/ui/PasskeyPanel.tsx
"use client";

// Bagian "Sidik jari & passkey" di dalam dialog Edit
// Profil: daftarkan perangkat ini, lihat daftar, hapus. Ada di Edit Profil
// (bukan di Pengaturan) karena Pengaturan dibatasi izin, sedangkan setiap
// pengguna perlu bisa mendaftarkan sidik jarinya sendiri.
//
// Satu passkey = satu perangkat. Pendaftarannya memakai verifikasi yang
// dimiliki perangkat saat itu: sidik jari, Face ID, atau kunci layar. Passkey
// tersimpan di akun login (Supabase Auth) yang dipakai bersama semua unit, jadi
// menghapusnya di sini juga menghapusnya di unit lain.

import React, { useCallback, useEffect, useState } from "react";
import { Fingerprint, Loader2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { describePasskeyError, guessDeviceName } from "@/lib/passkeyErrors";
import {
  deletePasskey,
  isPasskeySupported,
  listPasskeys,
  registerPasskey,
  type PasskeyRow,
} from "@/lib/supabase/passkey";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export default function PasskeyPanel() {
  const [supabase] = useState(() => createClient());
  const [passkeys, setPasskeys] = useState<PasskeyRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Dirender setelah dialog dibuka oleh klik pengguna, jadi `window` pasti ada.
  const supported = isPasskeySupported();

  const reload = useCallback(async () => {
    try {
      setPasskeys(await listPasskeys(supabase));
      setLoadError(null);
    } catch (err) {
      console.error("[passkey] gagal memuat daftar:", err);
      setLoadError(describePasskeyError(err, "register"));
      setPasskeys([]);
    }
  }, [supabase]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleRegister() {
    setIsRegistering(true);
    setActionError(null);
    try {
      await registerPasskey(supabase, guessDeviceName(navigator.userAgent));
      await reload();
    } catch (err) {
      // Pesan untuk pengguna sengaja ringkas; detail aslinya di konsol browser.
      console.error("[passkey] pendaftaran gagal:", err);
      setActionError(describePasskeyError(err, "register"));
    } finally {
      setIsRegistering(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setActionError(null);
    try {
      await deletePasskey(supabase, id);
      setConfirmDeleteId(null);
      await reload();
    } catch (err) {
      console.error("[passkey] gagal menghapus:", err);
      setActionError("Gagal menghapus passkey. Coba lagi.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        <Fingerprint className="h-4 w-4 text-[#49bfb4]" />
        Sidik jari &amp; passkey
      </h4>
      <p className="mt-1.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        Daftarkan perangkat ini supaya bisa masuk tanpa mengetik password. Yang
        dipakai menyesuaikan perangkat: sidik jari, Face ID, atau kunci layar.
      </p>

      {!supported ? (
        <p className="mt-4 rounded-md border border-zinc-200 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
          Browser ini belum mendukung passkey. Coba Chrome, Edge, Safari, atau
          Firefox versi terbaru.
        </p>
      ) : (
        <button
          type="button"
          onClick={() => void handleRegister()}
          disabled={isRegistering}
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-md border border-zinc-300 text-sm font-semibold text-zinc-800 transition-colors duration-150 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
        >
          {isRegistering ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Fingerprint className="h-4 w-4" />
          )}
          {isRegistering ? "Menunggu verifikasi..." : "Daftarkan perangkat ini"}
        </button>
      )}

      {actionError && (
        <p
          role="alert"
          className="mt-3 border-l-2 border-red-500 bg-red-50 py-2 pl-3 pr-3 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300"
        >
          {actionError}
        </p>
      )}

      <div className="mt-5">
        <p className="mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
          Perangkat terdaftar
        </p>

        {passkeys === null ? (
          <div className="flex items-center gap-2 py-2 text-xs text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Memuat...
          </div>
        ) : loadError ? (
          <p className="text-xs text-red-600 dark:text-red-400">{loadError}</p>
        ) : passkeys.length === 0 ? (
          <p className="py-1 text-xs text-zinc-500 dark:text-zinc-400">
            Belum ada perangkat terdaftar.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {passkeys.map((p) => {
              const used = formatDate(p.last_used_at);
              const isConfirming = confirmDeleteId === p.id;
              const isDeleting = deletingId === p.id;
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {p.friendly_name || "Passkey tanpa nama"}
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Didaftarkan {formatDate(p.created_at)}
                      {used ? `, terakhir dipakai ${used}` : ""}
                    </p>
                  </div>
                  {isConfirming ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleDelete(p.id)}
                        disabled={isDeleting}
                        className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-150 hover:bg-red-700 disabled:opacity-60 max-lg:min-h-11"
                      >
                        {isDeleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Hapus
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        disabled={isDeleting}
                        className="rounded-md px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors duration-150 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900 max-lg:min-h-11"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(p.id)}
                      aria-label={`Hapus ${p.friendly_name || "passkey"}`}
                      className="inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-zinc-400 transition-colors duration-150 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 max-lg:size-11"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
