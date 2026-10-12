"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Download, TrendingUp, Wallet, ArrowUpFromLine, Hourglass } from "lucide-react";
import { useDialog } from "@/app/components/ui/DialogProvider";
import { finFetch, postJson, errMsg } from "@/hooks/useFinanceApi";
import type { ReportData } from "@/lib/finance/types";
import { SummaryCard } from "../SummaryCard";
import { FilterField, filterInputCls, toolbarCls, cardCls, sectionLabelCls, smallGhostBtnCls } from "../ui";
import { formatRupiah, toYmd, todayYmd } from "../utils";

const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "short", year: "numeric" });
};

const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "-");

type Sort = "newest" | "lowest" | "highest";

/**
 * Laporan: laba rugi (basis TAGIHAN) dan arus kas (basis UANG) berdampingan.
 *   Pendapatan = nilai tagihan order pada periode (tanggal masuk order)
 *   Biaya      = pengeluaran berstatus Disetujui pada periode
 *   Laba       = Pendapatan − Biaya
 */
export default function ReportTab({ version }: { version: number }) {
  const { notify } = useDialog();
  const [from, setFrom] = useState(`${todayYmd().slice(0, 4)}-01-01`);
  const [to, setTo] = useState(todayYmd());
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("newest");

  const load = useCallback(async () => {
    if (!from || !to || from > to) return;
    try {
      setData(await finFetch<ReportData>(`/api/finance/report?from=${from}&to=${to}`));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load, version]);

  const preset = (kind: "month" | "3m" | "year") => {
    const now = new Date();
    const start =
      kind === "month"
        ? new Date(now.getFullYear(), now.getMonth(), 1)
        : kind === "3m"
          ? new Date(now.getFullYear(), now.getMonth() - 2, 1)
          : new Date(now.getFullYear(), 0, 1);
    setFrom(toYmd(start));
    setTo(todayYmd());
  };

  const orders = useMemo(() => {
    const list = [...(data?.orders ?? [])];
    if (sort === "lowest") list.sort((a, b) => a.gross - b.gross);
    if (sort === "highest") list.sort((a, b) => b.gross - a.gross);
    return list;
  }, [data, sort]);

  const maxAbsProfit = Math.max(1, ...(data?.months.map((m) => Math.abs(m.profit)) ?? [1]));
  const maxCat = Math.max(1, ...(data?.by_category.map((c) => c.amount) ?? [1]));

  const exportExcel = async () => {
    if (!data) return;
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet([
          ...data.months.map((m) => ({
            Bulan: m.month,
            "Pendapatan (tagihan)": m.revenue,
            Biaya: m.expenses,
            Laba: m.profit,
            "Kas masuk": m.cash_in,
            "Kas keluar": m.cash_out,
            "Arus kas bersih": m.cash_net,
          })),
          {
            Bulan: "TOTAL",
            "Pendapatan (tagihan)": data.totals.revenue,
            Biaya: data.totals.expenses,
            Laba: data.totals.profit,
            "Kas masuk": data.totals.cash_in,
            "Kas keluar": data.totals.cash_out,
            "Arus kas bersih": data.totals.cash_net,
          },
        ]),
        "Bulanan",
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(data.by_category.map((c) => ({ Kategori: c.name, Biaya: c.amount }))),
        "Biaya per kategori",
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          data.orders.map((o) => ({
            "Kode Produksi": o.kode_produksi,
            Pemesan: o.nama_pemesan,
            "Tanggal Masuk": o.tanggal_masuk ?? "",
            Tagihan: o.total,
            Terbayar: o.paid,
            "Biaya langsung": o.direct_cost,
            "Laba kotor": o.gross,
          })),
        ),
        "Per order",
      );
      XLSX.writeFile(wb, `laporan-keuangan-${data.period.from}_${data.period.to}.xlsx`);
      // Catat siapa yang mengekspor (gagal mencatat tidak membatalkan ekspor).
      void postJson("/api/finance/export-log", {
        scope: `laporan:${data.period.from}..${data.period.to}`,
        row_count: data.months.length + data.by_category.length + data.orders.length,
      }).catch(() => {});
    } catch (e) {
      notify(errMsg(e), { title: "Gagal ekspor" });
    }
  };

  const colorPL = (n: number) => (n >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400");

  return (
    <div className="space-y-4 md:space-y-6">
      <div className={toolbarCls}>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-end gap-3 md:gap-4">
          <FilterField label="Dari">
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={filterInputCls} />
          </FilterField>
          <FilterField label="Sampai">
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={filterInputCls} />
          </FilterField>
          <div className="col-span-2 sm:col-span-1 flex flex-wrap gap-2 sm:pb-0.5">
            <button type="button" onClick={() => preset("month")} className={smallGhostBtnCls}>Bulan ini</button>
            <button type="button" onClick={() => preset("3m")} className={smallGhostBtnCls}>3 bulan</button>
            <button type="button" onClick={() => preset("year")} className={smallGhostBtnCls}>Tahun ini</button>
          </div>
          <div className="col-span-2 sm:col-span-1 sm:ml-auto">
            <button
              type="button"
              onClick={exportExcel}
              disabled={!data}
              className="flex items-center justify-center gap-2 h-10 w-full sm:w-auto px-4 border border-zinc-200 dark:border-zinc-800 rounded-md text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150 disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> Ekspor Excel
            </button>
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {!data && !error && <p className="text-xs text-zinc-500 dark:text-zinc-400">Memuat…</p>}

      {data && (
        <>
          {data.truncated && (
            <p className="text-xs text-amber-700 dark:text-amber-400 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
              Data pada rentang ini melebihi batas tampilan sehingga angka bisa kurang lengkap. Persempit rentang tanggalnya.
            </p>
          )}

          <div>
            <p className={`${sectionLabelCls} mb-2`}>Laba rugi (berdasarkan tagihan)</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              <SummaryCard label="Pendapatan (tagihan)" value={formatRupiah(data.totals.revenue)} icon={<TrendingUp className="w-5 h-5 text-[#124540] dark:text-[#49bfb4]" />} color="bg-[#124540]/10 dark:bg-[#49bfb4]/10" />
              <SummaryCard label="Biaya (disetujui)" value={formatRupiah(data.totals.expenses)} icon={<ArrowUpFromLine className="w-5 h-5 text-red-600" />} color="bg-red-50 dark:bg-red-950/30" />
              <SummaryCard
                label="Laba"
                value={formatRupiah(data.totals.profit)}
                icon={<TrendingUp className={`w-5 h-5 ${data.totals.profit >= 0 ? "text-emerald-600" : "text-red-600"}`} />}
                color={data.totals.profit >= 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30"}
              />
              <SummaryCard label="Margin laba" value={pct(data.totals.profit, data.totals.revenue)} icon={<TrendingUp className="w-5 h-5 text-zinc-500" />} color="bg-zinc-100 dark:bg-zinc-900" />
            </div>
          </div>

          <div>
            <p className={`${sectionLabelCls} mb-2`}>Arus kas (berdasarkan uang yang benar-benar masuk dan keluar)</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              <SummaryCard label="Kas masuk" value={formatRupiah(data.totals.cash_in)} icon={<Wallet className="w-5 h-5 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-950/30" />
              <SummaryCard label="Kas keluar" value={formatRupiah(data.totals.cash_out)} icon={<ArrowUpFromLine className="w-5 h-5 text-red-600" />} color="bg-red-50 dark:bg-red-950/30" />
              <SummaryCard
                label="Arus kas bersih"
                value={formatRupiah(data.totals.cash_net)}
                icon={<Wallet className={`w-5 h-5 ${data.totals.cash_net >= 0 ? "text-emerald-600" : "text-red-600"}`} />}
                color={data.totals.cash_net >= 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30"}
              />
              <SummaryCard label="Tagihan belum terbayar" value={formatRupiah(data.totals.unpaid_billed)} icon={<Hourglass className="w-5 h-5 text-amber-600" />} color="bg-amber-50 dark:bg-amber-950/30" />
            </div>
          </div>

          {data.totals.expenses === 0 && data.totals.revenue > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 leading-relaxed">
              Belum ada pengeluaran yang <b>disetujui</b> pada periode ini, sehingga laba sama dengan pendapatan. Laba hanya
              seakurat kelengkapan pencatatan biaya (bahan, tinta, gaji, listrik, sewa, dan lainnya).
            </p>
          )}

          <div className={`${cardCls} overflow-hidden`}>
            <div className="px-4 md:px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <p className={sectionLabelCls}>Per bulan</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[640px]">
                <thead className="text-zinc-500 dark:text-zinc-400">
                  <tr className="border-b border-zinc-200 dark:border-zinc-800">
                    {["Bulan", "Pendapatan", "Biaya", "Laba", "Kas masuk", "Kas keluar", "Arus kas"].map((h, i) => (
                      <th key={h} className={`px-4 py-2.5 font-semibold ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-mono tabular-nums">
                  {data.months.map((m) => (
                    <tr key={m.month}>
                      <td className="px-4 py-2.5 font-sans font-semibold text-zinc-900 dark:text-zinc-100">{monthLabel(m.month)}</td>
                      <td className="px-4 py-2.5 text-right text-zinc-700 dark:text-zinc-300">{formatRupiah(m.revenue)}</td>
                      <td className="px-4 py-2.5 text-right text-zinc-700 dark:text-zinc-300">{formatRupiah(m.expenses)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`font-semibold ${colorPL(m.profit)}`}>{formatRupiah(m.profit)}</span>
                        <div className="mt-1 h-1 rounded-full bg-zinc-100 dark:bg-zinc-900 overflow-hidden ml-auto w-20">
                          <div className={`h-full ${m.profit >= 0 ? "bg-emerald-500" : "bg-red-500"}`} style={{ width: `${(Math.abs(m.profit) / maxAbsProfit) * 100}%` }} />
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-zinc-700 dark:text-zinc-300">{formatRupiah(m.cash_in)}</td>
                      <td className="px-4 py-2.5 text-right text-zinc-700 dark:text-zinc-300">{formatRupiah(m.cash_out)}</td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${colorPL(m.cash_net)}`}>{formatRupiah(m.cash_net)}</td>
                    </tr>
                  ))}
                  <tr className="bg-zinc-50 dark:bg-zinc-900 font-semibold">
                    <td className="px-4 py-2.5 font-sans text-zinc-900 dark:text-zinc-100">Total</td>
                    <td className="px-4 py-2.5 text-right">{formatRupiah(data.totals.revenue)}</td>
                    <td className="px-4 py-2.5 text-right">{formatRupiah(data.totals.expenses)}</td>
                    <td className={`px-4 py-2.5 text-right ${colorPL(data.totals.profit)}`}>{formatRupiah(data.totals.profit)}</td>
                    <td className="px-4 py-2.5 text-right">{formatRupiah(data.totals.cash_in)}</td>
                    <td className="px-4 py-2.5 text-right">{formatRupiah(data.totals.cash_out)}</td>
                    <td className={`px-4 py-2.5 text-right ${colorPL(data.totals.cash_net)}`}>{formatRupiah(data.totals.cash_net)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={`${cardCls} overflow-hidden`}>
              <div className="px-4 md:px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
                <p className={sectionLabelCls}>Biaya per kategori</p>
              </div>
              <div className="p-4 md:p-5 space-y-3">
                {data.by_category.length === 0 ? (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Belum ada biaya disetujui pada periode ini.</p>
                ) : (
                  data.by_category.map((c) => (
                    <div key={c.name}>
                      <div className="flex justify-between text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
                        <span className="truncate pr-2">{c.name} <span className="text-zinc-400">({pct(c.amount, data.totals.expenses)})</span></span>
                        <span className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">{formatRupiah(c.amount)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
                        <div className="h-full bg-[#124540] dark:bg-[#49bfb4]" style={{ width: `${(c.amount / maxCat) * 100}%` }} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className={`${cardCls} overflow-hidden`}>
              <div className="px-4 md:px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
                <p className={sectionLabelCls}>Cakupan pencatatan biaya</p>
              </div>
              <div className="p-4 md:p-5 space-y-3 text-xs text-zinc-600 dark:text-zinc-300">
                <div className="flex justify-between">
                  <span>Biaya dikaitkan ke order</span>
                  <span className="font-mono tabular-nums font-semibold">{formatRupiah(data.totals.expenses_linked)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Biaya umum (tanpa order)</span>
                  <span className="font-mono tabular-nums font-semibold">{formatRupiah(data.totals.expenses_unlinked)}</span>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed pt-2 border-t border-zinc-200 dark:border-zinc-800">
                  Laba per order di bawah hanya memperhitungkan biaya yang dikaitkan ke order saat dicatat. Biaya umum
                  tetap mengurangi laba total di atas, tetapi tidak dibagi ke tiap order.
                </p>
              </div>
            </div>
          </div>

          <div className={`${cardCls} overflow-hidden`}>
            <div className="px-4 md:px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3">
              <p className={sectionLabelCls}>
                Laba kotor per order <span className="normal-case tracking-normal font-normal">({data.orders_total} order{data.orders_total > data.orders.length ? `, ${data.orders.length} ditampilkan` : ""})</span>
              </p>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={`${filterInputCls} !w-auto !min-w-0`}>
                <option value="newest">Terbaru</option>
                <option value="lowest">Laba terendah</option>
                <option value="highest">Laba tertinggi</option>
              </select>
            </div>
            <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
              <table className="w-full text-xs min-w-[640px]">
                <thead className="text-zinc-500 dark:text-zinc-400 sticky top-0 bg-white dark:bg-zinc-950">
                  <tr className="border-b border-zinc-200 dark:border-zinc-800">
                    {["Order", "Tagihan", "Terbayar", "Biaya langsung", "Laba kotor"].map((h, i) => (
                      <th key={h} className={`px-4 py-2.5 font-semibold ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-mono tabular-nums">
                  {orders.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center font-sans text-zinc-500">Tidak ada order bertagihan pada periode ini.</td></tr>
                  )}
                  {orders.map((o) => (
                    <tr key={o.order_id}>
                      <td className="px-4 py-2.5 font-sans">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">{o.kode_produksi}</span>
                        <span className="block text-[10px] text-zinc-400 truncate max-w-[14rem]">{o.nama_pemesan}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-zinc-700 dark:text-zinc-300">{formatRupiah(o.total)}</td>
                      <td className="px-4 py-2.5 text-right text-zinc-700 dark:text-zinc-300">{formatRupiah(o.paid)}</td>
                      <td className="px-4 py-2.5 text-right text-zinc-700 dark:text-zinc-300">{formatRupiah(o.direct_cost)}</td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${colorPL(o.gross)}`}>{formatRupiah(o.gross)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed space-y-1">
            <p><b>Cara membaca.</b> Pendapatan = nilai tagihan order yang masuk pada periode (berdasarkan tanggal masuk order), baik sudah dibayar maupun belum. Biaya = pengeluaran berstatus Disetujui. Laba = pendapatan − biaya.</p>
            <p>Arus kas hanya menghitung uang yang sudah diverifikasi masuk (dikurangi refund) dan pengeluaran yang disetujui, sehingga bisa berbeda dari laba ketika ada tagihan yang belum dibayar.</p>
            <p>Pembayaran menunggu verifikasi, pengeluaran yang ditolak atau di-void tidak dihitung. Gaji baru ikut terhitung bila dicatat sebagai pengeluaran.</p>
          </div>
        </>
      )}
    </div>
  );
}
