"use client";

// app/components/apps/FixedSalaryView.tsx
//
// Tab "Admin & Designer" di menu Gaji.
//  - Gaji tetap per bulan per orang (berlaku terus sampai diubah; riwayat
//    disimpan di salary_fixed per tanggal berlaku).
//  - Admin: bonus closing otomatis dari order yang dipilih (Rp per closing +
//    Rp per pcs di atas batas; angkanya diatur di Pengaturan Harga, kategori
//    GENERAL).
//  - Bonus tambahan manual (mis. bonus Designer) diisi sendiri tiap bulan.
//  - Bagian produksi (PJ/Helper) TIDAK dihitung di sini — tetap di tab
//    Produksi Manual; hanya ditampilkan sebagai info.
// Tabel: lihat sql/2026_10_03_gaji_admin_designer.sql.

import React, { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
  Printer,
  Loader2,
  Trash2,
  Plus,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";
import type { UserData, Order } from "@/types";
import type { SalarySlipRow } from "./SalaryPrintSlip";
import { getUserRoles, hasRole, roleLabel } from "@/lib/roles";

export interface FixedSlip {
  userId: string;
  name: string;
  roleLabel: string;
  rows: SalarySlipRow[];
  total: number;
  paidAt?: string | null;
}

interface FixedSalaryViewProps {
  users: UserData[];
  periodOrders: Order[]; // order berstatus Selesai pada periode terpilih
  selectedMonth: number;
  selectedYear: number;
  productionTotals: Record<string, number>; // info gaji produksi manual per user
  canManage: boolean;
  canPrint: boolean;
  printing: boolean;
  onPrintSlip: (slip: FixedSlip) => void;
  showConfirm: (title: string, message: string, onConfirm: () => void) => void;
  showError: (title: string, message: string) => void;
  // Dilaporkan ke SalaryView untuk card ringkasan di bagian atas menu Gaji.
  // total = seluruh gaji tetap + bonus; belum = yang belum ditandai lunas.
  // null = data gagal dimuat.
  onSummary?: (
    s: { total: number; belum: number; people: number } | null,
  ) => void;
}

const currency = (n: number) =>
  `Rp ${Math.round(n || 0).toLocaleString("id-ID")}`;

const digitsOnly = (v: string) => Number(v.replace(/\D/g, ""));
const showNum = (n: number) => (n ? n.toLocaleString("id-ID") : "");

const PARAM_KEYS = [
  "bonus_admin_closing",
  "batas_pcs_bonus_admin",
  "bonus_admin_per_pcs",
];

export default function FixedSalaryView({
  users,
  periodOrders,
  selectedMonth,
  selectedYear,
  productionTotals,
  canManage,
  canPrint,
  printing,
  onPrintSlip,
  showConfirm,
  showError,
  onSummary,
}: FixedSalaryViewProps) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [fixedRows, setFixedRows] = useState<any[]>([]);
  const [bonusRows, setBonusRows] = useState<any[]>([]);
  const [closingRows, setClosingRows] = useState<any[]>([]);
  const [paymentRows, setPaymentRows] = useState<any[]>([]);
  const [paramRows, setParamRows] = useState<any[]>([]);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [fixedInput, setFixedInput] = useState(0);
  const [bonusLabel, setBonusLabel] = useState("");
  const [bonusAmount, setBonusAmount] = useState(0);
  const [closingOrderId, setClosingOrderId] = useState("");
  const [busy, setBusy] = useState(false);

  const mm = String(selectedMonth + 1).padStart(2, "0");
  const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const periodEnd = `${selectedYear}-${mm}-${String(lastDay).padStart(2, "0")}`;
  const periodStart = `${selectedYear}-${mm}-01`;
  const periodLabel = `${new Date(0, selectedMonth).toLocaleString("id-ID", {
    month: "long",
  })} ${selectedYear}`;

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError("");
    const [fx, bn, cl, pay, prm] = await Promise.all([
      supabase.from("salary_fixed").select("*"),
      supabase
        .from("salary_bonus_manual")
        .select("*")
        .eq("period_month", selectedMonth)
        .eq("period_year", selectedYear),
      supabase
        .from("salary_closings")
        .select("*")
        .eq("period_month", selectedMonth)
        .eq("period_year", selectedYear),
      supabase
        .from("salary_fixed_payments")
        .select("*")
        .eq("period_month", selectedMonth)
        .eq("period_year", selectedYear),
      supabase
        .from("pricing_configs")
        .select("id, key_name, value_amount, effective_date")
        .in("key_name", PARAM_KEYS),
    ]);
    const err = fx.error || bn.error || cl.error || pay.error;
    if (err) setLoadError(err.message);
    setFixedRows(fx.data || []);
    setBonusRows(bn.data || []);
    setClosingRows(cl.data || []);
    setPaymentRows(pay.data || []);
    setParamRows(prm.data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, selectedYear]);

  // ── Parameter bonus admin (histori-aware menurut tanggal order) ──
  const getParam = (key: string, dateStr: string, fallback: number) => {
    const c = paramRows.filter(
      (r) => r.key_name === key && r.effective_date <= dateStr,
    );
    if (c.length === 0) return fallback;
    c.sort((a, b) =>
      a.effective_date > b.effective_date
        ? -1
        : a.effective_date < b.effective_date
          ? 1
          : b.id - a.id,
    );
    return Number(c[0].value_amount);
  };
  const orderDate = (o: Order) =>
    (o.created_at || new Date().toISOString()).split("T")[0];

  // Bonus satu closing = bonus per closing + (pcs di atas batas × bonus per pcs).
  const closingBonus = (o: Order) => {
    const d = orderDate(o);
    const base = getParam("bonus_admin_closing", d, 10000);
    const batas = getParam("batas_pcs_bonus_admin", d, 50);
    const perPcs = getParam("bonus_admin_per_pcs", d, 500);
    return base + Math.max(0, (o.jumlah || 0) - batas) * perPcs;
  };

  // ── Gaji tetap yang berlaku pada akhir periode ──
  const fixedFor = (userId: string) => {
    const c = fixedRows.filter(
      (r) => r.user_id === userId && r.effective_date <= periodEnd,
    );
    if (c.length === 0) return 0;
    c.sort((a, b) =>
      a.effective_date > b.effective_date
        ? -1
        : a.effective_date < b.effective_date
          ? 1
          : b.id - a.id,
    );
    return Number(c[0].amount);
  };

  const people = users.filter(
    (u) => hasRole(u, "admin") || hasRole(u, "designer"),
  );

  const summary = (u: UserData) => {
    const fixed = fixedFor(u.id);
    const closings = closingRows
      .filter((r) => r.user_id === u.id)
      .map((row) => {
        const order = periodOrders.find((o) => o.id === row.order_id);
        return { row, order, bonus: order ? closingBonus(order) : 0 };
      });
    const bonuses = bonusRows.filter((r) => r.user_id === u.id);
    const closingTotal = closings.reduce((t, c) => t + c.bonus, 0);
    const manualTotal = bonuses.reduce((t, b) => t + Number(b.amount), 0);
    return {
      fixed,
      closings,
      bonuses,
      closingTotal,
      manualTotal,
      total: fixed + closingTotal + manualTotal,
    };
  };

  const selectedUser = people.find((u) => u.id === selectedUserId) || null;
  const sel = selectedUser ? summary(selectedUser) : null;

  // Laporkan total semua Admin & Designer ke induk (untuk card ringkasan).
  useEffect(() => {
    if (!onSummary || loading) return;
    if (loadError) {
      onSummary(null);
      return;
    }
    let total = 0;
    let belum = 0;
    people.forEach((u) => {
      const t = summary(u).total;
      total += t;
      if (!paymentRows.find((p) => p.user_id === u.id)) belum += t;
    });
    onSummary({ total, belum, people: people.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    loading,
    loadError,
    users,
    fixedRows,
    bonusRows,
    closingRows,
    paymentRows,
    paramRows,
    periodOrders,
    selectedMonth,
    selectedYear,
  ]);

  useEffect(() => {
    if (selectedUser) setFixedInput(fixedFor(selectedUser.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId, fixedRows, selectedMonth, selectedYear]);

  const paymentOf = (userId: string) =>
    paymentRows.find((p) => p.user_id === userId);

  // ── Aksi ──
  const fail = (title: string, message?: string) =>
    showError(title, message || "Terjadi kesalahan tak terduga.");

  const saveFixed = async () => {
    if (!selectedUser) return;
    setBusy(true);
    const existing = fixedRows.find(
      (r) => r.user_id === selectedUser.id && r.effective_date === periodStart,
    );
    const { error } = existing
      ? await supabase
          .from("salary_fixed")
          .update({ amount: fixedInput })
          .eq("id", existing.id)
      : await supabase.from("salary_fixed").insert({
          user_id: selectedUser.id,
          amount: fixedInput,
          effective_date: periodStart,
        });
    setBusy(false);
    if (error) return fail("Gagal Menyimpan Gaji Tetap", error.message);
    await loadData(true);
  };

  const addBonus = async () => {
    if (!selectedUser || !bonusLabel.trim() || bonusAmount <= 0) {
      return fail("Data Belum Lengkap", "Isi keterangan dan nominal bonus.");
    }
    setBusy(true);
    const { error } = await supabase.from("salary_bonus_manual").insert({
      user_id: selectedUser.id,
      period_month: selectedMonth,
      period_year: selectedYear,
      label: bonusLabel.trim(),
      amount: bonusAmount,
    });
    setBusy(false);
    if (error) return fail("Gagal Menambah Bonus", error.message);
    setBonusLabel("");
    setBonusAmount(0);
    await loadData(true);
  };

  const deleteBonus = (id: number) =>
    showConfirm("Hapus Bonus", "Hapus bonus ini?", async () => {
      const { error } = await supabase
        .from("salary_bonus_manual")
        .delete()
        .eq("id", id);
      if (error) return fail("Gagal Menghapus", error.message);
      await loadData(true);
    });

  const addClosing = async () => {
    if (!selectedUser || !closingOrderId) return;
    setBusy(true);
    const { error } = await supabase.from("salary_closings").insert({
      user_id: selectedUser.id,
      order_id: closingOrderId,
      period_month: selectedMonth,
      period_year: selectedYear,
    });
    setBusy(false);
    if (error) return fail("Gagal Menambah Closing", error.message);
    setClosingOrderId("");
    await loadData(true);
  };

  const deleteClosing = (id: number) =>
    showConfirm(
      "Hapus Closing",
      "Hapus closing ini dari bonus admin?",
      async () => {
        const { error } = await supabase
          .from("salary_closings")
          .delete()
          .eq("id", id);
        if (error) return fail("Gagal Menghapus", error.message);
        await loadData(true);
      },
    );

  const markPaid = (u: UserData, total: number) =>
    showConfirm(
      "Tandai Sudah Dibayar",
      `Tandai gaji ${u.name} sebesar ${currency(total)} sebagai SUDAH DIBAYAR?`,
      async () => {
        const { error } = await supabase.from("salary_fixed_payments").upsert(
          {
            user_id: u.id,
            period_month: selectedMonth,
            period_year: selectedYear,
            total_amount: total,
            paid_at: new Date().toISOString(),
          },
          { onConflict: "user_id,period_month,period_year" },
        );
        if (error) return fail("Gagal Menandai Lunas", error.message);
        await loadData(true);
      },
    );

  const unmarkPaid = (u: UserData) =>
    showConfirm(
      "Batalkan Status Lunas",
      `Batalkan status lunas gaji ${u.name}?`,
      async () => {
        const { error } = await supabase
          .from("salary_fixed_payments")
          .delete()
          .match({
            user_id: u.id,
            period_month: selectedMonth,
            period_year: selectedYear,
          });
        if (error) return fail("Gagal Membatalkan", error.message);
        await loadData(true);
      },
    );

  const handlePrint = () => {
    if (!selectedUser || !sel) return;
    const rows: SalarySlipRow[] = [
      { label: "Gaji Tetap", detail: periodLabel, amount: sel.fixed },
      ...sel.closings.map((c) => ({
        label: c.order?.kode_produksi || "Order tidak ditemukan",
        detail: "Bonus closing",
        qty: c.order?.jumlah || 0,
        amount: c.bonus,
      })),
      ...sel.bonuses.map((b) => ({
        label: b.label,
        detail: "Bonus tambahan",
        amount: Number(b.amount),
      })),
    ];
    onPrintSlip({
      userId: selectedUser.id,
      name: selectedUser.name,
      roleLabel: getUserRoles(selectedUser)
        .filter((r) => r === "admin" || r === "designer")
        .map(roleLabel)
        .join(" & "),
      rows,
      total: sel.total,
      paidAt: paymentOf(selectedUser.id)?.paid_at,
    });
  };

  // Order yang belum jadi closing siapa pun pada periode ini.
  const takenOrderIds = new Set(closingRows.map((r) => r.order_id));
  const availableOrders = periodOrders.filter((o) => !takenOrderIds.has(o.id));

  const todayStr = new Date().toISOString().split("T")[0];
  const ruleText = `Rp ${getParam("bonus_admin_closing", todayStr, 10000).toLocaleString("id-ID")} per closing + Rp ${getParam("bonus_admin_per_pcs", todayStr, 500).toLocaleString("id-ID")} per pcs di atas ${getParam("batas_pcs_bonus_admin", todayStr, 50)} pcs`;

  const inputCls =
    "w-full font-mono tabular-nums font-semibold text-zinc-900 dark:text-white bg-transparent border border-zinc-300 dark:border-zinc-700 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-[#124540] outline-none transition-colors duration-150";
  const sectionCls =
    "p-4 border-b border-zinc-200 dark:border-zinc-800 space-y-3";
  const titleCls =
    "text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400";

  if (loading)
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm">
        Memuat data gaji tetap...
      </div>
    );

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
      {loadError && (
        <div className="p-3 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-700 dark:text-amber-400">
          Gagal memuat sebagian data: {loadError}. Pastikan migration
          <span className="font-mono"> gaji_admin_designer.sql </span>sudah
          dijalankan.
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-4 overflow-hidden">
        {/* DAFTAR PERSONIL */}
        <div
          className={`w-full md:w-90 md:flex-none flex-1 min-h-0 flex flex-col bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 ${selectedUserId ? "hidden md:flex" : "flex"}`}
        >
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
            <span className="font-semibold text-zinc-700 dark:text-zinc-300 text-sm">
              Admin & Designer
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
            {people.length === 0 ? (
              <div className="text-center p-8 text-zinc-400 dark:text-zinc-600 text-xs">
                Belum ada user dengan role Admin atau Designer. Atur di
                Pengaturan → pilih user → Role.
              </div>
            ) : (
              people.map((u) => {
                const s = summary(u);
                const paid = !!paymentOf(u.id);
                return (
                  <button
                    key={u.id}
                    onClick={() => setSelectedUserId(u.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors duration-150 ${
                      selectedUserId === u.id
                        ? "border-[#124540] bg-zinc-50 dark:bg-zinc-900"
                        : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        {u.name}
                      </span>
                      {paid && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                        {getUserRoles(u)
                          .filter((r) => r === "admin" || r === "designer")
                          .map(roleLabel)
                          .join(" + ")}
                      </span>
                      <span className="font-mono tabular-nums text-xs text-zinc-600 dark:text-zinc-300">
                        {currency(s.total)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* DETAIL */}
        <div
          className={`flex-1 min-h-0 flex flex-col bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden ${selectedUserId ? "flex" : "hidden md:flex"}`}
        >
          {!selectedUser || !sel ? (
            <div className="flex-1 flex items-center justify-center text-zinc-400 dark:text-zinc-600 text-sm p-8 text-center">
              Pilih personil di sebelah kiri untuk melihat dan mengatur gajinya.
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {/* Header */}
              <div className={`${sectionCls} !space-y-1`}>
                <button
                  onClick={() => setSelectedUserId(null)}
                  className="md:hidden flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 mb-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Kembali
                </button>
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {selectedUser.name}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {getUserRoles(selectedUser).map(roleLabel).join(" + ")} ·{" "}
                  {periodLabel}
                </p>
              </div>

              {/* Total */}
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-between gap-3">
                <div className="text-xs text-zinc-500 dark:text-zinc-400 space-y-0.5">
                  <p>Gaji tetap: {currency(sel.fixed)}</p>
                  {hasRole(selectedUser, "admin") && (
                    <p>Bonus closing: {currency(sel.closingTotal)}</p>
                  )}
                  <p>Bonus tambahan: {currency(sel.manualTotal)}</p>
                </div>
                <div className="text-right">
                  <p className={titleCls}>Total Gaji</p>
                  <p className="font-mono tabular-nums text-xl font-semibold text-[#124540] dark:text-[#49BFB4]">
                    {currency(sel.total)}
                  </p>
                </div>
              </div>

              {/* Gaji tetap */}
              <div className={sectionCls}>
                <p className={titleCls}>Gaji Tetap per Bulan</p>
                {canManage ? (
                  <>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        className={inputCls}
                        value={showNum(fixedInput)}
                        onChange={(e) =>
                          setFixedInput(digitsOnly(e.target.value))
                        }
                        placeholder="0"
                      />
                      <button
                        onClick={saveFixed}
                        disabled={busy}
                        className="px-4 rounded-lg bg-[#124540] hover:bg-[#0d332f] disabled:opacity-40 text-white text-sm font-semibold transition-colors duration-150 shrink-0"
                      >
                        Simpan
                      </button>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Berlaku mulai {periodLabel} dan seterusnya sampai Anda
                      ubah lagi. Bulan sebelumnya tidak ikut berubah.
                    </p>
                  </>
                ) : (
                  <p className="font-mono tabular-nums text-sm text-zinc-900 dark:text-white">
                    {currency(sel.fixed)}
                  </p>
                )}
              </div>

              {/* Bonus closing admin */}
              {hasRole(selectedUser, "admin") && (
                <div className={sectionCls}>
                  <p className={titleCls}>Bonus Closing (Admin)</p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {ruleText}. Pilih order yang berhasil di-closing oleh{" "}
                    {selectedUser.name} pada periode ini.
                  </p>
                  {sel.closings.length === 0 ? (
                    <p className="text-xs text-zinc-400 dark:text-zinc-600">
                      Belum ada closing pada periode ini.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {sel.closings.map((c) => (
                        <div
                          key={c.row.id}
                          className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="font-mono font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                              {c.order?.kode_produksi ||
                                "Order tidak ditemukan"}
                            </p>
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                              {c.order
                                ? `${c.order.jumlah} pcs`
                                : "Belum berstatus Selesai / tidak ada di periode ini"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-white">
                              {currency(c.bonus)}
                            </span>
                            {canManage && (
                              <button
                                onClick={() => deleteClosing(c.row.id)}
                                className="text-zinc-400 hover:text-red-600 transition-colors duration-150"
                                aria-label="Hapus closing"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {canManage && (
                    <div className="flex gap-2">
                      <select
                        className={`${inputCls} font-sans`}
                        value={closingOrderId}
                        onChange={(e) => setClosingOrderId(e.target.value)}
                      >
                        <option value="">Pilih order closing…</option>
                        {availableOrders.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.kode_produksi} · {o.nama_pemesan} · {o.jumlah}{" "}
                            pcs · +{currency(closingBonus(o))}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={addClosing}
                        disabled={busy || !closingOrderId}
                        className="px-3 rounded-lg bg-[#124540] hover:bg-[#0d332f] disabled:opacity-40 text-white transition-colors duration-150 shrink-0"
                        aria-label="Tambah closing"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Bonus tambahan manual */}
              <div className={sectionCls}>
                <p className={titleCls}>Bonus Tambahan (isi manual)</p>
                {sel.bonuses.length === 0 ? (
                  <p className="text-xs text-zinc-400 dark:text-zinc-600">
                    Belum ada bonus tambahan pada periode ini.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {sel.bonuses.map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-sm"
                      >
                        <span className="text-zinc-800 dark:text-zinc-200 truncate">
                          {b.label}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-white">
                            {currency(Number(b.amount))}
                          </span>
                          {canManage && (
                            <button
                              onClick={() => deleteBonus(b.id)}
                              className="text-zinc-400 hover:text-red-600 transition-colors duration-150"
                              aria-label="Hapus bonus"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {canManage && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      className={`${inputCls} font-sans`}
                      value={bonusLabel}
                      onChange={(e) => setBonusLabel(e.target.value)}
                      placeholder={
                        hasRole(selectedUser, "designer")
                          ? "Keterangan (mis. Bonus Designer)"
                          : "Keterangan bonus"
                      }
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      className={`${inputCls} sm:max-w-40`}
                      value={showNum(bonusAmount)}
                      onChange={(e) =>
                        setBonusAmount(digitsOnly(e.target.value))
                      }
                      placeholder="Nominal"
                    />
                    <button
                      onClick={addBonus}
                      disabled={busy}
                      className="px-3 py-2.5 rounded-lg bg-[#124540] hover:bg-[#0d332f] disabled:opacity-40 text-white transition-colors duration-150 shrink-0 flex items-center justify-center"
                      aria-label="Tambah bonus"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Info produksi manual */}
              {(productionTotals[selectedUser.id] || 0) > 0 && (
                <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
                  Selain di atas, {selectedUser.name} juga mendapat{" "}
                  <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-200">
                    {currency(productionTotals[selectedUser.id])}
                  </span>{" "}
                  dari Produksi Manual (PJ/Helper). Itu dibayar dan dicetak
                  terpisah di tab Produksi Manual, tidak termasuk total di atas.
                </div>
              )}

              {/* Aksi */}
              <div className="p-4 flex flex-wrap gap-2">
                {canPrint && (
                  <button
                    onClick={handlePrint}
                    disabled={printing}
                    className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-40 transition-colors duration-150"
                  >
                    {printing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Printer className="w-4 h-4" />
                    )}
                    Cetak Slip
                  </button>
                )}
                {canManage &&
                  (paymentOf(selectedUser.id) ? (
                    <button
                      onClick={() => unmarkPaid(selectedUser)}
                      className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg border border-emerald-600 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors duration-150"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Sudah Dibayar · Batalkan
                    </button>
                  ) : (
                    <button
                      onClick={() => markPaid(selectedUser, sel.total)}
                      className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg bg-[#124540] hover:bg-[#0d332f] text-white transition-colors duration-150"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Tandai Sudah Dibayar
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
