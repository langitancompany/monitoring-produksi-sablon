// app/components/apps/SalaryView.tsx
//
// Dua model gaji berbeda:
//   1) Produksi Manual (assigned_to/helper_id, per-order). Ada DUA sistem
//      upah gesut. Sistem mana yang tersedia diatur di Pengaturan → "Sistem
//      Gaji Gesut" (lib/gesutSystem.ts): kalau keduanya aktif muncul toggle
//      "Sistem Gesut" di halaman ini, kalau satu saja aktif langsung dipakai.
//        - LAMA : komposisi gesut kecil/sedang/besar × rate gesut_manual_*
//        - BARU : upah global per profesi (gaji_pj_gesut / gaji_helper_gesut)
//                 + bonus kompleksitas untuk warna di atas batas_warna_normal
//      Mode "Otomatis": order yang step produksinya selesai pada tanggal
//      >= GESUT_BARU_MULAI pakai BARU, sebelumnya pakai LAMA.
//   2) Tim QC/Finishing/Packing (role 'qc', tim tetap — bukan per-order.
//      Basis: total qty SEMUA order tuntas QC (Manual+DTF) × rate pricing_configs
//      kategori DTF, dibagi rata ke semua user role 'qc')
//
// Rate DTF pakai key_name 'dtf_finishing' & 'dtf_packing', dipilih
// berdasarkan effective_date <= tanggal order (histori-aware).
//
// Fitur cetak & status lunas: tabel `salary_payments` (lihat migration
// sql/2026_09_16_salary_payments.sql — sesuaikan FK ke tabel user Anda).
// Cetak pakai iframe tersembunyi, pola sama dengan handlePrintMassal di
// POPackingList.tsx. Komponen visual slip di SalaryPrintSlip.tsx.

import React, { useState, useEffect, useMemo } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createBrowserClient } from "@supabase/ssr";
import { UserData, Order, PricingConfig, GesutEntry } from "@/types";
import FixedSalaryView, { FixedSlip } from "./FixedSalaryView";
import { hasRole } from "@/lib/roles";
import {
  ChevronRight,
  Calculator,
  Printer,
  Users,
  CheckSquare,
  Square,
  CheckCircle2,
  Loader2,
  Undo2,
  Pencil,
} from "lucide-react";
import SalaryPrintSlip, { SalarySlipRow } from "./SalaryPrintSlip";
import CustomAlert, { AlertState } from "../ui/CustomAlert";
import {
  KEY_GESUT_LAMA_AKTIF,
  KEY_GESUT_BARU_AKTIF,
  resolveGesutFlag,
} from "@/lib/gesutSystem";

// Satu baris status pembayaran dari tabel salary_payments.
interface SalaryPayment {
  user_id: string;
  period_month: number;
  period_year: number;
  kategori: "manual" | "qc";
  total_amount: number;
  paid_at: string;
}

interface SalaryViewProps {
  users: UserData[];
  orders: Order[];
  // ── TAMBAHAN ── dibutuhkan utk cek hak akses (canEditOrder/canPrint),
  // pola sama seperti OrderDetail.tsx/OrderDetailHeader.tsx.
  currentUser: UserData;
  // Dipanggil saat tombol Edit diklik. Cara membuka form edit (routing/
  // tab/modal) diserahkan ke komponen induk. Kalau tidak diisi, hanya
  // warning di console.
  onEditOrder?: (order: Order) => void;
}

// Sama seperti pengecekan di OrderDetail.tsx / CreateOrder.tsx / EditOrder.tsx
// — disatukan di sini supaya konsisten.
// Tanggal mulai berlakunya sistem gesut BARU pada mode "Otomatis" (berdasarkan
// tanggal step produksi selesai, sama seperti penentuan bulan gaji).
// Ubah nilai ini kalau tanggal mulai berlakunya bergeser.
const GESUT_BARU_MULAI = "2026-09-01";

type SistemGesut = "otomatis" | "lama" | "baru";

const isManualJenis = (jenisProduksi?: string) =>
  ["manual", "sablon"].includes((jenisProduksi || "").toLowerCase());

// ── ATURAN HAK GAJI (berbasis STEP, bukan status "Selesai") ──────────────
// Status "Selesai" baru muncul setelah barang diterima pemesan
// (shipping.bukti_terima). Kalau pesanan telat diambil hingga ganti bulan,
// gaji tim jadi ikut bulan berikutnya. Karena itu hak gaji dihitung dari
// step yang sudah dilewati (logika sama dengan checkAutoStatus/getStage):
//   - Produksi (PJ/Helper) : semua step produksi order sudah selesai.
//   - Tim QC & Finishing   : produksi tuntas + QC lulus + packing selesai.
// BULAN GAJI mengikuti TANGGAL step terakhir diselesaikan (bukan tanggal
// order dibuat). Tanggal dibaca dari field ISO `completedAt`; data lama yang
// belum punya field itu dibaca dari teks `timestamp` (format id-ID/en-US),
// dan kalau gagal dibaca jatuh ke tanggal order dibuat.
// Order berstatus "Selesai" tetap dihitung (data lama tidak ada yang hilang).
const isProduksiTuntas = (o: Order): boolean => {
  const steps = isManualJenis(o.jenis_produksi) ? o.steps_manual : o.steps_dtf;
  return (
    Array.isArray(steps) &&
    steps.length > 0 &&
    steps.every((s) => s.isCompleted)
  );
};

const isQcTuntas = (o: Order): boolean =>
  isProduksiTuntas(o) &&
  !!o.finishing_qc?.isPassed &&
  !!o.finishing_packing?.isPacked;

// Baca teks toLocaleString() lama. Format bergantung pada browser/HP yang
// dipakai saat step diselesaikan, jadi aturannya dibuat konservatif:
//   - ada AM/PM            → en-US  : bulan/tanggal  ("10/4/2026, 3:31:00 PM")
//   - tanpa AM/PM (24 jam) → id-ID / en-GB : tanggal/bulan
//                            ("4/10/2026, 15.31.00" atau "04/10/2026, 15:31:00")
// Hari/bulan di luar rentang valid → null (tidak ditebak).
const parseLegacyTimestamp = (ts?: string | null): Date | null => {
  if (!ts) return null;
  const m = ts
    .trim()
    .match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})[,\s]+(\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?\s*(AM|PM)?$/i,
    );
  if (!m) return null;
  const isEnUS = !!m[7];
  const day = Number(isEnUS ? m[2] : m[1]);
  const month = Number(isEnUS ? m[1] : m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let hour = Number(m[4]);
  if (m[7]) {
    const pm = m[7].toUpperCase() === "PM";
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  }
  const d = new Date(
    Number(m[3]),
    month - 1,
    day,
    hour,
    Number(m[5]),
    Number(m[6] || 0),
  );
  return isNaN(d.getTime()) ? null : d;
};

// `fallback` = tanggal order dibuat. Tanggal hasil baca teks lama dianggap
// TIDAK masuk akal (→ pakai fallback) kalau lebih awal dari tanggal order
// dibuat atau di masa depan, karena step tidak mungkin selesai sebelum order ada.
const waktuSelesai = (
  iso: string | null | undefined,
  legacy: string | null | undefined,
  fallback: Date,
): Date => {
  if (iso) {
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return d;
  }
  const d = parseLegacyTimestamp(legacy);
  if (!d) return fallback;
  const DAY = 86_400_000;
  if (d.getTime() < fallback.getTime() - DAY) return fallback;
  if (d.getTime() > Date.now() + DAY) return fallback;
  return d;
};

const tglOrder = (o: Order): Date => {
  const d = new Date(o.created_at || Date.now());
  return isNaN(d.getTime()) ? new Date() : d;
};

const maxDate = (dates: Date[], fallback: Date): Date =>
  dates.length
    ? new Date(Math.max(...dates.map((d) => d.getTime())))
    : fallback;

// Kapan step produksi terakhir diselesaikan.
const tglProduksiTuntas = (o: Order): Date => {
  const fb = tglOrder(o);
  const steps =
    (isManualJenis(o.jenis_produksi) ? o.steps_manual : o.steps_dtf) || [];
  return maxDate(
    steps
      .filter((s) => s.isCompleted)
      .map((s) => waktuSelesai(s.completedAt, s.timestamp, fb)),
    fb,
  );
};

// "YYYY-MM-DD" menurut waktu lokal, untuk dibandingkan dengan effective_date
// dan GESUT_BARU_MULAI.
const tglKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Kapan step terakhir pekerjaan tim QC (produksi → QC lulus → packing) selesai.
const tglQcTuntas = (o: Order): Date => {
  const fb = tglOrder(o);
  return maxDate(
    [
      tglProduksiTuntas(o),
      waktuSelesai(o.finishing_qc?.completedAt, o.finishing_qc?.timestamp, fb),
      waktuSelesai(
        o.finishing_packing?.completedAt,
        o.finishing_packing?.timestamp,
        fb,
      ),
    ],
    fb,
  );
};

const layakGajiProduksi = (o: Order): boolean =>
  isManualJenis(o.jenis_produksi) &&
  (o.status === "Selesai" || isProduksiTuntas(o));

const layakGajiQc = (o: Order): boolean =>
  o.status === "Selesai" || isQcTuntas(o);

// Kartu ringkasan di bagian atas menu Gaji.
const StatCard = ({
  label,
  value,
  sub,
  accent,
  className = "",
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  className?: string;
}) => (
  <div
    className={`bg-white dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 min-w-0 ${className}`}
  >
    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-1">
      {label}
    </div>
    <div
      className={`font-mono tabular-nums text-lg md:text-xl font-semibold truncate ${
        accent
          ? "text-[#124540] dark:text-[#49BFB4]"
          : "text-zinc-900 dark:text-zinc-100"
      }`}
    >
      {value}
    </div>
    {sub ? (
      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
        {sub}
      </div>
    ) : null}
  </div>
);

// Penanda cara kerja di satu order: dikerjakan PJ + Helper ("Berdua") atau PJ
// saja ("Sendiri"), supaya admin tahu dari mana angka gajinya berasal selain
// dari nominalnya. Dipakai untuk kedua sistem gesut.
const TimTag = ({ hasHelper }: { hasHelper: boolean }) => (
  <span
    className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-semibold tracking-wide ${
      hasHelper
        ? "border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400"
        : "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"
    }`}
    title={
      hasHelper
        ? "Dikerjakan PJ dan Helper"
        : "Dikerjakan PJ sendiri (tanpa Helper)"
    }
  >
    {hasHelper ? "Berdua" : "Sendiri"}
  </span>
);

export default function SalaryView({
  users,
  orders,
  currentUser,
  onEditOrder,
}: SalaryViewProps) {
  // ── TAMBAHAN ── Hak akses. Pola sama persis dgn OrderDetail.tsx:
  // supervisor selalu boleh, selain itu ikuti tabel permission di
  // Pengaturan → modul "Gaji & Upah". Kolom Buat dipakai utk "Cetak"
  // (bukan bikin data baru) — sama seperti kolom Buat di modul Produksi
  // dipakai utk "Upload approval" & di Finishing utk "Reset QC".
  const isSupervisor = currentUser.role === "supervisor";
  const perms = currentUser.permissions;
  const canEditOrder = isSupervisor || !!perms?.salary?.edit;
  const canPrint = isSupervisor || !!perms?.salary?.create;

  const handleEditOrder = (order: Order) => {
    if (onEditOrder) {
      onEditOrder(order);
    } else {
      console.warn("SalaryView: prop 'onEditOrder' belum disambungkan.");
    }
  };

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [activeTab, setActiveTab] = useState<"manual" | "dtf" | "tetap">(
    "manual",
  );

  // State untuk filter bulan/tahun
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Total Admin & Designer, dilaporkan FixedSalaryView (yang memuat datanya
  // sendiri). null = belum selesai dimuat / gagal dimuat.
  const [fixedSummary, setFixedSummary] = useState<{
    total: number;
    belum: number;
    people: number;
  } | null>(null);
  useEffect(() => {
    setFixedSummary(null);
  }, [selectedMonth, selectedYear]);

  // Pilihan sistem upah gesut untuk tab Produksi Manual (tidak disimpan ke DB).
  const [sistemGesut, setSistemGesut] = useState<SistemGesut>("otomatis");

  // Centang user untuk dicetak massal (tab Produksi Manual).
  const [printSelectedIds, setPrintSelectedIds] = useState<Set<string>>(
    new Set(),
  );
  const [printing, setPrinting] = useState(false);

  const togglePrintSelect = (userId: string) => {
    setPrintSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  // Histori rate pricing_configs, supaya bisa pilih rate yang berlaku
  // pada tanggal order (bukan rate hari ini).
  const [pricingConfigs, setPricingConfigs] = useState<PricingConfig[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(true);

  useEffect(() => {
    const fetchConfigs = async () => {
      const { data } = await supabase
        .from("pricing_configs")
        .select("*")
        .in("category", ["MANUAL", "DTF"]);
      if (data) setPricingConfigs(data as PricingConfig[]);
      setLoadingConfigs(false);
    };
    fetchConfigs();
  }, []);

  // Status "sudah dibayar" per user per periode (di-refetch tiap ganti bulan/tahun).
  const [payments, setPayments] = useState<Record<string, SalaryPayment>>({});
  const [loadingPayments, setLoadingPayments] = useState(true);
  const paymentKey = (userId: string, kategori: "manual" | "qc") =>
    `${userId}_${kategori}`;

  useEffect(() => {
    const fetchPayments = async () => {
      setLoadingPayments(true);
      const { data } = await supabase
        .from("salary_payments")
        .select("*")
        .eq("period_month", selectedMonth)
        .eq("period_year", selectedYear);
      const map: Record<string, SalaryPayment> = {};
      (data as SalaryPayment[] | null)?.forEach((p) => {
        map[paymentKey(p.user_id, p.kategori)] = p;
      });
      setPayments(map);
      setLoadingPayments(false);
    };
    fetchPayments();
  }, [selectedMonth, selectedYear]);

  const isPaid = (userId: string, kategori: "manual" | "qc") =>
    !!payments[paymentKey(userId, kategori)];

  // Set/lepas checklist "sudah dibayar". Upsert supaya aman diklik ulang.
  const [markingPaidKey, setMarkingPaidKey] = useState<string | null>(null);

  // Modal alert/konfirmasi custom (gantiin window.confirm/alert bawaan browser).
  const [alertState, setAlertState] = useState<AlertState>({
    isOpen: false,
    title: "",
    message: "",
    type: "success",
  });
  const closeAlert = () =>
    setAlertState((prev) => ({ ...prev, isOpen: false }));
  const showConfirm = (title: string, message: string, onConfirm: () => void) =>
    setAlertState({ isOpen: true, title, message, type: "confirm", onConfirm });
  const showError = (title: string, message: string) =>
    setAlertState({ isOpen: true, title, message, type: "error" });

  const doMarkPaid = async (
    userId: string,
    kategori: "manual" | "qc",
    amount: number,
  ) => {
    const key = paymentKey(userId, kategori);
    setMarkingPaidKey(key);
    const { data, error } = await supabase
      .from("salary_payments")
      .upsert(
        {
          user_id: userId,
          period_month: selectedMonth,
          period_year: selectedYear,
          kategori,
          total_amount: amount,
          paid_at: new Date().toISOString(),
        },
        { onConflict: "user_id,period_month,period_year,kategori" },
      )
      .select()
      .single();
    setMarkingPaidKey(null);
    if (error || !data) {
      showError(
        "Gagal Menandai Lunas",
        error?.message || "Terjadi kesalahan tak terduga.",
      );
      return;
    }
    setPayments((prev) => ({ ...prev, [key]: data as SalaryPayment }));
  };

  const markPaid = (
    userId: string,
    kategori: "manual" | "qc",
    amount: number,
  ) => {
    showConfirm(
      "Tandai Sudah Dibayar",
      `Tandai gaji sebesar ${currency(amount)} sebagai SUDAH DIBAYAR?`,
      () => doMarkPaid(userId, kategori, amount),
    );
  };

  const doUnmarkPaid = async (userId: string, kategori: "manual" | "qc") => {
    const key = paymentKey(userId, kategori);
    setMarkingPaidKey(key);
    const { error } = await supabase.from("salary_payments").delete().match({
      user_id: userId,
      period_month: selectedMonth,
      period_year: selectedYear,
      kategori,
    });
    setMarkingPaidKey(null);
    if (error) {
      showError("Gagal Membatalkan", error.message);
      return;
    }
    setPayments((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const unmarkPaid = (userId: string, kategori: "manual" | "qc") => {
    showConfirm(
      "Batalkan Status Lunas",
      "Batalkan status lunas? Gunakan ini kalau ternyata gaji belum benar-benar diberikan.",
      () => doUnmarkPaid(userId, kategori),
    );
  };

  // Cari rate suatu key_name yang berlaku pada tanggal tertentu (histori-aware).
  const getRateAt = (keyName: string, dateStr: string): number => {
    const candidates = pricingConfigs.filter(
      (c) => c.key_name === keyName && c.effective_date <= dateStr,
    );
    if (candidates.length === 0) return 0;
    // Tanggal sama (mis. harga diubah dua kali di hari yang sama) → baris
    // dengan id terbesar (paling baru dibuat) yang menang.
    candidates.sort((a, b) =>
      a.effective_date > b.effective_date
        ? -1
        : a.effective_date < b.effective_date
          ? 1
          : b.id - a.id,
    );
    return candidates[0].value_amount;
  };

  const dateOf = (order: Order) =>
    (order.created_at || new Date().toISOString()).split("T")[0];

  // Total nilai gesut satu order Manual, dihitung dengan rate yang berlaku
  // pada tanggal order tersebut dibuat.
  const gesutEarnings = (order: Order): number => {
    const g = order.detail_gesut as GesutEntry | null | undefined;
    if (!g) return 0;
    const d = dateOf(order);
    const rateKecil = getRateAt("gesut_manual_kecil", d);
    const rateSedang = getRateAt("gesut_manual_sedang", d);
    const rateBesar = getRateAt("gesut_manual_besar", d);
    return g.kecil * rateKecil + g.sedang * rateSedang + g.besar * rateBesar;
  };

  // Sistem yang diaktifkan di Pengaturan. Kalau hanya satu yang aktif, pilihan
  // di halaman ini diabaikan dan sistem itu langsung dipakai. Kalau (keliru)
  // keduanya nonaktif, jatuh ke sistem lama.
  const lamaAktif = resolveGesutFlag(pricingConfigs, KEY_GESUT_LAMA_AKTIF);
  const baruAktif = resolveGesutFlag(pricingConfigs, KEY_GESUT_BARU_AKTIF);
  const bisaPilihSistem = lamaAktif && baruAktif;
  const pilihanEfektif: SistemGesut = !baruAktif
    ? "lama"
    : !lamaAktif
      ? "baru"
      : sistemGesut;

  // Sistem upah yang berlaku untuk satu order.
  const sistemUntuk = (order: Order): "lama" | "baru" => {
    if (pilihanEfektif === "lama") return "lama";
    if (pilihanEfektif === "baru") return "baru";
    // Mengikuti tanggal step produksi selesai (sama dengan penentuan bulan
    // gaji), bukan tanggal order dibuat.
    return tglKey(tglProduksiTuntas(order)) >= GESUT_BARU_MULAI
      ? "baru"
      : "lama";
  };

  // SISTEM BARU — upah per pcs untuk PJ & Helper (rate histori-aware).
  // Total warna = kecil + sedang + besar dari detail_gesut order.
  // Bonus warna ekstra dibagi PJ:Helper sebanding upah dasarnya. Tanpa
  // Helper, PJ menerima SELURUH nominal: upah PJ + upah Helper + bonus.
  // Tarif dipilih menurut tanggal step produksi selesai (konsisten dengan
  // bulan gaji dan penentuan sistem), bukan tanggal order dibuat.
  const gesutBaruPerPcs = (
    order: Order,
    hasHelper: boolean,
  ): { pj: number; helper: number } => {
    const d = tglKey(tglProduksiTuntas(order));
    const basePj = Number(getRateAt("gaji_pj_gesut", d));
    const baseHelper = Number(getRateAt("gaji_helper_gesut", d));
    const batas = Number(getRateAt("batas_warna_normal", d));
    const bonusPerWarna = Number(getRateAt("bonus_ekstra_warna", d));

    const g = order.detail_gesut as GesutEntry | null | undefined;
    const totalWarna = g ? g.kecil + g.sedang + g.besar : 0;
    const bonus = Math.max(0, totalWarna - batas) * bonusPerWarna;

    if (!hasHelper) return { pj: basePj + baseHelper + bonus, helper: 0 };
    const baseTotal = basePj + baseHelper;
    const sharePj = baseTotal > 0 ? basePj / baseTotal : 0.5;
    return {
      pj: basePj + bonus * sharePj,
      helper: baseHelper + bonus * (1 - sharePj),
    };
  };

  const inPeriod = (d: Date) =>
    d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;

  // Dipakai tab Admin & Designer (bonus per order) — tidak berubah: status
  // "Selesai" + bulan order dibuat. Aturan step hanya untuk Produksi & QC.
  const filteredOrders = useMemo(
    () => orders.filter((o) => o.status === "Selesai" && inPeriod(tglOrder(o))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, selectedMonth, selectedYear],
  );

  // Produksi Manual: gaji PJ/Helper masuk di BULAN step produksi terakhir
  // diselesaikan.
  const manualOrders = useMemo(
    () =>
      orders.filter(
        (o) => layakGajiProduksi(o) && inPeriod(tglProduksiTuntas(o)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, selectedMonth, selectedYear],
  );
  // Basis pool gaji tim QC = SEMUA order (Manual + DTF) yang step QC &
  // packing-nya terpenuhi, di BULAN step terakhir itu selesai.
  const finishingOrders = useMemo(
    () => orders.filter((o) => layakGajiQc(o) && inPeriod(tglQcTuntas(o))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, selectedMonth, selectedYear],
  );

  // ═══════════════════════════════════════════════════════════════════════
  // MODEL 1 — PRODUKSI MANUAL (per user, assigned_to + helper_id)
  // ═══════════════════════════════════════════════════════════════════════
  const userProductionStats = useMemo(() => {
    const stats: Record<
      string,
      {
        totalOrders: number;
        totalQty: number;
        totalEarnings: number;
        orders: {
          data: Order;
          role: "PJ" | "Helper";
          ratePerPcs: number;
          earnings: number;
          sistem: "lama" | "baru";
        }[];
      }
    > = {};

    // Kalau ada Helper: 70% (PJ) / 30% (Helper). Tanpa Helper: PJ 100%.
    const PJ_SHARE_WITH_HELPER = 0.7;
    const HELPER_SHARE = 0.3;

    manualOrders.forEach((order) => {
      const hasHelper = !!order.helper_id;
      const qty = order.jumlah || 0;
      const sistem = sistemUntuk(order);

      let pjRatePerPcs: number;
      let helperRatePerPcs: number;
      if (sistem === "baru") {
        const r = gesutBaruPerPcs(order, hasHelper);
        pjRatePerPcs = r.pj;
        helperRatePerPcs = r.helper;
      } else {
        // Sistem lama: gesutEarnings() = rate per pcs, dibagi 70/30 bila ada Helper.
        const ratePerPcs = gesutEarnings(order);
        pjRatePerPcs = hasHelper
          ? ratePerPcs * PJ_SHARE_WITH_HELPER
          : ratePerPcs;
        helperRatePerPcs = hasHelper ? ratePerPcs * HELPER_SHARE : 0;
      }

      const pjEarnings = pjRatePerPcs * qty;
      const helperEarnings = helperRatePerPcs * qty;

      if (order.assigned_to) {
        if (!stats[order.assigned_to]) {
          stats[order.assigned_to] = {
            totalOrders: 0,
            totalQty: 0,
            totalEarnings: 0,
            orders: [],
          };
        }
        stats[order.assigned_to].totalOrders += 1;
        stats[order.assigned_to].totalQty += order.jumlah || 0;
        stats[order.assigned_to].totalEarnings += pjEarnings;
        stats[order.assigned_to].orders.push({
          data: order,
          role: "PJ",
          ratePerPcs: pjRatePerPcs,
          earnings: pjEarnings,
          sistem,
        });
      }

      if (order.helper_id) {
        if (!stats[order.helper_id]) {
          stats[order.helper_id] = {
            totalOrders: 0,
            totalQty: 0,
            totalEarnings: 0,
            orders: [],
          };
        }
        stats[order.helper_id].totalOrders += 1;
        stats[order.helper_id].totalQty += order.jumlah || 0;
        stats[order.helper_id].totalEarnings += helperEarnings;
        stats[order.helper_id].orders.push({
          data: order,
          role: "Helper",
          ratePerPcs: helperRatePerPcs,
          earnings: helperEarnings,
          sistem,
        });
      }
    });

    return stats;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualOrders, pricingConfigs, pilihanEfektif]);

  const activeUserStats = selectedUserId
    ? userProductionStats[selectedUserId]
    : null;
  const activeUserDetail = users.find((u) => u.id === selectedUserId);

  // ═══════════════════════════════════════════════════════════════════════
  // MODEL 2 — TIM FINISHING / DTF (agregat, dibagi rata)
  // ═══════════════════════════════════════════════════════════════════════
  // Anggota tim = user role 'qc', tim tetap (tidak pakai assigned_to/helper_id).
  const dtfTeam = useMemo(() => users.filter((u) => hasRole(u, "qc")), [users]);

  const dtfSummary = useMemo(() => {
    let totalQty = 0;
    let totalEarnings = 0;

    finishingOrders.forEach((order) => {
      const d = dateOf(order);
      const rateFinishing = getRateAt("dtf_finishing", d);
      const ratePacking = getRateAt("dtf_packing", d);
      totalQty += order.jumlah || 0;
      totalEarnings += (order.jumlah || 0) * (rateFinishing + ratePacking);
    });

    const perMember = dtfTeam.length > 0 ? totalEarnings / dtfTeam.length : 0;

    return {
      totalOrders: finishingOrders.length,
      totalQty,
      totalEarnings,
      perMember,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishingOrders, dtfTeam, pricingConfigs]);

  // ═══════════════════════════════════════════════════════════════════════
  // RINGKASAN PENGELUARAN GAJI (card di atas) — semua kategori, periode ini
  // ═══════════════════════════════════════════════════════════════════════
  const ringkasan = useMemo(() => {
    const manualEntries = Object.entries(userProductionStats);
    const manualTotal = manualEntries.reduce(
      (t, [, st]) => t + st.totalEarnings,
      0,
    );
    const manualBelum = manualEntries.reduce(
      (t, [id, st]) => t + (isPaid(id, "manual") ? 0 : st.totalEarnings),
      0,
    );
    const manualQty = manualEntries.reduce((t, [, st]) => t + st.totalQty, 0);

    // Pool QC hanya benar-benar keluar kalau ada anggota tim yang menerima.
    const qcTotal = dtfTeam.length > 0 ? dtfSummary.totalEarnings : 0;
    const qcBelum = dtfTeam.reduce(
      (t, u) => t + (isPaid(u.id, "qc") ? 0 : dtfSummary.perMember),
      0,
    );

    const tetapTotal = fixedSummary?.total ?? 0;
    const tetapBelum = fixedSummary?.belum ?? 0;

    const total = manualTotal + qcTotal + tetapTotal;
    const belum = manualBelum + qcBelum + tetapBelum;
    const sudah = Math.max(0, total - belum);
    return {
      manualTotal,
      manualOrang: manualEntries.length,
      manualQty,
      qcTotal,
      tetapTotal,
      total,
      belum,
      sudah,
      persen: total > 0 ? Math.round((sudah / total) * 100) : 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProductionStats, dtfTeam, dtfSummary, payments, fixedSummary]);

  const jumlahOrderBaru = manualOrders.filter(
    (o) => sistemUntuk(o) === "baru",
  ).length;
  const jumlahOrderLama = manualOrders.length - jumlahOrderBaru;
  const configGesutBaruAda = pricingConfigs.some(
    (c) => c.key_name === "gaji_pj_gesut",
  );

  const currency = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

  const periodLabel = `${new Date(0, selectedMonth).toLocaleString("id-ID", {
    month: "long",
  })} ${selectedYear}`;

  // Cetak satu atau banyak slip sekaligus lewat iframe tersembunyi (pola
  // sama dengan handlePrintMassal di POPackingList.tsx).
  interface SlipToPrint {
    userId: string;
    name: string;
    kategori: "manual" | "qc" | "tetap";
    rows: SalarySlipRow[];
    total: number;
    roleLabel?: string; // hanya kategori "tetap"
    paidAt?: string | null; // hanya kategori "tetap"
  }

  const printSlips = (slips: SlipToPrint[]) => {
    if (slips.length === 0) {
      showError(
        "Belum Ada yang Dipilih",
        "Pilih minimal satu personil untuk dicetak.",
      );
      return;
    }
    setPrinting(true);

    // Nama file PDF default (dialog cetak → "Simpan sebagai PDF" memakai judul
    // dokumen): SLIP-GAJI-BULAN-<BULAN>-<NAMA>. Cetak banyak slip sekaligus
    // jadi satu file, namanya memakai jumlah orang.
    const slugify = (text: string) =>
      text
        .toUpperCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-+|-+$/g, "");
    const bulanAktif = slugify(
      new Date(0, selectedMonth).toLocaleString("id-ID", { month: "long" }),
    );
    const namaBagian =
      slips.length === 1 ? slugify(slips[0].name) : `${slips.length}-ORANG`;
    const fileTitle = `SLIP-GAJI-BULAN-${bulanAktif}-${namaBagian}`;

    // Logo: URL absolut supaya terbaca di dalam iframe cetak.
    const logoUrl = `${window.location.origin}/logo.png`;

    const pagesHtml = slips
      .map((slip) =>
        renderToStaticMarkup(
          <div className="salary-print-page">
            <SalaryPrintSlip
              companyName="Langitan.co"
              companyAddress="Mandungan, Widang, Tuban, Jawa Timur"
              logoUrl={logoUrl}
              recipientName={slip.name}
              recipientRoleLabel={
                slip.kategori === "qc"
                  ? "Tim QC & Finishing"
                  : slip.kategori === "tetap"
                    ? slip.roleLabel
                    : undefined
              }
              kategoriLabel={
                slip.kategori === "manual"
                  ? "Produksi Manual"
                  : slip.kategori === "tetap"
                    ? "Gaji Tetap & Bonus"
                    : "Tim QC & Finishing"
              }
              periodLabel={periodLabel}
              rows={slip.rows}
              totalAmount={slip.total}
              paidAt={
                slip.kategori === "tetap"
                  ? slip.paidAt
                  : payments[paymentKey(slip.userId, slip.kategori)]?.paid_at
              }
            />
          </div>,
        ),
      )
      .join("");

    const printDocument = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${fileTitle}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      /* Paksa warna latar ikut tercetak (kotak TOTAL GAJI, header tabel, dll) */
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { font-family: Arial, Helvetica, sans-serif; }
      .salary-print-page {
        page-break-after: always;
        break-after: page;
      }
      .salary-print-page:last-child {
        page-break-after: auto;
        break-after: auto;
      }
      /* Margin diatur di sini (bukan padding slip) supaya halaman lanjutan
         dari slip yang panjang juga punya margin atas yang sama; header slip
         diulang otomatis lewat <thead>. */
      @page {
        size: 210mm 297mm portrait;
        margin: 14mm 16mm;
      }
    </style>
  </head>
  <body>${pagesHtml}</body>
</html>`;

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);

    // Sebagian browser (Chrome) memakai judul halaman utama sebagai nama file
    // PDF saat mencetak dari iframe, jadi judulnya diganti sementara.
    const originalTitle = document.title;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      document.title = originalTitle;
      setPrinting(false);
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 500);
    };

    const iframeDoc = iframe.contentWindow?.document;
    if (!iframeDoc) {
      setPrinting(false);
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      showError(
        "Gagal Menyiapkan Dokumen",
        "Gagal menyiapkan dokumen cetak. Coba lagi.",
      );
      return;
    }

    iframeDoc.open();
    iframeDoc.write(printDocument);
    iframeDoc.close();

    // Tunggu semua gambar (logo) selesai dimuat sebelum dialog cetak dibuka,
    // dengan batas waktu 3 detik supaya cetak tidak macet kalau gambar gagal.
    const waitForImages = () =>
      Promise.race([
        Promise.all(
          Array.from(iframeDoc.images).map((img) =>
            img.complete
              ? Promise.resolve()
              : new Promise<void>((resolve) => {
                  img.onload = () => resolve();
                  img.onerror = () => resolve();
                }),
          ),
        ),
        new Promise<void>((resolve) => setTimeout(resolve, 3000)),
      ]);

    let hasPrinted = false;
    const triggerPrint = async () => {
      if (hasPrinted) return;
      hasPrinted = true;
      await waitForImages();
      document.title = fileTitle;
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      // Cadangan kalau onafterprint tidak terpanggil (mis. browser tertentu).
      setTimeout(cleanup, 30000);
    };

    if (iframe.contentWindow) {
      iframe.contentWindow.onafterprint = cleanup;
    }
    setTimeout(triggerPrint, 100);
  };

  // Susun baris rincian slip untuk SATU user di tab Produksi Manual, dari
  // data yang sama persis dengan yang tampil di tabel detail kanan.
  const buildManualSlipRows = (
    stat: (typeof userProductionStats)[string],
  ): SalarySlipRow[] =>
    stat.orders.map((item) => {
      const g = item.data.detail_gesut as GesutEntry | null | undefined;
      return {
        // Slip memakai nama pemesan (tim produksi tidak hafal kode order).
        label: item.data.nama_pemesan || item.data.kode_produksi,
        detail: `Gesut ${g ? `${g.kecil} kecil · ${g.sedang} sedang · ${g.besar} besar` : "—"} · ${new Date(item.data.created_at || "").toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}`,
        role: item.role,
        qty: item.data.jumlah || 0,
        rate: item.ratePerPcs,
        amount: item.earnings,
      };
    });

  const printFixedSlip = (slip: FixedSlip) =>
    printSlips([
      {
        userId: slip.userId,
        name: slip.name,
        kategori: "tetap",
        rows: slip.rows,
        total: slip.total,
        roleLabel: slip.roleLabel,
        paidAt: slip.paidAt,
      },
    ]);

  const productionTotals = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(userProductionStats).map(([id, st]) => [
          id,
          st.totalEarnings,
        ]),
      ) as Record<string, number>,
    [userProductionStats],
  );

  const printSingleManualSlip = (userId: string) => {
    const stat = userProductionStats[userId];
    const user = users.find((u) => u.id === userId);
    if (!stat || !user) return;
    printSlips([
      {
        userId,
        name: user.name,
        kategori: "manual",
        rows: buildManualSlipRows(stat),
        total: stat.totalEarnings,
      },
    ]);
  };

  const printBulkManualSlips = () => {
    const slips: SlipToPrint[] = Array.from(printSelectedIds)
      .map((userId): SlipToPrint | null => {
        const stat = userProductionStats[userId];
        const user = users.find((u) => u.id === userId);
        if (!stat || !user) return null;
        return {
          userId,
          name: user.name,
          kategori: "manual",
          rows: buildManualSlipRows(stat),
          total: stat.totalEarnings,
        };
      })
      .filter((s): s is SlipToPrint => s !== null);
    printSlips(slips);
  };

  // Slip untuk tim QC & Finishing: satu baris ringkasan pool + bagian rata
  // per anggota (bukan per-order, karena memang modelnya dibagi rata).
  const buildDtfSlipRows = (): SalarySlipRow[] => [
    {
      label: "Total Pool Gaji Tim (Manual + DTF)",
      detail: `${dtfSummary.totalOrders} order tuntas QC`,
      qty: dtfSummary.totalQty,
      amount: dtfSummary.totalEarnings,
    },
    {
      label: `Dibagi rata ke ${dtfTeam.length} anggota`,
      amount: dtfSummary.perMember,
    },
  ];

  const printSingleDtfSlip = (userId: string) => {
    const user = dtfTeam.find((u) => u.id === userId);
    if (!user) return;
    printSlips([
      {
        userId,
        name: user.name,
        kategori: "qc",
        rows: buildDtfSlipRows(),
        total: dtfSummary.perMember,
      },
    ]);
  };

  const printBulkDtfSlips = () => {
    const slips: SlipToPrint[] = dtfTeam.map((user) => ({
      userId: user.id,
      name: user.name,
      kategori: "qc" as const,
      rows: buildDtfSlipRows(),
      total: dtfSummary.perMember,
    }));
    printSlips(slips);
  };

  return (
    <>
      <div className="h-full min-h-0 flex flex-col space-y-4">
        {/* HEADER & FILTER */}
        <div className="bg-white dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row md:justify-between md:items-center items-stretch gap-3">
          <div>
            <h2 className="text-lg md:text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Manajemen Gaji Produksi
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Rekap gaji berdasarkan step produksi / QC yang sudah terlewati.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-lg w-full md:w-auto">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="flex-1 md:flex-none bg-transparent text-sm font-semibold text-zinc-700 dark:text-zinc-200 p-2.5 md:p-2 outline-none cursor-pointer"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i}>
                  {new Date(0, i).toLocaleString("id-ID", { month: "long" })}
                </option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="flex-1 md:flex-none bg-transparent text-sm font-semibold text-zinc-700 dark:text-zinc-200 p-2.5 md:p-2 outline-none cursor-pointer border-l border-zinc-300 dark:border-zinc-700 pl-2"
            >
              {[2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* RINGKASAN PENGELUARAN GAJI — semua kategori, periode terpilih */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard
            className="col-span-2 lg:col-span-1"
            label="Total Gaji Dikeluarkan"
            value={currency(ringkasan.total)}
            sub={
              fixedSummary
                ? periodLabel
                : `${periodLabel} · belum termasuk Admin & Designer`
            }
            accent
          />
          <StatCard
            label="Produksi Manual"
            value={currency(ringkasan.manualTotal)}
            sub={`${ringkasan.manualOrang} orang · ${ringkasan.manualQty.toLocaleString("id-ID")} pcs`}
          />
          <StatCard
            label="Tim QC & Finishing"
            value={currency(ringkasan.qcTotal)}
            sub={`${dtfTeam.length} orang · ${finishingOrders.length} order`}
          />
          <StatCard
            label="Admin & Designer"
            value={fixedSummary ? currency(ringkasan.tetapTotal) : "—"}
            sub={
              fixedSummary
                ? `${fixedSummary.people} orang · gaji tetap + bonus`
                : "Memuat…"
            }
          />
          <div className="bg-white dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-1">
              Status Pembayaran
            </div>
            <div className="font-mono tabular-nums text-lg md:text-xl font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              {ringkasan.persen}%{" "}
              <span className="text-[11px] font-sans font-medium text-zinc-500 dark:text-zinc-400">
                lunas
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden my-1.5">
              <div
                className="h-full bg-[#124540] dark:bg-[#49BFB4]"
                style={{ width: `${ringkasan.persen}%` }}
              />
            </div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
              Belum dibayar{" "}
              <span className="font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                {currency(ringkasan.belum)}
              </span>
            </div>
          </div>
        </div>

        {activeTab === "manual" && (
          <div className="bg-white dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                Sistem Gesut
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                {!bisaPilihSistem
                  ? `Memakai sistem ${pilihanEfektif} (diatur di Pengaturan).`
                  : pilihanEfektif === "otomatis"
                    ? `Otomatis: order yang produksinya selesai sejak ${new Date(GESUT_BARU_MULAI).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })} memakai sistem baru, sebelumnya sistem lama.`
                    : pilihanEfektif === "baru"
                      ? "Semua order periode ini dihitung dengan sistem baru."
                      : "Semua order periode ini dihitung dengan sistem lama."}{" "}
                <span className="font-mono tabular-nums">
                  ({jumlahOrderBaru} baru · {jumlahOrderLama} lama)
                </span>
              </p>
              {pilihanEfektif !== "lama" && !configGesutBaruAda && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Konfigurasi sistem baru (gaji_pj_gesut, dll) belum ada di
                  Pengaturan Harga — upah order sistem baru akan terhitung Rp0.
                </p>
              )}
            </div>
            {bisaPilihSistem && (
              <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-lg w-full md:w-auto">
                {(
                  [
                    ["otomatis", "Otomatis"],
                    ["lama", "Lama"],
                    ["baru", "Baru"],
                  ] as [SistemGesut, string][]
                ).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setSistemGesut(val)}
                    className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-semibold transition-colors duration-150 ${
                      sistemGesut === val
                        ? "bg-white dark:bg-zinc-950 text-[#124540] dark:text-[#49BFB4] shadow-sm"
                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-lg w-full md:w-fit">
          <button
            onClick={() => setActiveTab("manual")}
            className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-semibold transition-colors duration-150 ${
              activeTab === "manual"
                ? "bg-white dark:bg-zinc-950 text-[#124540] dark:text-[#49BFB4] shadow-sm"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            }`}
          >
            Produksi Manual
          </button>
          <button
            onClick={() => setActiveTab("dtf")}
            className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-semibold transition-colors duration-150 ${
              activeTab === "dtf"
                ? "bg-white dark:bg-zinc-950 text-[#124540] dark:text-[#49BFB4] shadow-sm"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            }`}
          >
            Tim QC & Finishing
          </button>
          <button
            onClick={() => setActiveTab("tetap")}
            className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-semibold transition-colors duration-150 ${
              activeTab === "tetap"
                ? "bg-white dark:bg-zinc-950 text-[#124540] dark:text-[#49BFB4] shadow-sm"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            }`}
          >
            Admin & Designer
          </button>
        </div>

        {/* ADMIN & DESIGNER — selalu terpasang (disembunyikan kalau bukan tab
            ini) supaya totalnya ikut masuk card ringkasan di atas. */}
        {!loadingConfigs && (
          <div
            className={
              activeTab === "tetap" ? "flex-1 min-h-0 flex flex-col" : "hidden"
            }
          >
            <FixedSalaryView
              users={users}
              periodOrders={filteredOrders}
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              productionTotals={productionTotals}
              canManage={isSupervisor || !!perms?.salary?.edit}
              canPrint={canPrint}
              printing={printing}
              onPrintSlip={printFixedSlip}
              showConfirm={showConfirm}
              showError={showError}
              onSummary={setFixedSummary}
            />
          </div>
        )}

        {loadingConfigs ? (
          <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm">
            Memuat konfigurasi harga...
          </div>
        ) : activeTab === "tetap" ? null : activeTab === "manual" ? (
          // ═══════════════════════════════ TAB: PRODUKSI MANUAL ═══════════════════════════════
          <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-4 overflow-hidden">
            {/* LIST USER (KIRI) */}
            <div
              className={`w-full md:w-90 md:flex-none flex-1 min-h-0 flex flex-col bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 ${selectedUserId ? "hidden md:flex" : "flex"}`}
            >
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
                <span className="font-semibold text-zinc-700 dark:text-zinc-300 text-sm">
                  Daftar Personil
                </span>
                {canPrint && (
                  <button
                    onClick={printBulkManualSlips}
                    disabled={printSelectedIds.size === 0 || printing}
                    className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 bg-[#124540] hover:bg-[#0d332f] disabled:opacity-40 text-white rounded-md transition-colors duration-150 shrink-0"
                  >
                    {printing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Printer className="w-3.5 h-3.5" />
                    )}
                    Cetak ({printSelectedIds.size})
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                {users.filter((u) => userProductionStats[u.id]).length === 0 ? (
                  <div className="text-center p-8 text-zinc-400 dark:text-zinc-600 text-xs">
                    Tidak ada order manual dengan step produksi tuntas pada
                    periode ini.
                  </div>
                ) : (
                  users.map((user) => {
                    const stat = userProductionStats[user.id];
                    if (!stat) return null;
                    const paid = isPaid(user.id, "manual");
                    const isChecked = printSelectedIds.has(user.id);

                    return (
                      <div
                        key={user.id}
                        className={`w-full text-left p-3 rounded-lg border transition-colors duration-150 flex items-center gap-2 group
                          ${
                            selectedUserId === user.id
                              ? "bg-zinc-100 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700"
                              : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                          }`}
                      >
                        {/* Checkbox pilih untuk cetak massal — dipisah dari
                          klik nama supaya klik centang tidak ikut membuka
                          detail user. Disembunyikan kalau user tidak punya
                          hak akses cetak (perms.salary.create). */}
                        {canPrint && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePrintSelect(user.id);
                            }}
                            className="shrink-0 text-zinc-400 hover:text-[#04ae9d] transition-colors duration-150"
                            aria-label="Pilih untuk cetak massal"
                          >
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 text-[#04ae9d]" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        )}

                        <button
                          onClick={() => setSelectedUserId(user.id)}
                          className="flex-1 min-w-0 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm shrink-0 ${selectedUserId === user.id ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"}`}
                            >
                              {user.name.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-zinc-800 dark:text-zinc-100 text-sm flex items-center gap-1.5 truncate">
                                {user.name}
                                {paid && (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                )}
                              </div>
                              <div className="text-[10px] text-zinc-500 dark:text-zinc-400 flex gap-2">
                                <span>
                                  <span className="font-mono tabular-nums">
                                    {stat.totalOrders}
                                  </span>{" "}
                                  Job
                                </span>
                                <span>
                                  <span className="font-mono tabular-nums">
                                    {stat.totalQty}
                                  </span>{" "}
                                  Pcs
                                </span>
                                {paid && (
                                  <span className="text-emerald-600 dark:text-emerald-500 font-semibold">
                                    Lunas
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <ChevronRight
                            className={`w-4 h-4 text-zinc-300 group-hover:text-[#04ae9d] shrink-0 ${selectedUserId === user.id ? "text-zinc-500 dark:text-zinc-400" : ""}`}
                          />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* DETAIL PRODUKSI (KANAN) */}
            <div
              className={`w-full bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 flex-1 min-h-0 flex flex-col ${!selectedUserId ? "hidden md:flex" : "flex"}`}
            >
              {selectedUserId && activeUserStats ? (
                <>
                  <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-zinc-50 dark:bg-zinc-900 rounded-t-xl">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setSelectedUserId(null)}
                        className="md:hidden p-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-md transition-colors duration-150 shrink-0"
                      >
                        <ChevronRight className="w-4 h-4 rotate-180" />
                      </button>
                      <div>
                        <h3 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                          {activeUserDetail?.name}
                        </h3>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          Rincian Produksi:{" "}
                          {new Date(0, selectedMonth).toLocaleString("id-ID", {
                            month: "long",
                          })}{" "}
                          {selectedYear}
                        </p>
                      </div>
                    </div>
                    <div className="text-left sm:text-right pl-10 sm:pl-0">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                        Total Produksi
                      </div>
                      <div className="font-mono tabular-nums text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                        {activeUserStats.totalQty.toLocaleString("id-ID")}{" "}
                        <span className="text-xs font-normal text-zinc-400">
                          Pcs
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                    <div className="flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-zinc-400 shrink-0" />
                      <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                        Total Gaji (dari komposisi gesut):
                      </span>
                    </div>
                    <div className="px-3 py-1.5 bg-white dark:bg-zinc-950 text-[#04ae9d] font-mono tabular-nums font-semibold rounded-lg text-sm border border-zinc-200 dark:border-zinc-800 sm:min-w-[140px] text-right self-stretch sm:self-auto">
                      {currency(activeUserStats.totalEarnings)}
                    </div>
                  </div>

                  <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center gap-2">
                    {canPrint && (
                      <button
                        onClick={() => printSingleManualSlip(selectedUserId)}
                        disabled={printing}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50 transition-colors duration-150"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Cetak Slip
                      </button>
                    )}

                    {isPaid(selectedUserId, "manual") ? (
                      <button
                        onClick={() => unmarkPaid(selectedUserId, "manual")}
                        disabled={
                          markingPaidKey ===
                          paymentKey(selectedUserId, "manual")
                        }
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 rounded-md hover:bg-emerald-100 dark:hover:bg-emerald-950/50 disabled:opacity-50 transition-colors duration-150"
                      >
                        {markingPaidKey ===
                        paymentKey(selectedUserId, "manual") ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        Lunas —{" "}
                        {new Date(
                          payments[paymentKey(selectedUserId, "manual")]
                            ?.paid_at,
                        ).toLocaleDateString("id-ID", {
                          day: "2-digit",
                          month: "short",
                        })}
                        <span className="inline-flex items-center gap-1 ml-1.5 pl-1.5 border-l border-emerald-300 dark:border-emerald-800 opacity-80">
                          <Undo2 className="w-3 h-3" /> Batalkan
                        </span>
                      </button>
                    ) : (
                      <button
                        onClick={() =>
                          markPaid(
                            selectedUserId,
                            "manual",
                            activeUserStats.totalEarnings,
                          )
                        }
                        disabled={
                          markingPaidKey ===
                          paymentKey(selectedUserId, "manual")
                        }
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 bg-[#124540] hover:bg-[#0d332f] text-white rounded-md disabled:opacity-50 transition-colors duration-150"
                      >
                        {markingPaidKey ===
                        paymentKey(selectedUserId, "manual") ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        Tandai Sudah Dibayar
                      </button>
                    )}
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto p-0">
                    <div className="md:hidden divide-y divide-zinc-200 dark:divide-zinc-800">
                      {activeUserStats.orders.map((item, index) => {
                        const g = item.data.detail_gesut as
                          | GesutEntry
                          | null
                          | undefined;
                        return (
                          <div key={index} className="p-4 space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-mono tabular-nums font-semibold text-zinc-700 dark:text-zinc-300">
                                {item.data.kode_produksi}
                              </span>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[11px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                                  {new Date(
                                    item.data.created_at || "",
                                  ).toLocaleDateString("id-ID", {
                                    day: "2-digit",
                                    month: "short",
                                  })}
                                </span>
                                {canEditOrder && (
                                  <button
                                    onClick={() => handleEditOrder(item.data)}
                                    className="p-1 text-zinc-400 hover:text-[#04ae9d] transition-colors duration-150"
                                    aria-label="Edit pesanan"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center justify-between">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide ${
                                    item.role === "PJ"
                                      ? "border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-200"
                                      : "border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500"
                                  }`}
                                >
                                  {item.role}
                                  {item.sistem === "lama" && (
                                    <>
                                      {" "}
                                      {item.role === "PJ" &&
                                      !item.data.helper_id
                                        ? "(100%)"
                                        : item.role === "PJ"
                                          ? "(70%)"
                                          : "(30%)"}
                                    </>
                                  )}
                                </span>
                                <TimTag hasHelper={!!item.data.helper_id} />
                              </div>
                              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                Gesut (K/S/B):{" "}
                                <span className="font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                                  {g
                                    ? `${g.kecil}/${g.sedang}/${g.besar}`
                                    : "—"}
                                </span>
                              </span>
                            </div>

                            <div className="grid grid-cols-3 gap-2 pt-1">
                              <div>
                                <div className="text-[9px] uppercase tracking-wide text-zinc-400">
                                  Jumlah Pcs
                                </div>
                                <div className="text-xs font-mono tabular-nums font-semibold text-zinc-700 dark:text-zinc-300">
                                  {(item.data.jumlah || 0).toLocaleString(
                                    "id-ID",
                                  )}
                                </div>
                              </div>
                              <div>
                                <div className="text-[9px] uppercase tracking-wide text-zinc-400">
                                  Rate/Pcs
                                </div>
                                <div className="text-xs font-mono tabular-nums font-semibold text-zinc-700 dark:text-zinc-300">
                                  {currency(item.ratePerPcs)}
                                </div>
                              </div>
                              <div>
                                <div className="text-[9px] uppercase tracking-wide text-zinc-400">
                                  Total Gaji
                                </div>
                                <div className="text-xs font-mono tabular-nums font-semibold text-[#04ae9d]">
                                  {currency(item.earnings)}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Versi tabel untuk layar md ke atas — sama persis
                      datanya dengan kartu mobile di atas. */}
                    <table className="w-full text-left border-collapse hidden md:table">
                      <thead className="bg-zinc-50 dark:bg-zinc-900 sticky top-0 z-10">
                        <tr>
                          <th className="p-3 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                            Tanggal
                          </th>
                          <th className="p-3 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                            Kode
                          </th>
                          <th className="p-3 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                            Peran
                          </th>
                          <th className="p-3 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                            Gesut (K/S/B)
                          </th>
                          <th className="p-3 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-right">
                            Jumlah Pcs
                          </th>
                          <th className="p-3 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-right">
                            Rate/Pcs
                          </th>
                          <th className="p-3 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-right">
                            Total Gaji
                          </th>
                          <th className="p-3 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-right">
                            Aksi
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {activeUserStats.orders.map((item, index) => {
                          const g = item.data.detail_gesut as
                            | GesutEntry
                            | null
                            | undefined;
                          return (
                            <tr
                              key={index}
                              className="hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150"
                            >
                              <td className="p-3 text-xs font-mono tabular-nums text-zinc-600 dark:text-zinc-300 whitespace-nowrap">
                                {new Date(
                                  item.data.created_at || "",
                                ).toLocaleDateString("id-ID", {
                                  day: "2-digit",
                                  month: "short",
                                })}
                              </td>
                              <td className="p-3 text-xs font-mono tabular-nums font-semibold text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                                {item.data.kode_produksi}
                              </td>
                              <td className="p-3">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span
                                    className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide ${
                                      item.role === "PJ"
                                        ? "border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-200"
                                        : "border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500"
                                    }`}
                                  >
                                    {item.role}
                                    {item.sistem === "lama" && (
                                      <>
                                        {" "}
                                        {item.role === "PJ" &&
                                        !item.data.helper_id
                                          ? "(100%)"
                                          : item.role === "PJ"
                                            ? "(70%)"
                                            : "(30%)"}
                                      </>
                                    )}
                                  </span>
                                  <TimTag hasHelper={!!item.data.helper_id} />
                                </div>
                              </td>
                              <td className="p-3 text-xs font-mono tabular-nums text-zinc-600 dark:text-zinc-300">
                                {g ? `${g.kecil}/${g.sedang}/${g.besar}` : "—"}
                              </td>
                              {/* ── PERBAIKAN ── ini jumlah pesanan (order.jumlah),
                                bukan total gesut — sesuai maksud Anda. */}
                              <td className="p-3 text-xs font-mono tabular-nums text-zinc-600 dark:text-zinc-300 text-right">
                                {(item.data.jumlah || 0).toLocaleString(
                                  "id-ID",
                                )}
                              </td>
                              <td className="p-3 text-xs font-mono tabular-nums text-zinc-600 dark:text-zinc-300 text-right">
                                {currency(item.ratePerPcs)}
                              </td>
                              <td className="p-3 text-xs font-mono tabular-nums font-semibold text-zinc-800 dark:text-zinc-200 text-right">
                                {currency(item.earnings)}
                              </td>
                              <td className="p-3 text-right">
                                {canEditOrder && (
                                  <button
                                    onClick={() => handleEditOrder(item.data)}
                                    className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-500 hover:text-[#04ae9d] hover:border-[#04ae9d]/50 transition-colors duration-150"
                                  >
                                    <Pencil className="w-3 h-3" /> Edit
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-zinc-300 dark:text-zinc-600 p-8 text-center">
                  <Printer className="w-16 h-16 mb-4 opacity-20" />
                  <p className="text-sm font-semibold">
                    Pilih User di sebelah kiri
                  </p>
                  <p className="text-xs max-w-xs mx-auto mt-2">
                    Klik nama user untuk melihat detail produksi (PJ & Helper)
                    yang telah dikerjakan dan gaji yang dihitung dari komposisi
                    gesut.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          // ═══════════════════════════════ TAB: TIM FINISHING (DTF) ═══════════════════════════════
          // Model agregat: TIDAK per-user-per-order. Total SEMUA order selesai
          // (Manual + DTF) dalam periode dijumlahkan dulu, baru dibagi rata ke
          // semua anggota tim (role 'qc') — tim ini kerja QC/finishing/packing
          // untuk kedua jenis produksi, bukan cuma DTF.
          <div className="flex-1 overflow-y-auto space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">
                  Order Tuntas QC (Semua Jenis)
                </div>
                <div className="font-mono tabular-nums text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                  {dtfSummary.totalOrders}
                </div>
              </div>
              <div className="bg-white dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">
                  Total Qty
                </div>
                <div className="font-mono tabular-nums text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                  {dtfSummary.totalQty.toLocaleString("id-ID")}{" "}
                  <span className="text-xs font-normal text-zinc-400">Pcs</span>
                </div>
              </div>
              <div className="bg-white dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">
                  Total Pool Gaji Tim
                </div>
                <div className="font-mono tabular-nums text-xl font-semibold text-[#04ae9d]">
                  {currency(dtfSummary.totalEarnings)}
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-zinc-400" />
                  <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                    Anggota Tim QC & Finishing ({dtfTeam.length} orang)
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400">
                    Dibagi rata dari total pool
                  </span>
                  {canPrint && (
                    <button
                      onClick={printBulkDtfSlips}
                      disabled={dtfTeam.length === 0 || printing}
                      className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 bg-[#124540] hover:bg-[#0d332f] disabled:opacity-40 text-white rounded-md transition-colors duration-150 shrink-0"
                    >
                      {printing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Printer className="w-3.5 h-3.5" />
                      )}
                      Cetak Semua Slip
                    </button>
                  )}
                </div>
              </div>

              {dtfTeam.length === 0 ? (
                <div className="p-8 text-center text-zinc-400 dark:text-zinc-600 text-xs">
                  Belum ada user dengan role "qc". Tambahkan lewat menu Kelola
                  User.
                </div>
              ) : (
                <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {dtfTeam.map((member) => {
                    const paid = isPaid(member.id, "qc");
                    const busy = markingPaidKey === paymentKey(member.id, "qc");
                    return (
                      <div
                        key={member.id}
                        className="p-4 flex flex-wrap items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                            {member.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-semibold text-zinc-800 dark:text-zinc-100 text-sm flex items-center gap-1.5">
                              {member.name}
                              {paid && (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              )}
                            </div>
                            {paid && (
                              <div className="text-[10px] text-emerald-600 dark:text-emerald-500 font-semibold">
                                Lunas —{" "}
                                {new Date(
                                  payments[paymentKey(member.id, "qc")]
                                    ?.paid_at,
                                ).toLocaleDateString("id-ID", {
                                  day: "2-digit",
                                  month: "short",
                                })}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="font-mono tabular-nums text-sm font-semibold text-[#04ae9d]">
                            {currency(dtfSummary.perMember)}
                          </div>
                          {canPrint && (
                            <button
                              onClick={() => printSingleDtfSlip(member.id)}
                              disabled={printing}
                              className="p-2 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50 transition-colors duration-150"
                              aria-label="Cetak slip"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {paid ? (
                            <button
                              onClick={() => unmarkPaid(member.id, "qc")}
                              disabled={busy}
                              className="p-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 rounded-md hover:bg-emerald-100 dark:hover:bg-emerald-950/50 disabled:opacity-50 transition-colors duration-150"
                              aria-label="Batalkan status lunas"
                            >
                              {busy ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Undo2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          ) : (
                            <button
                              onClick={() =>
                                markPaid(member.id, "qc", dtfSummary.perMember)
                              }
                              disabled={busy}
                              className="p-2 bg-[#124540] hover:bg-[#0d332f] text-white rounded-md disabled:opacity-50 transition-colors duration-150"
                              aria-label="Tandai sudah dibayar"
                            >
                              {busy ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                Daftar Order Tuntas QC Periode Ini (Manual + DTF)
              </div>
              <div className="md:hidden divide-y divide-zinc-200 dark:divide-zinc-800">
                {finishingOrders.length === 0 ? (
                  <div className="p-8 text-center text-zinc-400 dark:text-zinc-600 text-xs">
                    Tidak ada order dengan step QC tuntas pada periode ini.
                  </div>
                ) : (
                  finishingOrders.map((order) => (
                    <div key={order.id} className="p-4 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono tabular-nums font-semibold text-zinc-700 dark:text-zinc-300">
                          {order.kode_produksi}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                            {new Date(
                              order.created_at || "",
                            ).toLocaleDateString("id-ID", {
                              day: "2-digit",
                              month: "short",
                            })}
                          </span>
                          {canEditOrder && (
                            <button
                              onClick={() => handleEditOrder(order)}
                              className="p-1 text-zinc-400 hover:text-[#04ae9d] transition-colors duration-150"
                              aria-label="Edit pesanan"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-zinc-800 dark:text-zinc-200">
                          {order.nama_pemesan}
                        </span>
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide shrink-0 ${
                            isManualJenis(order.jenis_produksi)
                              ? "border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-200"
                              : "border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500"
                          }`}
                        >
                          {isManualJenis(order.jenis_produksi)
                            ? "Manual"
                            : "DTF"}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Qty:{" "}
                        <span className="font-mono tabular-nums font-semibold text-zinc-700 dark:text-zinc-300">
                          {order.jumlah}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Versi tabel untuk layar md ke atas */}
              <table className="w-full text-left border-collapse hidden md:table">
                <thead className="bg-zinc-50 dark:bg-zinc-900">
                  <tr>
                    <th className="p-3 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                      Tanggal
                    </th>
                    <th className="p-3 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                      Kode
                    </th>
                    <th className="p-3 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                      Jenis
                    </th>
                    <th className="p-3 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                      Pemesan
                    </th>
                    <th className="p-3 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-right">
                      Qty
                    </th>
                    <th className="p-3 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-right">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {finishingOrders.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="p-8 text-center text-zinc-400 dark:text-zinc-600 text-xs"
                      >
                        Tidak ada order dengan step QC tuntas pada periode ini.
                      </td>
                    </tr>
                  ) : (
                    finishingOrders.map((order) => (
                      <tr
                        key={order.id}
                        className="hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150"
                      >
                        <td className="p-3 text-xs font-mono tabular-nums text-zinc-600 dark:text-zinc-300 whitespace-nowrap">
                          {new Date(order.created_at || "").toLocaleDateString(
                            "id-ID",
                            { day: "2-digit", month: "short" },
                          )}
                        </td>
                        <td className="p-3 text-xs font-mono tabular-nums font-semibold text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                          {order.kode_produksi}
                        </td>
                        <td className="p-3">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide ${
                              isManualJenis(order.jenis_produksi)
                                ? "border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-200"
                                : "border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500"
                            }`}
                          >
                            {isManualJenis(order.jenis_produksi)
                              ? "Manual"
                              : "DTF"}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-zinc-800 dark:text-zinc-200">
                          {order.nama_pemesan}
                        </td>
                        <td className="p-3 text-xs font-mono tabular-nums font-semibold text-zinc-800 dark:text-zinc-200 text-right">
                          {order.jumlah}
                        </td>
                        <td className="p-3 text-right">
                          {canEditOrder && (
                            <button
                              onClick={() => handleEditOrder(order)}
                              className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-500 hover:text-[#04ae9d] hover:border-[#04ae9d]/50 transition-colors duration-150"
                            >
                              <Pencil className="w-3 h-3" /> Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <CustomAlert alertState={alertState} closeAlert={closeAlert} />
    </>
  );
}
