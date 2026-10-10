"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Wallet, FileText, AlertTriangle, Hourglass } from "lucide-react";
import { finFetch, errMsg } from "@/hooks/useFinanceApi";
import type { OverviewData } from "@/lib/finance/types";
import { SummaryCard } from "../SummaryCard";
import { FilterField, filterInputCls, toolbarCls } from "../ui";
import { formatRupiah, monthStartYmd, todayYmd } from "../utils";

const BUCKET_LABEL: Record<string, string> = {
  belum_jatuh_tempo: "Belum jatuh tempo",
  telat_1_7: "Telat 1–7 hari",
  telat_8_30: "Telat 8–30 hari",
  telat_30_plus: "Telat > 30 hari",
};

export default function OverviewTab({
  version,
  onGoVerify,
  canVerify,
}: {
  version: number;
  onGoVerify: () => void;
  canVerify: boolean;
}) {
  const [from, setFrom] = useState(monthStartYmd());
  const [to, setTo] = useState(todayYmd());
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!from || !to || from > to) return;
    try {
      setData(
        await finFetch<OverviewData>(
          `/api/finance/overview?from=${from}&to=${to}`,
        ),
      );
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load, version]);

  const maxAging = Math.max(1, ...(data?.aging.map((a) => a.amount) ?? [1]));

  return (
    <div className="space-y-4 md:space-y-6">
      <div className={toolbarCls}>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-end gap-3 md:gap-4">
          <FilterField label="Dari">
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className={filterInputCls}
            />
          </FilterField>
          <FilterField label="Sampai">
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className={filterInputCls}
            />
          </FilterField>
        </div>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
          Kas masuk &amp; tagihan mengikuti rentang tanggal ini. Piutang selalu
          menunjukkan posisi saat ini.
        </p>
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      {!data && !error && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Memuat…</p>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <SummaryCard
              label="Kas masuk (terverifikasi)"
              value={formatRupiah(data.cash_in)}
              icon={<Wallet className="w-5 h-5 text-emerald-600" />}
              color="bg-emerald-50 dark:bg-emerald-950/30"
            />
            <SummaryCard
              label="Tagihan diterbitkan"
              value={formatRupiah(data.tagihan_terbit)}
              icon={
                <FileText className="w-5 h-5 text-[#124540] dark:text-[#49bfb4]" />
              }
              color="bg-[#124540]/10 dark:bg-[#49bfb4]/10"
            />
            <SummaryCard
              label={`Piutang (${data.piutang_count} order)`}
              value={formatRupiah(data.piutang_total)}
              icon={<Hourglass className="w-5 h-5 text-amber-600" />}
              color="bg-amber-50 dark:bg-amber-950/30"
            />
            <SummaryCard
              label="Piutang jatuh tempo"
              value={formatRupiah(data.piutang_overdue)}
              icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
              color="bg-red-50 dark:bg-red-950/30"
            />
          </div>

          {data.pending_count > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
              <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                <b>{data.pending_count} pembayaran</b> (
                {formatRupiah(data.pending_amount)}) menunggu verifikasi dan
                belum dihitung sebagai kas masuk.
              </p>
              {canVerify && (
                <button
                  onClick={onGoVerify}
                  className="text-xs font-semibold text-amber-700 dark:text-amber-300 underline underline-offset-2 whitespace-nowrap"
                >
                  Buka antrean
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
              <div className="px-4 md:px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
                <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em]">
                  Umur piutang
                </p>
              </div>
              <div className="p-4 md:p-5">
                <div className="space-y-3">
                  {data.aging.map((a) => (
                    <div key={a.bucket}>
                      <div className="flex justify-between text-[11px] text-zinc-500 mb-1">
                        <span>
                          {BUCKET_LABEL[a.bucket]}{" "}
                          <span className="text-zinc-400">({a.count})</span>
                        </span>
                        <span className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                          {formatRupiah(a.amount)}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
                        <div
                          className={`h-full ${a.bucket === "belum_jatuh_tempo" ? "bg-zinc-400 dark:bg-zinc-500" : a.bucket === "telat_1_7" ? "bg-amber-400" : "bg-red-500"}`}
                          style={{ width: `${(a.amount / maxAging) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
              <div className="px-4 md:px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
                <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em]">
                  Sisa tagihan terbesar
                </p>
              </div>
              <div className="p-4 md:p-5">
                {data.top_debtors.length === 0 ? (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Tidak ada piutang.
                  </p>
                ) : (
                  <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {data.top_debtors.map((d) => (
                      <li
                        key={d.order_id}
                        className="py-2 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                            {d.kode_produksi}
                          </p>
                          <p className="text-[10px] text-zinc-400 truncate">
                            {d.nama_pemesan}
                            {d.days_overdue > 0
                              ? ` · telat ${d.days_overdue} hari`
                              : ""}
                          </p>
                        </div>
                        <span className="text-xs font-mono tabular-nums font-semibold text-red-600 dark:text-red-400">
                          {formatRupiah(d.balance)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
