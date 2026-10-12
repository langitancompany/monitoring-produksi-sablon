"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { finFetch, errMsg } from "@/hooks/useFinanceApi";
import type { FinCaps } from "@/lib/finance/caps";
import type { TodoData } from "@/lib/finance/types";
import {
  FAQ,
  FREQ_LABEL,
  FREQ_PERIOD_HINT,
  RULES,
  pruneDone,
  taskKey,
  tasksFor,
  type Freq,
  type GuideTarget,
  type GuideTask,
} from "@/lib/finance/guideTasks";
import { cardCls } from "../ui";
import { formatRupiah } from "../utils";

const FREQS: Freq[] = ["daily", "weekly", "monthly"];

/**
 * Tiga tingkat ukuran huruf. Bawaan "Besar" (index 1). Pilihan diingat di perangkat ini.
 * Semua kelas ditulis lengkap agar terbaca oleh Tailwind.
 */
const SIZES = [
  { label: "Normal", h1: "text-lg", lead: "text-sm", label_: "text-xs", cardTitle: "text-sm", big: "text-2xl", small: "text-sm", title: "text-sm", body: "text-sm", btn: "text-sm", chip: "text-xs" },
  { label: "Besar", h1: "text-xl", lead: "text-base", label_: "text-sm", cardTitle: "text-base", big: "text-3xl", small: "text-sm", title: "text-base", body: "text-base", btn: "text-sm", chip: "text-sm" },
  { label: "Sangat besar", h1: "text-2xl", lead: "text-lg", label_: "text-base", cardTitle: "text-lg", big: "text-4xl", small: "text-base", title: "text-lg", body: "text-lg", btn: "text-base", chip: "text-base" },
] as const;
const SIZE_KEY = "fin-guide:size:v1";
const DEFAULT_SIZE = 1;

const btnCls = (z: (typeof SIZES)[number]) =>
  `inline-flex items-center justify-center min-h-10 px-4 rounded-md bg-[#124540] hover:bg-[#0d332f] text-white font-semibold transition-colors duration-150 ${z.btn}`;

type Tone = "neutral" | "amber" | "red";
const TONE_CLS: Record<Tone, string> = {
  neutral: "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950",
  amber: "border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30",
  red: "border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30",
};

/**
 * Tab Panduan: pegangan kerja admin Keuangan.
 *  - "Perlu tindakan sekarang": angka langsung dari data (antrean, piutang telat, order belum ditagih)
 *  - Tugas harian/mingguan/bulanan yang bisa dicentang (disimpan di perangkat ini, reset otomatis per periode)
 *  - Aturan penting dan tanya-jawab singkat
 */
export default function GuideTab({
  caps,
  version,
  userKey,
  onGo,
}: {
  caps: FinCaps;
  version: number;
  /** id pengguna, supaya centang tidak tercampur bila satu browser dipakai bergantian */
  userKey: string;
  onGo: (tab: GuideTarget, opts?: { pending?: boolean }) => void;
}) {
  const STORAGE = `fin-guide:v1:${userKey}`;
  const [todo, setTodo] = useState<TodoData | null>(null);
  const [todoError, setTodoError] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, true>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [level, setLevel] = useState(DEFAULT_SIZE);
  const z = SIZES[level];
  const labelCls = `${z.label_} font-semibold uppercase tracking-[0.1em] text-zinc-500 dark:text-zinc-400`;

  useEffect(() => {
    try {
      const v = Number(window.localStorage.getItem(SIZE_KEY));
      if (Number.isInteger(v) && v >= 0 && v < SIZES.length) setLevel(v);
    } catch {
      /* penyimpanan tidak tersedia: pakai ukuran bawaan */
    }
  }, []);

  const changeSize = (i: number) => {
    setLevel(i);
    try {
      window.localStorage.setItem(SIZE_KEY, String(i));
    } catch {
      /* abaikan */
    }
  };

  const tasks = useMemo(() => tasksFor(caps), [caps]);

  const loadTodo = useCallback(async () => {
    try {
      setTodo(await finFetch<TodoData>("/api/finance/todo"));
      setTodoError(null);
    } catch (e) {
      setTodoError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    void loadTodo();
  }, [loadTodo, version]);

  // Muat centang dari perangkat ini; centang periode lama dibuang (hari/minggu/bulan sudah lewat).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE);
      const parsed = raw ? JSON.parse(raw) : {};
      setDone(pruneDone(parsed && typeof parsed === "object" ? parsed : {}, tasks));
    } catch {
      setDone({});
    }
  }, [STORAGE, tasks]);

  const toggle = (t: GuideTask) => {
    const k = taskKey(t);
    const next = { ...done };
    if (next[k]) delete next[k];
    else next[k] = true;
    setDone(next);
    try {
      window.localStorage.setItem(STORAGE, JSON.stringify(next));
    } catch {
      /* penyimpanan tidak tersedia: centang hanya berlaku selama halaman terbuka */
    }
  };

  const cards: {
    key: string;
    label: string;
    count: number;
    sub: string;
    tone: Tone;
    go: { tab: GuideTarget; pending?: boolean } | null;
    note: string;
  }[] = todo
    ? [
        {
          key: "pay",
          label: "Pembayaran menunggu verifikasi",
          count: todo.pending_payments.count,
          sub:
            todo.pending_payments.count > 0
              ? `${formatRupiah(todo.pending_payments.amount)}${todo.pending_payments.oldest_days != null ? ` · tertua ${todo.pending_payments.oldest_days} hari` : ""}`
              : "Antrean kosong",
          tone: todo.pending_payments.count > 0 ? "amber" : "neutral",
          go: caps.edit ? { tab: "verify" } : null,
          note: "Diproses bagian verifikasi",
        },
        {
          key: "exp",
          label: "Pengeluaran menunggu persetujuan",
          count: todo.pending_expenses.count,
          sub:
            todo.pending_expenses.count > 0
              ? `${formatRupiah(todo.pending_expenses.amount)}${todo.pending_expenses.oldest_days != null ? ` · tertua ${todo.pending_expenses.oldest_days} hari` : ""}`
              : "Antrean kosong",
          tone: todo.pending_expenses.count > 0 ? "amber" : "neutral",
          go: caps.edit ? { tab: "expenses", pending: true } : null,
          note: "Diproses bagian verifikasi",
        },
        {
          key: "overdue",
          label: "Tagihan lewat jatuh tempo",
          count: todo.overdue.count,
          sub: todo.overdue.count > 0 ? `Sisa ${formatRupiah(todo.overdue.amount)}` : "Tidak ada yang menunggak",
          tone: todo.overdue.count > 0 ? "red" : "neutral",
          go: { tab: "invoices" },
          note: "",
        },
        {
          key: "unbilled",
          label: "Order belum ditagih (30 hari terakhir)",
          count: todo.unbilled_recent.count,
          sub: todo.unbilled_recent.count > 0 ? "Belum punya tagihan" : "Semua sudah ditagih",
          tone: todo.unbilled_recent.count > 0 ? "amber" : "neutral",
          go: caps.create ? { tab: "invoices" } : null,
          note: "Ditagih oleh admin pencatat",
        },
      ]
    : [];

  const roles = [
    caps.isSupervisor && "Supervisor",
    caps.create && "Pencatat",
    caps.edit && "Verifikator",
    caps.delete && "Hak Void",
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-6 md:space-y-8">
      <div>
        <h2 className={`${z.h1} font-semibold text-zinc-900 dark:text-zinc-100`}>Panduan dan tugas admin Keuangan</h2>
        <p className={`${z.lead} text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed`}>
          Pegangan kerja agar tidak ada yang terlewat. Angka di bagian &ldquo;Perlu tindakan&rdquo; diambil langsung dari data.
          Centang tugas disimpan di perangkat ini dan kembali kosong tiap hari, minggu, dan bulan.
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`${z.small} text-zinc-500 dark:text-zinc-400`}>Peran Anda:</span>
            {(roles.length ? roles : ["Hanya melihat"]).map((r) => (
              <span
                key={r}
                className={`${z.chip} font-semibold px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300`}
              >
                {r}
              </span>
            ))}
          </div>
          <div role="radiogroup" aria-label="Ukuran huruf" className="flex flex-wrap items-center gap-2">
            <span className={`${z.small} text-zinc-500 dark:text-zinc-400`}>Ukuran huruf:</span>
            {SIZES.map((sz, i) => (
              <button
                key={sz.label}
                type="button"
                role="radio"
                aria-checked={level === i}
                onClick={() => changeSize(i)}
                className={`min-h-9 px-3 rounded-md border font-semibold transition-colors duration-150 ${z.small} ${
                  level === i
                    ? "bg-[#124540] border-[#124540] text-white dark:bg-[#49bfb4] dark:border-[#49bfb4] dark:text-zinc-950"
                    : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                }`}
              >
                {sz.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section>
        <p className={`${labelCls} mb-3`}>Perlu tindakan sekarang</p>
        {todoError && <p className={`${z.small} text-red-600 dark:text-red-400`}>{todoError}</p>}
        {!todo && !todoError && <p className={`${z.small} text-zinc-500 dark:text-zinc-400`}>Memuat…</p>}
        {todo && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            {cards.map((c) => (
              <div key={c.key} className={`rounded-xl border p-4 md:p-5 flex flex-col ${TONE_CLS[c.tone]}`}>
                <p className={`${z.cardTitle} font-semibold text-zinc-800 dark:text-zinc-200 leading-snug`}>{c.label}</p>
                <p className={`${z.big} font-semibold font-mono tabular-nums text-zinc-900 dark:text-zinc-100 mt-2`}>{c.count}</p>
                <p className={`${z.small} text-zinc-600 dark:text-zinc-400 mt-1 flex-1`}>{c.sub}</p>
                {c.count > 0 && c.go && (
                  <button onClick={() => onGo(c.go!.tab, { pending: c.go!.pending })} className={`${btnCls(z)} mt-4 self-start`}>
                    Buka
                  </button>
                )}
                {c.count > 0 && !c.go && c.note && <p className={`${z.small} text-zinc-500 mt-4`}>{c.note}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      {FREQS.map((freq) => {
        const list = tasks.filter((t) => t.freq === freq);
        if (list.length === 0) return null;
        const doneCount = list.filter((t) => done[taskKey(t)]).length;
        return (
          <section key={freq}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3">
              <p className={labelCls}>Tugas {FREQ_LABEL[freq].toLowerCase()}</p>
              <p className={`${z.small} text-zinc-600 dark:text-zinc-400`}>
                <span className="font-mono tabular-nums font-semibold text-zinc-800 dark:text-zinc-100">
                  {doneCount}/{list.length}
                </span>{" "}
                selesai {FREQ_PERIOD_HINT[freq]}
              </p>
            </div>
            <ul className="space-y-3">
              {list.map((t) => {
                const isDone = !!done[taskKey(t)];
                const isOpen = openId === t.id;
                return (
                  <li key={t.id} className={cardCls}>
                    <div className="flex items-start gap-3 md:gap-4 p-4 md:p-5">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={isDone}
                        aria-label={`Tandai selesai: ${t.title}`}
                        onClick={() => toggle(t)}
                        className={`mt-0.5 w-6 h-6 shrink-0 rounded border-2 flex items-center justify-center transition-colors duration-150 ${
                          isDone
                            ? "bg-[#124540] border-[#124540] text-white dark:bg-[#49bfb4] dark:border-[#49bfb4] dark:text-zinc-950"
                            : "border-zinc-300 dark:border-zinc-600 hover:border-zinc-500"
                        }`}
                      >
                        {isDone && <Check className="w-4 h-4" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => setOpenId(isOpen ? null : t.id)}
                          aria-expanded={isOpen}
                          className="w-full text-left flex items-start justify-between gap-3"
                        >
                          <span
                            className={`${z.title} font-semibold leading-snug ${isDone ? "line-through text-zinc-400" : "text-zinc-900 dark:text-zinc-100"}`}
                          >
                            {t.title}
                          </span>
                          <span className="text-zinc-400 shrink-0 mt-0.5">
                            {isOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                          </span>
                        </button>
                        {isOpen && (
                          <div className="mt-3 space-y-3">
                            <p className={`${z.small} text-zinc-600 dark:text-zinc-400 leading-relaxed`}>{t.why}</p>
                            <ol className={`list-decimal pl-5 space-y-2 ${z.body} text-zinc-800 dark:text-zinc-200 leading-relaxed`}>
                              {t.steps.map((st) => (
                                <li key={st}>{st}</li>
                              ))}
                            </ol>
                            {t.outside && <p className={`${z.small} text-zinc-500 italic`}>{t.outside}</p>}
                            {t.go && (
                              <button onClick={() => onGo(t.go!.tab, { pending: t.go!.pending })} className={`${btnCls(z)} mt-1`}>
                                {t.go.label}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <section className={`${cardCls} overflow-hidden`}>
        <div className="px-4 md:px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <p className={labelCls}>Aturan yang tidak boleh dilupakan</p>
        </div>
        <ul className="p-4 md:p-6 space-y-3">
          {RULES.map((r) => (
            <li key={r} className={`flex gap-3 ${z.body} text-zinc-800 dark:text-zinc-200 leading-relaxed`}>
              <span className="text-[#124540] dark:text-[#49bfb4] font-bold">•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${cardCls} overflow-hidden`}>
        <div className="px-4 md:px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <p className={labelCls}>Pertanyaan yang sering muncul</p>
        </div>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {FAQ.map((f) => (
            <details key={f.q} className="group px-4 md:px-6 py-4">
              <summary
                className={`cursor-pointer list-none flex items-center justify-between gap-3 ${z.title} font-semibold text-zinc-900 dark:text-zinc-100 [&::-webkit-details-marker]:hidden`}
              >
                {f.q}
                <ChevronRight className="w-5 h-5 text-zinc-400 shrink-0 transition-transform duration-150 group-open:rotate-90" />
              </summary>
              <p className={`${z.body} text-zinc-700 dark:text-zinc-300 leading-relaxed mt-3`}>{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
