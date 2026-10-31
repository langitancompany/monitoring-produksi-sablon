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

const btnCls =
  "inline-flex items-center justify-center min-h-9 px-3.5 rounded-md bg-[#124540] hover:bg-[#0d332f] text-white text-xs font-semibold transition-colors duration-150";

/** Label bagian: ukuran sama dengan label di tab Keuangan lain. */
const sectionLabelCls =
  "text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400";

type Tone = "neutral" | "amber" | "red";
const TONE_CLS: Record<Tone, string> = {
  neutral: "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950",
  amber:
    "border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30",
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
      setDone(
        pruneDone(parsed && typeof parsed === "object" ? parsed : {}, tasks),
      );
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
          go: caps.approver ? { tab: "verify" } : null,
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
          go: caps.approver ? { tab: "expenses", pending: true } : null,
          note: "Diproses bagian verifikasi",
        },
        {
          key: "overdue",
          label: "Tagihan lewat jatuh tempo",
          count: todo.overdue.count,
          sub:
            todo.overdue.count > 0
              ? `Sisa ${formatRupiah(todo.overdue.amount)}`
              : "Tidak ada yang menunggak",
          tone: todo.overdue.count > 0 ? "red" : "neutral",
          go: { tab: "invoices" },
          note: "",
        },
        {
          key: "unbilled",
          label: "Order belum ditagih (30 hari terakhir)",
          count: todo.unbilled_recent.count,
          sub:
            todo.unbilled_recent.count > 0
              ? "Belum punya tagihan"
              : "Semua sudah ditagih",
          tone: todo.unbilled_recent.count > 0 ? "amber" : "neutral",
          go: caps.maker ? { tab: "invoices" } : null,
          note: "Ditagih oleh admin pencatat",
        },
      ]
    : [];

  const roles = [
    caps.isSuperAdmin && "Super Admin",
    caps.maker && "Maker (pencatat)",
    caps.approver && "Approver (verifikator)",
    caps.delete && "Hak Void",
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Panduan dan tugas admin Keuangan
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
          Pegangan kerja agar tidak ada yang terlewat. Angka di bagian
          &ldquo;Perlu tindakan&rdquo; diambil langsung dari data. Centang tugas
          disimpan di perangkat ini dan kembali kosong tiap hari, minggu, dan
          bulan.
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Peran Anda:
          </span>
          {(roles.length ? roles : ["Hanya melihat"]).map((r) => (
            <span
              key={r}
              className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300"
            >
              {r}
            </span>
          ))}
        </div>
      </div>

      <section>
        <p className={`${sectionLabelCls} mb-2`}>Perlu tindakan sekarang</p>
        {todoError && (
          <p className="text-sm text-red-600 dark:text-red-400">{todoError}</p>
        )}
        {!todo && !todoError && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Memuat…</p>
        )}
        {todo && (
          // Satu baris: 4 kolom sama lebar di layar sedang ke atas; di HP digeser ke samping (tidak turun ke baris baru).
          <div className="flex md:grid md:grid-cols-4 gap-3 overflow-x-auto md:overflow-visible snap-x snap-mandatory -mx-1 px-1 pb-1">
            {cards.map((c) => (
              <div
                key={c.key}
                className={`rounded-xl border p-3.5 flex flex-col min-w-[210px] md:min-w-0 flex-1 snap-start ${TONE_CLS[c.tone]}`}
              >
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 leading-snug min-h-[2rem]">
                  {c.label}
                </p>
                <p className="text-2xl font-semibold font-mono tabular-nums text-zinc-900 dark:text-zinc-100 mt-1.5">
                  {c.count}
                </p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 flex-1">
                  {c.sub}
                </p>
                {c.count > 0 && c.go && (
                  <button
                    onClick={() => onGo(c.go!.tab, { pending: c.go!.pending })}
                    className={`${btnCls} mt-3 self-start`}
                  >
                    Buka
                  </button>
                )}
                {c.count > 0 && !c.go && c.note && (
                  <p className="text-xs text-zinc-500 mt-3">{c.note}</p>
                )}
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
              <p className={sectionLabelCls}>
                Tugas {FREQ_LABEL[freq].toLowerCase()}
              </p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                <span className="font-mono tabular-nums font-semibold text-zinc-800 dark:text-zinc-100">
                  {doneCount}/{list.length}
                </span>{" "}
                selesai {FREQ_PERIOD_HINT[freq]}
              </p>
            </div>
            <ul className="space-y-2">
              {list.map((t) => {
                const isDone = !!done[taskKey(t)];
                const isOpen = openId === t.id;
                return (
                  <li key={t.id} className={cardCls}>
                    <div className="flex items-start gap-3 p-3.5 md:p-4">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={isDone}
                        aria-label={`Tandai selesai: ${t.title}`}
                        onClick={() => toggle(t)}
                        className={`mt-0.5 w-5 h-5 shrink-0 rounded border-2 flex items-center justify-center transition-colors duration-150 ${
                          isDone
                            ? "bg-[#124540] border-[#124540] text-white dark:bg-[#49bfb4] dark:border-[#49bfb4] dark:text-zinc-950"
                            : "border-zinc-300 dark:border-zinc-600 hover:border-zinc-500"
                        }`}
                      >
                        {isDone && <Check className="w-3.5 h-3.5" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => setOpenId(isOpen ? null : t.id)}
                          aria-expanded={isOpen}
                          className="w-full text-left flex items-start justify-between gap-3"
                        >
                          <span
                            className={`text-sm font-semibold leading-snug ${isDone ? "line-through text-zinc-400" : "text-zinc-900 dark:text-zinc-100"}`}
                          >
                            {t.title}
                          </span>
                          <span className="text-zinc-400 shrink-0 mt-0.5">
                            {isOpen ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </span>
                        </button>
                        {isOpen && (
                          <div className="mt-3 space-y-3">
                            <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                              {t.why}
                            </p>
                            <ol className="list-decimal pl-5 space-y-1.5 text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed">
                              {t.steps.map((st) => (
                                <li key={st}>{st}</li>
                              ))}
                            </ol>
                            {t.outside && (
                              <p className="text-xs text-zinc-500 italic">
                                {t.outside}
                              </p>
                            )}
                            {t.go && (
                              <button
                                onClick={() =>
                                  onGo(t.go!.tab, { pending: t.go!.pending })
                                }
                                className={`${btnCls} mt-1`}
                              >
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
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <p className={sectionLabelCls}>Aturan yang tidak boleh dilupakan</p>
        </div>
        <ul className="p-4 space-y-2">
          {RULES.map((r) => (
            <li
              key={r}
              className="flex gap-3 text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed"
            >
              <span className="text-[#124540] dark:text-[#49bfb4] font-bold">
                •
              </span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${cardCls} overflow-hidden`}>
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <p className={sectionLabelCls}>Pertanyaan yang sering muncul</p>
        </div>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {FAQ.map((f) => (
            <details key={f.q} className="group px-4 py-3">
              <summary
                className={`cursor-pointer list-none flex items-center justify-between gap-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100 [&::-webkit-details-marker]:hidden`}
              >
                {f.q}
                <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0 transition-transform duration-150 group-open:rotate-90" />
              </summary>
              <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed mt-2">
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
