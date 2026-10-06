// app/components/settings/tabs/GesutSalaryTab.tsx
// Tab Gaji — pilihan sistem hitung gaji gesut (lama / baru)
"use client";

import React, { useState, useEffect } from "react";
import {
  KEY_GESUT_LAMA_AKTIF,
  KEY_GESUT_BARU_AKTIF,
  resolveGesutFlag,
} from "@/lib/gesutSystem";
import { useSupabaseBrowser } from "@/app/components/settings/settingsShared";

export default function GesutSalaryTab() {
  const supabase = useSupabaseBrowser();

  // ─── State: Sistem Gaji Gesut (lama / baru) ─────────────────────────────────
  const [gesutFlags, setGesutFlags] = useState({ lama: true, baru: false });
  const [gesutSaving, setGesutSaving] = useState(false);
  const [gesutError, setGesutError] = useState("");

  useEffect(() => {
    const fetchGesutFlags = async () => {
      const { data } = await supabase
        .from("pricing_configs")
        .select("id, key_name, value_amount, effective_date")
        .in("key_name", [KEY_GESUT_LAMA_AKTIF, KEY_GESUT_BARU_AKTIF]);
      const rows = (data as any[]) || [];
      setGesutFlags({
        lama: resolveGesutFlag(rows, KEY_GESUT_LAMA_AKTIF),
        baru: resolveGesutFlag(rows, KEY_GESUT_BARU_AKTIF),
      });
    };
    fetchGesutFlags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Simpan satu flag. Kalau hari ini sudah ada barisnya → UPDATE (supaya tidak
  // menumpuk baris), kalau belum → INSERT baris baru (pola histori
  // pricing_configs).
  const saveGesutFlag = async (
    keyName: string,
    displayName: string,
    aktif: boolean,
  ) => {
    const todayStr = new Date().toISOString().split("T")[0];
    const value = aktif ? 1 : 0;
    const { data: existing } = await supabase
      .from("pricing_configs")
      .select("id")
      .eq("key_name", keyName)
      .eq("effective_date", todayStr)
      .limit(1);
    if (existing && existing.length > 0) {
      const { error } = await supabase
        .from("pricing_configs")
        .update({ value_amount: value })
        .eq("id", existing[0].id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("pricing_configs").insert({
        category: "MANUAL",
        key_name: keyName,
        display_name: displayName,
        unit: "flag",
        value_amount: value,
        effective_date: todayStr,
      });
      if (error) throw error;
    }
  };

  const handleToggleGesut = async (which: "lama" | "baru") => {
    const next = { ...gesutFlags, [which]: !gesutFlags[which] };
    // Minimal satu sistem harus aktif.
    if (!next.lama && !next.baru) {
      setGesutError("Minimal satu sistem gaji harus aktif.");
      return;
    }
    setGesutError("");
    setGesutSaving(true);
    try {
      if (which === "lama") {
        await saveGesutFlag(
          KEY_GESUT_LAMA_AKTIF,
          "Sistem Gaji Gesut Lama Aktif",
          next.lama,
        );
      } else {
        await saveGesutFlag(
          KEY_GESUT_BARU_AKTIF,
          "Sistem Gaji Gesut Baru Aktif",
          next.baru,
        );
      }
      setGesutFlags(next);
    } catch (err: any) {
      console.error("Save gesut flag error:", err);
      setGesutError(err?.message || "Gagal menyimpan pengaturan.");
    } finally {
      setGesutSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 md:p-6">
        <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Sistem Gaji Gesut
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Jika keduanya aktif, menu Gaji menampilkan pilihan sistem. Jika hanya
          satu yang aktif, menu Gaji langsung memakai sistem itu.
        </p>
      </div>

      <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800">
        {(
          [
            [
              "lama",
              "Hitungan Lama",
              "Upah per area gesut (kecil / sedang / besar), dibagi 70/30 untuk PJ dan Helper.",
            ],
            [
              "baru",
              "Hitungan Baru",
              "Upah tetap per profesi (PJ, Helper) + bonus untuk warna di atas batas normal.",
            ],
          ] as ["lama" | "baru", string, string][]
        ).map(([which, title, desc]) => (
          <div
            key={which}
            className="p-5 md:p-6 flex items-center justify-between gap-4"
          >
            <div>
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                {title}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                {desc}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={gesutFlags[which]}
              disabled={gesutSaving}
              onClick={() => handleToggleGesut(which)}
              className={`shrink-0 w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-150 disabled:opacity-60 ${gesutFlags[which] ? "bg-emerald-600" : "bg-zinc-300 dark:bg-zinc-700"}`}
            >
              <span
                className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-150 ${gesutFlags[which] ? "translate-x-6" : "translate-x-0"}`}
              />
            </button>
          </div>
        ))}
      </div>
      {gesutError && (
        <p className="text-xs text-red-600 dark:text-red-400">{gesutError}</p>
      )}
    </div>
  );
}
