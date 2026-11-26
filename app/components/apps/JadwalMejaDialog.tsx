// app/components/apps/JadwalMejaDialog.tsx
"use client";

import React, { useMemo, useState } from "react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Loader2, X } from "lucide-react";
import { Order } from "@/types";
import {
  DURASI_MAX,
  bentrokJadwal,
  estimasiSelesai,
  isDurasiValid,
  kondisiHari,
  labelPutusan,
  mulaiPalingAkhir,
  nilaiJadwal,
  parseTanggal,
  tglIso,
} from "@/lib/mejaProduksi";
import { VERDICT_BADGE } from "./jadwalMejaStyle";

interface Props {
  order: Order;
  /** Semua order aktif, dipakai untuk membaca beban meja per hari. */
  orders: Order[];
  /** Tanggal awal yang ditawarkan bila order belum punya jadwal. */
  defaultMulai: string;
  onClose: () => void;
  onSave: (
    jadwal: { mulai: string; durasi: number; gabung: boolean } | null,
  ) => Promise<boolean>;
}

const STRIP_DAYS = 7;

const KONDISI_WARNA = {
  kosong: "text-emerald-600 dark:text-emerald-400",
  gabung: "text-sky-600 dark:text-sky-400",
  penuh: "text-red-600 dark:text-red-400",
} as const;

const fmtTgl = (d: Date) => format(d, "EEE, d MMM yyyy", { locale: idLocale });

export default function JadwalMejaDialog({
  order,
  orders,
  defaultMulai,
  onClose,
  onSave,
}: Props) {
  const hadJadwal = !!order.meja_mulai && order.meja_durasi != null;
  const [mulai, setMulai] = useState(order.meja_mulai || defaultMulai);
  const [durasiText, setDurasiText] = useState(
    order.meja_durasi ? String(order.meja_durasi) : "",
  );
  const [gabung, setGabung] = useState(order.meja_gabung === true);
  const [saving, setSaving] = useState(false);

  const mulaiDate = parseTanggal(mulai);
  const durasi = Number(durasiText);
  const durasiOk = durasiText !== "" && isDurasiValid(durasi);
  const deadline = parseTanggal(order.deadline);

  const selesai = mulaiDate && durasiOk ? estimasiSelesai(mulaiDate, durasi) : null;
  const penilaian = selesai ? nilaiJadwal(selesai, order.deadline) : null;

  // Beban meja tanpa order ini sendiri, supaya mengubah jadwal tidak menghitung dua kali.
  const lainnya = useMemo(
    () => orders.filter((o) => o.id !== order.id),
    [orders, order.id],
  );

  const strip = useMemo(() => {
    if (!mulaiDate) return [];
    return Array.from({ length: STRIP_DAYS }, (_, i) => {
      const d = new Date(
        mulaiDate.getFullYear(),
        mulaiDate.getMonth(),
        mulaiDate.getDate() + i,
      );
      return { d, iso: tglIso(d), ...kondisiHari(lainnya, d, gabung) };
    });
  }, [mulaiDate, lainnya, gabung]);

  const bentrok = useMemo(
    () =>
      mulaiDate && durasiOk
        ? bentrokJadwal(lainnya, mulaiDate, durasi, gabung)
        : [],
    [mulaiDate, durasiOk, durasi, gabung, lainnya],
  );

  const terakhirTepat =
    deadline && durasiOk ? mulaiPalingAkhir(deadline, durasi) : null;
  const sisaLonggar =
    terakhirTepat && mulaiDate
      ? Math.round(
          (Date.UTC(
            terakhirTepat.getFullYear(),
            terakhirTepat.getMonth(),
            terakhirTepat.getDate(),
          ) -
            Date.UTC(
              mulaiDate.getFullYear(),
              mulaiDate.getMonth(),
              mulaiDate.getDate(),
            )) /
            86400000,
        )
      : null;

  const canSave = !!mulaiDate && durasiOk && !saving;

  const run = async (
    jadwal: { mulai: string; durasi: number; gabung: boolean } | null,
  ) => {
    setSaving(true);
    const ok = await onSave(jadwal);
    setSaving(false);
    if (ok) onClose();
  };

  const field =
    "w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 focus:ring-2 focus:ring-[#124540] outline-none transition-colors duration-150";

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-zinc-950/80" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md max-h-[90vh] flex flex-col bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 rounded-t-xl">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-white tracking-tight">
              Jadwal naik meja
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 truncate">
              {order.nama_pemesan} ·{" "}
              <span className="font-mono tabular-nums">{order.jumlah} pcs</span>
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="p-2 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 transition-colors duration-150"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Tanggal masuk</dt>
              <dd className="mt-0.5 font-semibold text-zinc-800 dark:text-zinc-100">
                {parseTanggal(order.tanggal_masuk)
                  ? fmtTgl(parseTanggal(order.tanggal_masuk)!)
                  : "-"}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">
                Deadline permintaan customer
              </dt>
              <dd className="mt-0.5 font-semibold text-zinc-800 dark:text-zinc-100">
                {deadline ? fmtTgl(deadline) : "Belum diisi"}
              </dd>
            </div>
          </dl>

          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <label className="block">
              <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em]">
                Naik meja tanggal
              </span>
              <input
                type="date"
                value={mulai}
                onChange={(e) => setMulai(e.target.value)}
                className={`${field} mt-1`}
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em]">
                Durasi (hari)
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={DURASI_MAX}
                value={durasiText}
                onChange={(e) => setDurasiText(e.target.value)}
                placeholder="mis. 3"
                className={`${field} mt-1 font-mono tabular-nums`}
              />
            </label>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={gabung}
              onChange={(e) => setGabung(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[#124540]"
            />
            <span className="text-xs text-zinc-700 dark:text-zinc-300">
              <span className="font-semibold">Bisa digabung</span> dengan order
              lain di tanggal yang sama (sesuai jawaban petugas produksi).
            </span>
          </label>

          {strip.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] mb-1.5">
                Isi meja {STRIP_DAYS} hari dari tanggal ini
              </p>
              <div className="grid grid-cols-7 gap-1">
                {strip.map((s) => (
                  <button
                    key={s.iso}
                    type="button"
                    onClick={() => setMulai(s.iso)}
                    title={`${s.order} order · ${s.pcs} pcs di meja. Klik untuk naik meja di tanggal ini.`}
                    className={`rounded-md border px-1 py-1.5 text-center transition-colors duration-150 ${
                      s.iso === mulai
                        ? "border-[#124540] ring-1 ring-[#124540]"
                        : "border-zinc-200 dark:border-zinc-800 hover:border-[#124540]/50"
                    }`}
                  >
                    <span className="block text-[9px] uppercase text-zinc-400">
                      {format(s.d, "EEE", { locale: idLocale })}
                    </span>
                    <span className="block text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                      {format(s.d, "d")}
                    </span>
                    <span
                      className={`block mt-0.5 text-[10px] font-semibold ${KONDISI_WARNA[s.kondisi]}`}
                    >
                      {s.kondisi === "kosong"
                        ? "kosong"
                        : `${s.order} ${s.kondisi === "gabung" ? "gabung" : "penuh"}`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {bentrok.length > 0 && (
            <p className="text-xs rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 p-3">
              Bertumpuk dengan {bentrok.length} order yang tidak bisa digabung:{" "}
              {bentrok
                .slice(0, 3)
                .map((o) => o.nama_pemesan)
                .join(", ")}
              {bentrok.length > 3 && `, dan ${bentrok.length - 3} lainnya`}.
              Jadwal tetap bisa disimpan.
            </p>
          )}

          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50 dark:bg-zinc-900">
            {selesai && penilaian ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    Estimasi selesai
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${VERDICT_BADGE[penilaian.putusan]}`}
                  >
                    {labelPutusan(penilaian)}
                  </span>
                </div>
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  {fmtTgl(selesai)}
                </p>
                {terakhirTepat && sisaLonggar !== null && (
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    {sisaLonggar >= 0
                      ? `Naik meja paling lambat ${fmtTgl(terakhirTepat)} agar tidak melewati deadline.`
                      : `Agar tepat deadline, naik meja paling lambat ${fmtTgl(terakhirTepat)}, ${Math.abs(sisaLonggar)} hari lebih awal dari pilihan ini.`}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Isi tanggal naik meja dan durasi untuk melihat estimasi selesai dan
                perbandingannya dengan deadline.
              </p>
            )}
          </div>
        </div>

        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-b-xl flex items-center justify-between gap-2">
          {hadJadwal ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => run(null)}
              className="px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md transition-colors duration-150 disabled:opacity-60"
            >
              Hapus jadwal
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors duration-150"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={!canSave}
              onClick={() => run({ mulai, durasi, gabung })}
              className="px-4 py-2 text-xs font-semibold bg-[#124540] text-white hover:bg-[#0d332f] rounded-md transition-colors duration-150 flex items-center gap-2 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              Simpan jadwal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
