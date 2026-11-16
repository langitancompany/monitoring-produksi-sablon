"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Download, TrendingUp, Wallet, ArrowUpFromLine, Hourglass, Boxes, Building2 } from "lucide-react";
import { useDialog } from "@/app/components/ui/DialogProvider";
import { finFetch, postJson, errMsg } from "@/hooks/useFinanceApi";
import { COST_TYPE_LABEL, type CostType, type ReportData } from "@/lib/finance/types";
import { SummaryCard } from "../SummaryCard";
import { FilterField, filterInputCls, toolbarCls, cardCls, sectionLabelCls, smallGhostBtnCls } from "../ui";
import { formatRupiah, toYmd, todayYmd } from "../utils";

const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "short", year: "numeric" });
};

const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "-");

type Sort = "newest" | "lowest" | "highest" | "nohpp";

/**
 * Laporan: laba rugi (basis TAGIHAN) dan arus kas (basis UANG) berdampingan.
 *   Pendapatan   = nilai tagihan order pada periode (tanggal masuk order)
 *   HPP          = pengeluaran Disetujui yang dikaitkan ke order atau berkategori HPP
 *   Laba Kotor   = Pendapatan − HPP
 *   Biaya Operasional = pengeluaran Disetujui lainnya (listrik, sewa, gaji tetap, dll.)
 *   Laba Bersih  = Laba Kotor − Biaya Operasional
 */
export default function ReportTab({ version }: { version: number }) {
  const { notify } = useDialog();
  const [from, setFrom] = useState(`${todayYmd().slice(0, 4)}-01-01`);
  const [to, setTo] = useState(todayYmd());
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("newest");
  const [savingCat, setSavingCat] = useState<string | null>(null);

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

  const toggleCostType = async (id: string, current: CostType) => {
    const next: CostType = current === "hpp" ? "operasional" : "hpp";
    setSavingCat(id);
    try {
      await finFetch("/api/finance/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, cost_type: next }),
      });
      await load();
    } catch (e) {
      notify(errMsg(e), { title: "Gagal mengubah tipe" });
    } finally {
      setSavingCat(null);
    }
  };

  const orders = useMemo(() => {
    const list = [...(data?.orders ?? [])];
    if (sort === "nohpp") list.sort((a, b) => Number(b.direct_cost === 0) - Number(a.direct_cost === 0) || b.total - a.total);
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
            HPP: m.hpp,
            "Laba kotor": m.gross_profit,
            "Biaya operasional": m.opex,
            "Laba bersih": m.profit,
            "Kas masuk": m.cash_in,
            "Kas keluar": m.cash_out,
            "Arus kas bersih": m.cash_net,
          })),
          {
            Bulan: "TOTAL",
            "Pendapatan (tagihan)": data.totals.revenue,
            HPP: data.totals.hpp,
            "Laba kotor": data.totals.gross_profit,
            "Biaya operasional": data.totals.opex,
            "Laba bersih": data.totals.profit,
            "Kas masuk": data.totals.cash_in,
            "Kas keluar": data.totals.cash_out,
            "Arus kas bersih": data.totals.cash_net,
          },
        ]),
        "Bulanan",
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(data.by_category.map((c) => ({ Kategori: c.name, Tipe: c.cost_type ? COST_TYPE_LABEL[c.cost_type] : "", Biaya: c.amount }))),
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
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              <SummaryCard label="Pendapatan (tagihan)" value={formatRupiah(data.totals.revenue)} icon={<TrendingUp className="w-5 h-5 text-[#124540] dark:text-[#49bfb4]" />} color="bg-[#124540]/10 dark:bg-[#49bfb4]/10" />
              <SummaryCard label="HPP" value={formatRupiah(data.totals.hpp)} icon={<Boxes className="w-5 h-5 text-red-600" />} color="bg-red-50 dark:bg-red-950/30" />
              <SummaryCard
                label={`Laba kotor · ${pct(data.totals.gross_profit, data.totals.revenue)}`}
                value={formatRupiah(data.totals.gross_profit)}
                icon={<TrendingUp className={`w-5 h-5 ${data.totals.gross_profit >= 0 ? "text-emerald-600" : "text-red-600"}`} />}
                color={data.totals.gross_profit >= 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30"}
              />
              <SummaryCard label="Biaya operasional" value={formatRupiah(data.totals.opex)} icon={<Building2 className="w-5 h-5 text-red-600" />} color="bg-red-50 dark:bg-red-950/30" />
              <SummaryCard
                label={`Laba bersih · ${pct(data.totals.profit, data.totals.revenue)}`}
                value={formatRupiah(data.totals.profit)}
                icon={<TrendingUp className={`w-5 h-5 ${data.totals.profit >= 0 ? "text-emerald-600" : "text-red-600"}`} />}
                color={data.totals.profit >= 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30"}
              />
              <SummaryCard label="Total biaya" value={formatRupiah(data.totals.expenses)} icon={<ArrowUpFromLine className="w-5 h-5 text-zinc-500" />} color="bg-zinc-100 dark:bg-zinc-900" />
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

          {data.totals.orders_without_hpp > 0 && data.orders_total > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 leading-relaxed">
              <b>{data.totals.orders_without_hpp} dari {data.orders_total} order</b> bertagihan pada periode ini belum punya HPP
              (belum ada biaya yang dikaitkan ke order tersebut), sehingga laba kotor bisa terlihat lebih tinggi dari sebenarnya.
              Urutkan tabel &ldquo;Laba kotor per order&rdquo; dengan <b>HPP belum diisi</b> untuk melihat daftarnya.
            </p>
          )}

          {!data.cost_type_supported && (
            <p className="text-xs text-zinc-600 dark:text-zinc-300 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 py-3 leading-relaxed">
              Tipe kategori biaya (HPP / Operasional) belum aktif. Saat ini HPP hanya dihitung dari biaya yang dikaitkan ke order.
              Jalankan <span className="font-mono">migration 019</span> untuk mengaktifkannya.
            </p>
          )}

          <div className={`${cardCls} overflow-hidden`}>
            <div className="px-4 md:px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <p className={sectionLabelCls}>Per bulan</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[980px]">
                <thead className="text-zinc-500 dark:text-zinc-400">
                  <tr className="border-b border-zinc-200 dark:border-zinc-800">
                    {["Bulan", "Pendapatan", "HPP", "Laba kotor", "Biaya ops.", "Laba bersih", "Kas masuk", "Kas keluar", "Arus kas"].map((h, i) => (
                      <th key={h} className={`px-4 py-2.5 font-semibold ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-mono tabular-nums">
                  {data.months.map((m) => (
                    <tr key={m.month}>
                      <td className="px-4 py-2.5 font-sans font-semibold text-zinc-900 dark:text-zinc-100">{monthLabel(m.month)}</td>
                      <td className="px-4 py-2.5 text-right text-zinc-700 dark:text-zinc-300">{formatRupiah(m.revenue)}</td>
                      <td className="px-4 py-2.5 text-right text-zinc-700 dark:text-zinc-300">{formatRupiah(m.hpp)}</td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${colorPL(m.gross_profit)}`}>{formatRupiah(m.gross_profit)}</td>
                      <td className="px-4 py-2.5 text-right text-zinc-700 dark:text-zinc-300">{formatRupiah(m.opex)}</td>
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
                    <td className="px-4 py-2.5 text-right">{formatRupiah(data.totals.hpp)}</td>
                    <td className={`px-4 py-2.5 text-right ${colorPL(data.totals.gross_profit)}`}>{formatRupiah(data.totals.gross_profit)}</td>
                    <td className="px-4 py-2.5 text-right">{formatRupiah(data.totals.opex)}</td>
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
                    <div key={c.id ?? c.name}>
                      <div className="flex justify-between items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
                        <span className="truncate pr-2 flex items-center gap-1.5 min-w-0">
                          <span className="truncate">{c.name}</span>
                          <span className="text-zinc-400 shrink-0">({pct(c.amount, data.totals.expenses)})</span>
                          {c.cost_type && c.id && (
                            <button
                              type="button"
                              onClick={() => toggleCostType(c.id as string, c.cost_type as CostType)}
                              disabled={savingCat === c.id}
                              title="Klik untuk mengubah tipe kategori ini"
                              className={`shrink-0 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded transition-colors duration-150 disabled:opacity-50 ${
                                c.cost_type === "hpp"
                                  ? "bg-[#124540]/10 text-[#124540] dark:bg-[#49bfb4]/15 dark:text-[#49bfb4]"
                                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                              }`}
                            >
                              {COST_TYPE_LABEL[c.cost_type]}
                            </button>
                          )}
                        </span>
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
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Biaya dihitung <b>HPP</b> bila dikaitkan ke order atau kategorinya bertipe HPP. Klik penanda tipe di
                  &ldquo;Biaya per kategori&rdquo; untuk mengubahnya.
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
                <option value="nohpp">HPP belum diisi</option>
              </select>
            </div>
            <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
              <table className="w-full text-xs min-w-[640px]">
                <thead className="text-zinc-500 dark:text-zinc-400 sticky top-0 bg-white dark:bg-zinc-950">
                  <tr className="border-b border-zinc-200 dark:border-zinc-800">
                    {["Order", "Tagihan", "Terbayar", "HPP (biaya langsung)", "Laba kotor"].map((h, i) => (
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
                      <td className="px-4 py-2.5 text-right text-zinc-700 dark:text-zinc-300">
                        {o.direct_cost === 0 ? (
                          <span className="font-sans text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400">
                            Belum diisi
                          </span>
                        ) : (
                          formatRupiah(o.direct_cost)
                        )}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${colorPL(o.gross)}`}>{formatRupiah(o.gross)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed space-y-1">
            <p><b>Cara membaca.</b> Pendapatan = nilai tagihan order yang masuk pada periode (berdasarkan tanggal masuk order), baik sudah dibayar maupun belum. HPP = pengeluaran Disetujui yang dikaitkan ke order atau berkategori HPP. Laba kotor = pendapatan − HPP. Biaya operasional = pengeluaran Disetujui lainnya. Laba bersih = laba kotor − biaya operasional.</p>
            <p>Arus kas hanya menghitung uang yang sudah diverifikasi masuk (dikurangi refund) dan pengeluaran yang disetujui, sehingga bisa berbeda dari laba ketika ada tagihan yang belum dibayar.</p>
            <p>Pembayaran menunggu verifikasi, pengeluaran yang ditolak atau di-void tidak dihitung. Gaji baru ikut terhitung bila dicatat sebagai pengeluaran.</p>
          </div>
        </>
      )}
    </div>
  );
}
