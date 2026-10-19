"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { finFetch, errMsg } from "@/hooks/useFinanceApi";
import { AUDIT_ACTION_LABEL, AUDIT_ENTITIES, AUDIT_ENTITY_LABEL, type AuditRow } from "@/lib/finance/types";
import { FilterField, filterInputCls, toolbarCls, SearchInput, cardCls } from "../ui";
import { formatDateTime, monthStartYmd, todayYmd } from "../utils";

const MAX_JSON = 1500;
const pretty = (v: unknown) => {
  if (v == null) return null;
  const s = JSON.stringify(v, null, 2);
  return s.length > MAX_JSON ? `${s.slice(0, MAX_JSON)}\n… (dipotong)` : s;
};

/** Log audit keuangan (hanya Super Admin). Hanya-baca; log tidak bisa diubah atau dihapus di database. */
export default function AuditTab({ version }: { version: number }) {
  const [from, setFrom] = useState(monthStartYmd());
  const [to, setTo] = useState(todayYmd());
  const [entity, setEntity] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ limit: "300" });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (entity) p.set("entity", entity);
    try {
      const r = await finFetch<{ rows: AuditRow[]; truncated: boolean }>(`/api/finance/audit?${p}`);
      setRows(r.rows);
      setTruncated(r.truncated);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [from, to, entity]);

  useEffect(() => {
    void load();
  }, [load, version]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows ?? [];
    return (rows ?? []).filter((r) =>
      [r.actor_name, AUDIT_ACTION_LABEL[r.action] ?? r.action, r.order_kode, r.reason]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    );
  }, [rows, q]);

  return (
    <div className="space-y-4 md:space-y-5">
      <div className={toolbarCls}>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-end gap-3 md:gap-4">
          <FilterField label="Dari">
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={filterInputCls} />
          </FilterField>
          <FilterField label="Sampai">
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={filterInputCls} />
          </FilterField>
          <FilterField label="Jenis" className="col-span-2 sm:col-span-1">
            <select value={entity} onChange={(e) => setEntity(e.target.value)} className={filterInputCls}>
              <option value="">Semua</option>
              {AUDIT_ENTITIES.map((k) => (
                <option key={k} value={k}>{AUDIT_ENTITY_LABEL[k]}</option>
              ))}
            </select>
          </FilterField>
          <div className="col-span-2 sm:flex-1 sm:min-w-[12rem]">
            <FilterField label="Cari">
              <SearchInput value={q} onChange={setQ} placeholder="Pelaku, aksi, kode order, alasan…" />
            </FilterField>
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {!rows && !error && <p className="text-xs text-zinc-500 dark:text-zinc-400">Memuat…</p>}

      {rows && (
        <>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-mono tabular-nums">{filtered.length}</span> catatan
            {truncated && " · menampilkan 300 terbaru, persempit rentang tanggal untuk melihat yang lebih lama"}
          </p>
          {filtered.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-12">Tidak ada catatan pada filter ini.</p>
          ) : (
            <div className={`${cardCls} divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden`}>
              {filtered.map((r) => {
                const isOpen = open === r.id;
                const before = pretty(r.before);
                const after = pretty(r.after);
                const hasDetail = !!before || !!after;
                return (
                  <div key={r.id} className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => hasDetail && setOpen(isOpen ? null : r.id)}
                      className={`w-full text-left flex items-start gap-3 ${hasDetail ? "cursor-pointer" : "cursor-default"}`}
                    >
                      <span className="mt-0.5 text-zinc-400 shrink-0 w-4">
                        {hasDetail ? isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                            {AUDIT_ACTION_LABEL[r.action] ?? r.action}
                          </span>
                          {r.order_kode && <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">{r.order_kode}</span>}
                        </span>
                        <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                          {r.actor_name ?? "Sistem"} · {formatDateTime(r.at)}
                        </span>
                        {r.reason && <span className="block text-[11px] text-zinc-600 dark:text-zinc-300 mt-1">Alasan: {r.reason}</span>}
                      </span>
                    </button>
                    {isOpen && hasDetail && (
                      <div className="mt-3 ml-7 grid grid-cols-1 md:grid-cols-2 gap-3">
                        {before && (
                          <div>
                            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.12em] mb-1">Sebelum</p>
                            <pre className="text-[10px] leading-relaxed bg-zinc-50 dark:bg-zinc-900 rounded-md p-2 overflow-x-auto text-zinc-700 dark:text-zinc-300">{before}</pre>
                          </div>
                        )}
                        {after && (
                          <div>
                            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.12em] mb-1">Sesudah</p>
                            <pre className="text-[10px] leading-relaxed bg-zinc-50 dark:bg-zinc-900 rounded-md p-2 overflow-x-auto text-zinc-700 dark:text-zinc-300">{after}</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
