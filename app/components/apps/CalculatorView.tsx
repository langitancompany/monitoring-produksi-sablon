// app/components/apps/CalculatorView.tsx

"use client";

import React, { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Info, ChevronDown, ChevronUp, X } from "lucide-react";
import {
  KEY_GESUT_LAMA_AKTIF,
  KEY_GESUT_BARU_AKTIF,
  resolveGesutFlag,
} from "@/lib/gesutSystem";

type SistemGesut = "lama" | "baru";

// Margin bertingkat berdasarkan qty.
// Kalau margin_tier2_percentage / margin_tier3_percentage belum diisi di
// tabel pricing_configs, fungsi ini otomatis fallback ke margin dasar
// (margin_percentage) supaya tidak ada perubahan harga tak sengaja
// sebelum nilainya benar-benar diisi.
function getMarginPercentage(qty: number, config: any): number {
  const base = config.margin_percentage ?? 0;
  const tier2Qty = config.margin_tier2_qty ?? 60;
  const tier3Qty = config.margin_tier3_qty ?? 120;
  const tier2Margin = config.margin_tier2_percentage ?? base;
  const tier3Margin = config.margin_tier3_percentage ?? tier2Margin;

  if (qty >= tier3Qty) return tier3Margin;
  if (qty >= tier2Qty) return tier2Margin;
  return base;
}

// Pembulatan SELALU ke atas (ceil) supaya harga jual tidak pernah lebih
// rendah dari hasil hitungan. step = 0 berarti tanpa pembulatan.
// Nilai dibulatkan ke 2 desimal dulu supaya sisa floating-point
// (mis. 15000.0000000001) tidak membuat harga loncat satu step.
const OPSI_PEMBULATAN = [
  { value: 0, label: "Tanpa" },
  { value: 100, label: "100" },
  { value: 500, label: "500" },
  { value: 1000, label: "1.000" },
];

function bulatkanKeAtas(num: number, step: number): number {
  if (!step || step <= 0) return num;
  const bersih = Math.round(num * 100) / 100;
  return Math.ceil(bersih / step) * step;
}

export default function CalculatorView() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<any>({});
  const [addons, setAddons] = useState<any[]>([]);

  const [mode, setMode] = useState("DTF");
  // Flag sistem gaji gesut dari Pengaturan (sama seperti di menu Gaji).
  const [gesutFlags, setGesutFlags] = useState({ lama: true, baru: false });
  // Pilihan sistem di halaman ini (hanya relevan kalau keduanya aktif).
  const [sistemGesut, setSistemGesut] = useState<SistemGesut>("baru");
  const [finalPrice, setFinalPrice] = useState(0);
  const [laborDetails, setLaborDetails] = useState({ gesut: 0, packing: 0 });
  const [appliedMargin, setAppliedMargin] = useState(0);
  // Kelipatan pembulatan harga jual (selalu dibulatkan ke atas)
  const [roundStep, setRoundStep] = useState(500);

  const [inputs, setInputs] = useState({
    qty: 0,
    width: 0,
    length: 0,
    totalColors: 0, // total screen/warna (sistem baru: tidak lagi dibagi area kecil/sedang/besar)
    // Sistem lama: komposisi warna per ukuran area
    colorsKecil: 0,
    colorsSedang: 0,
    colorsBesar: 0,
    kaosPrice: 0,
  });

  const [selectedAddonIds, setSelectedAddonIds] = useState<number[]>([]);

  // State UI mobile: accordion addon & bottom sheet rincian harga
  const [addonsOpen, setAddonsOpen] = useState(false);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);

  // 1. FETCH DATA
  useEffect(() => {
    const fetchData = async () => {
      // pricing_configs menyimpan histori (tiap simpan = INSERT baris baru).
      // Urutkan ascending by effective_date, lewati yang dijadwalkan di masa
      // depan, lalu baris terakhir per key_name otomatis jadi nilai yang berlaku.
      const { data: configData } = await supabase
        .from("pricing_configs")
        .select("key_name, value_amount, effective_date")
        .order("effective_date", { ascending: true })
        .order("id", { ascending: true });
      if (configData) {
        setGesutFlags({
          lama: resolveGesutFlag(configData as any[], KEY_GESUT_LAMA_AKTIF),
          baru: resolveGesutFlag(configData as any[], KEY_GESUT_BARU_AKTIF),
        });
        const todayStr = new Date().toISOString().split("T")[0];
        const configMap = configData.reduce((acc: any, item: any) => {
          if (item.effective_date && item.effective_date > todayStr) return acc;
          acc[item.key_name] = Number(item.value_amount);
          return acc;
        }, {});
        setConfig(configMap);
      }
      const { data: addonData } = await supabase
        .from("product_addons")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (addonData) setAddons(addonData);
      setLoading(false);
    };
    fetchData();
  }, []);

  const toggleAddon = (id: number) => {
    setSelectedAddonIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  // Sistem efektif: kalau hanya satu aktif di Pengaturan, langsung dipakai.
  // Kalau keduanya aktif, ikut pilihan user. Kalau (keliru) keduanya nonaktif,
  // jatuh ke sistem lama (sama seperti SalaryView).
  const bisaPilihSistem = gesutFlags.lama && gesutFlags.baru;
  const sistemEfektif: SistemGesut = !gesutFlags.baru
    ? "lama"
    : !gesutFlags.lama
      ? "baru"
      : sistemGesut;

  // 3. KALKULASI UTAMA
  useEffect(() => {
    if (loading) return;
    const hasQty = inputs.qty > 0;
    const hasDtfDim = mode === "DTF" && inputs.width > 0 && inputs.length > 0;
    const totalColorsEfektif =
      sistemEfektif === "lama"
        ? inputs.colorsKecil + inputs.colorsSedang + inputs.colorsBesar
        : inputs.totalColors;
    const hasManualColor = mode === "MANUAL" && totalColorsEfektif > 0;

    if (
      !hasQty ||
      (mode === "DTF" && !hasDtfDim) ||
      (mode === "MANUAL" && !hasManualColor)
    ) {
      setFinalPrice(0);
      setLaborDetails({ gesut: 0, packing: 0 });
      return;
    }

    let hppSablon = 0;
    const marginPercentage = getMarginPercentage(inputs.qty, config);
    const margin = marginPercentage / 100;
    setAppliedMargin(marginPercentage);
    const safeQty = inputs.qty > 0 ? inputs.qty : 1;
    const costListrikLPG = config.cost_listrik_lpg ?? 0;
    const costPenunjang = config.cost_bahan_penunjang ?? 0;

    const totalBonusCost = selectedAddonIds.reduce((total, id) => {
      const item = addons.find((a) => a.id === id);
      return total + (item ? Number(item.cost) : 0);
    }, 0);

    const hppOperasionalTotal = costListrikLPG + costPenunjang + totalBonusCost;
    let currentGesutCost = 0;
    let currentPackingCost = 0;

    if (mode === "DTF") {
      const area = inputs.width * inputs.length;
      const dtfPricePerCm = config.dtf_price_per_cm ?? 0;
      const pressCost = config.dtf_press_cost ?? 0;
      const dtfTintaCostPerCm = config.cost_dtf_ink ?? 0;
      const dtfPrintFilmCostPerPcs = config.cost_print_film ?? 0;

      hppSablon =
        area * dtfPricePerCm +
        area * dtfTintaCostPerCm +
        pressCost +
        dtfPrintFilmCostPerPcs;
      currentGesutCost = pressCost;
    } else {
      const screenCost = config.manual_screen_cost ?? 0;
      const plastisolCostPerPcs = config.cost_plastisol_ink ?? 0;
      const setupCostPerPcs = (screenCost * totalColorsEfektif) / safeQty;

      if (sistemEfektif === "lama") {
        // ── SISTEM LAMA: komposisi warna kecil/sedang/besar × rate gesut_manual_* ──
        const gesutPerPcs =
          inputs.colorsKecil * (config.gesut_manual_kecil ?? 0) +
          inputs.colorsSedang * (config.gesut_manual_sedang ?? 0) +
          inputs.colorsBesar * (config.gesut_manual_besar ?? 0);
        // Packing lama: manual_finishing (tanpa fallback, sama seperti rumus lama)
        const packingLama = config.manual_finishing ?? 0;

        currentGesutCost = gesutPerPcs;
        currentPackingCost = packingLama;
        hppSablon =
          setupCostPerPcs + gesutPerPcs + packingLama + plastisolCostPerPcs;
      } else {
        // ── SISTEM BARU: upah global berbasis profesi + bonus kompleksitas ──
        const basePj = config.gaji_pj_gesut ?? 3000;
        const baseHelper = config.gaji_helper_gesut ?? 2000;
        const basePacking = config.gaji_press_packing ?? 1500;
        const normalLimit = config.batas_warna_normal ?? 4;
        const extraColorBonus = config.bonus_ekstra_warna ?? 500;

        // Bonus kompleksitas: hanya untuk warna di atas batas normal
        const extraColors = Math.max(0, inputs.totalColors - normalLimit);
        const bonusWarna = extraColors * extraColorBonus;

        // Upah tukang gesut per pcs (PJ + Helper + bonus warna)
        const gesutPerPcs = basePj + baseHelper + bonusWarna;

        currentGesutCost = gesutPerPcs;
        currentPackingCost = basePacking;
        hppSablon =
          setupCostPerPcs + gesutPerPcs + basePacking + plastisolCostPerPcs;
      }
    }

    setLaborDetails({ gesut: currentGesutCost, packing: currentPackingCost });
    const totalHPP = inputs.kaosPrice + hppSablon + hppOperasionalTotal;
    setFinalPrice(totalHPP + totalHPP * margin);
  }, [inputs, mode, config, loading, selectedAddonIds, addons, sistemEfektif]);

  const formatRupiahDisplay = (num: number) =>
    !num ? "" : "Rp " + num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const formatNumberDisplay = (num: number) => (!num ? "" : num.toString());
  const handleInputChange = (e: any, field: string) => {
    const rawValue = e.target.value.replace(/\D/g, "");
    setInputs((prev) => ({ ...prev, [field]: Number(rawValue) }));
  };
  const formatResult = (num: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(num);

  if (loading)
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] bg-transparent">
        <div className="w-12 h-12 border-4 border-zinc-200 dark:border-zinc-800 border-t-[#2589ff] rounded-full animate-spin mb-4"></div>
      </div>
    );

  const showResult = finalPrice > 0;
  // Harga jual setelah pembulatan ke atas — inilah yang ditampilkan & dikali qty
  const roundedPrice = bulatkanKeAtas(finalPrice, roundStep);
  const selisihPembulatan = roundedPrice - finalPrice;
  const currentTotalBonus = selectedAddonIds.reduce((total, id) => {
    const item = addons.find((a) => a.id === id);
    return total + (item ? Number(item.cost) : 0);
  }, 0);
  const totalManualColors =
    sistemEfektif === "lama"
      ? inputs.colorsKecil + inputs.colorsSedang + inputs.colorsBesar
      : inputs.totalColors;
  const manualNormalLimit = config.batas_warna_normal ?? 4;
  // Bonus warna ekstra hanya ada di sistem baru
  const manualExtraColors =
    sistemEfektif === "baru"
      ? Math.max(0, totalManualColors - manualNormalLimit)
      : 0;
  const manualBonusWarna =
    manualExtraColors * (config.bonus_ekstra_warna ?? 500);

  // Rincian hasil, dipakai bersama oleh panel desktop & bottom sheet mobile
  const resultDetails = (
    <>
      <div className="flex justify-between text-sm">
        <span className="text-zinc-500 dark:text-zinc-400">Total Omset</span>
        <span className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-white">
          {formatResult(roundedPrice * inputs.qty)}
        </span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-zinc-500 dark:text-zinc-400">
          Estimasi Margin
        </span>
        <span className="font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
          +{appliedMargin}%
          {appliedMargin < (config.margin_percentage ?? 0) && (
            <span className="text-[10px] font-mono font-normal text-zinc-400 dark:text-zinc-500 ml-1">
              (harga grosir)
            </span>
          )}
        </span>
      </div>
      {roundStep > 0 && (
        <>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">
              Harga Murni (sebelum bulat)
            </span>
            <span className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-white">
              {formatResult(finalPrice)}{" "}
              <span className="text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                /pcs
              </span>
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">
              Pembulatan ke atas (Rp {roundStep.toLocaleString("id-ID")})
            </span>
            <span className="font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
              +{formatResult(selisihPembulatan)}{" "}
              <span className="text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                /pcs
              </span>
            </span>
          </div>
        </>
      )}
      <hr className="border-zinc-200 dark:border-zinc-800" />

      <div className="flex justify-between text-sm">
        <span className="text-zinc-500 dark:text-zinc-400">
          Listrik/LPG & Penunjang
        </span>
        <span className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-white">
          {formatResult(
            (config.cost_listrik_lpg ?? 0) + (config.cost_bahan_penunjang ?? 0),
          )}{" "}
          /pcs
        </span>
      </div>
      {currentTotalBonus > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">Total Bonus</span>
          <span className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-white">
            +{formatResult(currentTotalBonus)} /pcs
          </span>
        </div>
      )}

      {mode === "MANUAL" ? (
        <>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">
              {sistemEfektif === "lama"
                ? "Upah Gesut (komposisi warna)"
                : "Upah Tukang (PJ+Helper)"}
            </span>
            <span className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-white">
              {formatResult(laborDetails.gesut - manualBonusWarna)}{" "}
              <span className="text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                /pcs
              </span>
            </span>
          </div>
          {manualBonusWarna > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500 dark:text-zinc-400">
                Bonus Warna Ekstra (+{manualExtraColors})
              </span>
              <span className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-white">
                {"+" + formatResult(manualBonusWarna)}{" "}
                <span className="text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                  /pcs
                </span>
              </span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">
              Packing / Press
            </span>
            <span className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-white">
              {formatResult(laborDetails.packing)}{" "}
              <span className="text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                /pcs
              </span>
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">
              Beban Screen ({totalManualColors} warna)
            </span>
            <span className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-white">
              {formatResult(
                ((config.manual_screen_cost ?? 0) * totalManualColors) /
                  (inputs.qty || 1),
              )}{" "}
              <span className="text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                /pcs
              </span>
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Cost Tinta</span>
            <span className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-white">
              {formatResult(config.cost_plastisol_ink ?? 0)}{" "}
              <span className="text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                /pcs
              </span>
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">
              HPP Tinta & Film
            </span>
            <span className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-white">
              {formatResult(
                inputs.width * inputs.length * (config.cost_dtf_ink ?? 0) +
                  (config.cost_print_film ?? 0),
              )}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">
              Cost Cetak & Press
            </span>
            <span className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-white">
              {formatResult(
                inputs.width * inputs.length * (config.dtf_price_per_cm ?? 0) +
                  (config.dtf_press_cost ?? 0),
              )}{" "}
              /pcs
            </span>
          </div>
        </>
      )}
    </>
  );

  return (
    <div className="h-full bg-zinc-50 dark:bg-zinc-950 flex flex-col md:flex-row rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 transition-colors duration-150">
      {/* PANEL KIRI: INPUT */}
      {/* pb-24 menyisakan ruang untuk sticky bottom bar harga di mobile, dihilangkan di desktop karena panel hasil sudah tampil di samping */}
      <div className="flex-1 p-4 md:p-8 overflow-y-auto pb-24 md:pb-8 custom-scrollbar">
        <div className="max-w-xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
              Kalkulator Produksi
            </h2>
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-600 text-white flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
              Live
            </span>
          </div>

          <div className="bg-white dark:bg-zinc-950 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 flex mb-6">
            <button
              onClick={() => setMode("DTF")}
              className={`flex-1 py-3 rounded-lg text-sm font-semibold transition-colors duration-150 ${mode === "DTF" ? "bg-[#124540] text-white" : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900"}`}
            >
              Sablon DTF
            </button>
            <button
              onClick={() => setMode("MANUAL")}
              className={`flex-1 py-3 rounded-lg text-sm font-semibold transition-colors duration-150 ${mode === "MANUAL" ? "bg-[#124540] text-white" : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900"}`}
            >
              Sablon Manual
            </button>
          </div>

          {mode === "MANUAL" && bisaPilihSistem && (
            <div className="bg-white dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                  Sistem Gesut
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  {sistemEfektif === "baru"
                    ? "Upah global per profesi + bonus warna ekstra."
                    : "Upah dari komposisi warna kecil/sedang/besar."}
                </p>
              </div>
              <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-lg w-full md:w-auto">
                {(
                  [
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
            </div>
          )}

          <div className="bg-white dark:bg-zinc-950 p-4 md:p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-5 md:space-y-6">
            {/* Qty & Harga Kaos digabung 2 kolom di semua ukuran layar */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-2">
                  Jumlah (Pcs)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatNumberDisplay(inputs.qty)}
                  onChange={(e) => handleInputChange(e, "qty")}
                  className="w-full text-lg md:text-xl font-mono tabular-nums font-semibold text-zinc-900 dark:text-white bg-transparent border-zinc-300 dark:border-zinc-700 border rounded-lg p-3 focus:ring-2 focus:ring-[#124540] outline-none placeholder-zinc-300 dark:placeholder-zinc-600 transition-colors duration-150"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-2">
                  Harga Kaos
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatRupiahDisplay(inputs.kaosPrice)}
                  onChange={(e) => handleInputChange(e, "kaosPrice")}
                  className="w-full text-lg md:text-xl font-mono tabular-nums font-semibold text-zinc-900 dark:text-white bg-transparent border-zinc-300 dark:border-zinc-700 border rounded-lg p-3 focus:ring-2 focus:ring-[#124540] outline-none placeholder-zinc-300 dark:placeholder-zinc-600 transition-colors duration-150"
                  placeholder="Rp 0"
                />
              </div>
            </div>

            {mode === "DTF" ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-2">
                    Lebar (cm)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatNumberDisplay(inputs.width)}
                    onChange={(e) => handleInputChange(e, "width")}
                    className="w-full text-lg md:text-xl font-mono tabular-nums font-semibold text-zinc-900 dark:text-white bg-transparent border-zinc-300 dark:border-zinc-700 border rounded-lg p-3 focus:ring-2 focus:ring-[#124540] outline-none placeholder-zinc-300 dark:placeholder-zinc-600 transition-colors duration-150"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-2">
                    Panjang (cm)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatNumberDisplay(inputs.length)}
                    onChange={(e) => handleInputChange(e, "length")}
                    className="w-full text-lg md:text-xl font-mono tabular-nums font-semibold text-zinc-900 dark:text-white bg-transparent border-zinc-300 dark:border-zinc-700 border rounded-lg p-3 focus:ring-2 focus:ring-[#124540] outline-none placeholder-zinc-300 dark:placeholder-zinc-600 transition-colors duration-150"
                    placeholder="0"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center gap-2 mb-3">
                    <Info className="w-4 h-4 text-[#124540]" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-700 dark:text-zinc-300">
                      Detail Warna
                    </span>
                  </div>

                  {sistemEfektif === "lama" ? (
                    <>
                      <div className="grid grid-cols-3 gap-3">
                        {(
                          [
                            ["colorsKecil", "KECIL", "KECIL (Logo/Label)"],
                            ["colorsSedang", "SEDANG", "SEDANG (A4)"],
                            ["colorsBesar", "BESAR", "BESAR (A3/Blok)"],
                          ] as [string, string, string][]
                        ).map(([field, short, long]) => (
                          <div key={field}>
                            <label className="block text-[10px] font-semibold uppercase text-zinc-500 dark:text-zinc-400 mb-1 text-left truncate">
                              <span className="md:hidden">{short}</span>
                              <span className="hidden md:inline">{long}</span>
                            </label>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={formatNumberDisplay(
                                (inputs as any)[field],
                              )}
                              onChange={(e) => handleInputChange(e, field)}
                              className="w-full font-mono tabular-nums font-semibold text-zinc-900 dark:text-white bg-transparent border-zinc-300 dark:border-zinc-700 border rounded-lg p-2 text-sm focus:ring-2 focus:ring-[#124540] outline-none text-center transition-colors duration-150"
                              placeholder="0"
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-2">
                        Total Warna (Screen)
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatNumberDisplay(inputs.totalColors)}
                        onChange={(e) => handleInputChange(e, "totalColors")}
                        className="w-full text-lg md:text-xl font-mono tabular-nums font-semibold text-zinc-900 dark:text-white bg-transparent border-zinc-300 dark:border-zinc-700 border rounded-lg p-3 focus:ring-2 focus:ring-[#124540] outline-none placeholder-zinc-300 dark:placeholder-zinc-600 transition-colors duration-150"
                        placeholder="0"
                      />
                      <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                        Normal sampai {config.batas_warna_normal ?? 4} warna.
                        Lebih dari itu kena bonus kompleksitas.
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            <hr className="border-zinc-200 dark:border-zinc-800" />

            {/* Pembulatan harga jual: selalu ke atas, tidak pernah merugikan */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                  Pembulatan Harga
                </label>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Selalu ke atas
                </span>
              </div>
              <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-lg">
                {OPSI_PEMBULATAN.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRoundStep(opt.value)}
                    className={`flex-1 px-3 py-2 rounded-md text-sm font-semibold transition-colors duration-150 ${
                      roundStep === opt.value
                        ? "bg-white dark:bg-zinc-950 text-[#124540] dark:text-[#49BFB4] shadow-sm"
                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <hr className="border-zinc-200 dark:border-zinc-800" />

            {/* Addon: accordion collapsed by default supaya tidak menambah panjang scroll */}
            <div>
              <button
                type="button"
                onClick={() => setAddonsOpen(!addonsOpen)}
                className="w-full flex items-center justify-between"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 cursor-pointer">
                  Tambahan / Bonus
                </label>
                <span className="flex items-center gap-2">
                  {selectedAddonIds.length > 0 && (
                    <span className="font-mono tabular-nums text-[11px] px-2.5 py-1 rounded-full border border-zinc-300/70 dark:border-zinc-700 bg-white/80 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300">
                      {selectedAddonIds.length} dipilih
                    </span>
                  )}
                  {addonsOpen ? (
                    <ChevronUp className="w-4 h-4 text-zinc-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-zinc-400" />
                  )}
                </span>
              </button>

              {addonsOpen && (
                <div className="grid grid-cols-1 gap-2 mt-3">
                  {addons.length === 0 ? (
                    <p className="text-sm text-zinc-400 dark:text-zinc-600 italic">
                      Tidak ada opsi bonus aktif.
                    </p>
                  ) : (
                    addons.map((addon) => (
                      <label
                        key={addon.id}
                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors duration-150 ${selectedAddonIds.includes(addon.id) ? "bg-white dark:bg-zinc-950 border-[#124540]/50" : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900"}`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={selectedAddonIds.includes(addon.id)}
                            onChange={() => toggleAddon(addon.id)}
                            className="w-5 h-5 rounded accent-[#124540] border-zinc-300 dark:border-zinc-700 bg-transparent"
                          />
                          <span className="font-medium text-sm text-zinc-700 dark:text-zinc-300">
                            {addon.name}
                          </span>
                        </div>
                        <span className="text-xs font-mono tabular-nums font-semibold text-zinc-500 dark:text-zinc-400">
                          +Rp {Number(addon.cost).toLocaleString("id-ID")}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* PANEL KANAN: HASIL (desktop only, tampil di samping) — pakai treatment hero panel */}
      <div
        className={`hidden md:flex md:w-1/3 p-6 md:p-10 flex-col justify-center border-t md:border-t-0 md:border-l border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-100/80 dark:bg-zinc-900/90 shadow-sm transition-colors duration-150`}
      >
        <div className="max-w-sm mx-auto w-full">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400 mb-1">
            Rekomendasi Harga Jual
          </p>
          <div
            className={`text-4xl md:text-5xl font-mono tabular-nums font-semibold mb-2 tracking-tight truncate transition-colors duration-150 ${showResult ? "text-zinc-900 dark:text-white" : "text-zinc-400 dark:text-zinc-600"}`}
          >
            {showResult ? formatResult(roundedPrice) : "Rp -"}
            <span
              className={`text-lg font-normal ml-1 ${showResult ? "text-zinc-500 dark:text-zinc-400" : "text-zinc-400 dark:text-zinc-700"}`}
            >
              /pcs
            </span>
          </div>

          {showResult ? (
            <div className="mt-6 space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-6">
              {resultDetails}
            </div>
          ) : (
            <div className="mt-6 pt-6 border-t border-zinc-200/70 dark:border-zinc-800/70">
              <p className="text-sm text-zinc-500 dark:text-zinc-400 italic">
                Silakan lengkapi input (Qty, Ukuran, atau Warna) untuk melihat
                estimasi harga.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* STICKY BOTTOM BAR: mobile only, selalu terlihat tanpa scroll */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-zinc-100 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 px-4 py-3 safe-area-bottom">
        <button
          type="button"
          onClick={() => showResult && setDetailSheetOpen(true)}
          className="w-full flex items-center justify-between"
          style={{ WebkitTapHighlightColor: "transparent" }}
          disabled={!showResult}
        >
          <div className="text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              Harga Jual /pcs
            </p>
            <p
              className={`text-xl font-mono tabular-nums font-semibold ${showResult ? "text-zinc-900 dark:text-white" : "text-zinc-400 dark:text-zinc-600"}`}
            >
              {showResult ? formatResult(roundedPrice) : "Rp -"}
            </p>
          </div>
          {showResult && (
            <span className="flex items-center gap-1 text-xs font-semibold text-[#2589ff]">
              Rincian <ChevronUp className="w-4 h-4" />
            </span>
          )}
        </button>
      </div>

      {/* BOTTOM SHEET: rincian harga lengkap di mobile */}
      {detailSheetOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-zinc-950/40"
            onClick={() => setDetailSheetOpen(false)}
          />
          <div className="relative bg-white dark:bg-zinc-950 rounded-t-xl border-t border-zinc-200 dark:border-zinc-800 px-5 pt-4 pb-8 max-h-[75vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                Rincian Harga
              </p>
              <button
                onClick={() => setDetailSheetOpen(false)}
                className="p-1.5 rounded-md text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors duration-150"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mb-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400 mb-1">
                Rekomendasi Harga Jual
              </p>
              <p className="text-3xl font-mono tabular-nums font-semibold text-zinc-900 dark:text-white">
                {formatResult(roundedPrice)}
                <span className="text-base font-normal text-zinc-500 dark:text-zinc-400 ml-1">
                  /pcs
                </span>
              </p>
            </div>
            <div className="space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-4">
              {resultDetails}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}