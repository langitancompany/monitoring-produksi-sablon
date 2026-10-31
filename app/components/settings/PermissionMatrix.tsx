// app/components/settings/PermissionMatrix.tsx
// Matriks hak akses modul (toggle) + modal "Tambah Akses Modul".
// Menggantikan PermissionTable lama. Logika izinnya ada di lib/permissionModules.ts.
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Layers, Trash2, X } from "lucide-react";
import type { UserPermissions } from "@/types";
import {
  MODULE_DEFS,
  PERM_COLUMNS,
  getField,
  grantedModules,
  revokeModule,
  setField,
  type CanGrant,
  type InitialGrant,
  type ModuleDef,
  type PermColumn,
  type PermKey,
} from "@/lib/permissionModules";

// ─── Switch ──────────────────────────────────────────────────────────────────

export function Switch({
  checked,
  onChange,
  disabled,
  title,
  label,
}: {
  checked: boolean;
  onChange?: () => void;
  disabled?: boolean;
  title?: string;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#124540] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-zinc-950 ${
        checked ? "bg-[#124540]" : "bg-zinc-200 dark:bg-zinc-700"
      } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-150 ${
          checked ? "translate-x-[18px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}

const COLUMN_HEAD: Record<PermColumn, string> = {
  maker: "Maker",
  approver: "Approver",
  create: "Buat",
  edit: "Ubah",
  delete: "Hapus",
};

const thCls =
  "px-3 py-3 text-center text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] border-b border-zinc-200 dark:border-zinc-800";

// ─── Matriks ─────────────────────────────────────────────────────────────────

export function PermissionMatrix({
  permissions,
  onChange,
  allGranted = false,
  readOnly = false,
  canGrant,
}: {
  permissions: UserPermissions;
  onChange: (next: UserPermissions) => void;
  /** Super Admin: semua modul & izin aktif otomatis, tidak bisa diubah. */
  allGranted?: boolean;
  /** Hanya dibaca (Admin melihat izin akunnya sendiri). */
  readOnly?: boolean;
  /** Boleh MENYALAKAN izin ini? false → toggle mati dibekukan (mematikan selalu boleh). */
  canGrant?: CanGrant;
}) {
  const rows: ModuleDef[] = allGranted ? MODULE_DEFS : grantedModules(permissions);

  const reasonFor = (key: PermKey, field: string, current: boolean): string | undefined => {
    if (allGranted) return "Super Admin selalu punya akses ini";
    if (readOnly) return "Anda tidak bisa mengubah izin akun Anda sendiri";
    if (!current && canGrant && !canGrant(key, field))
      return "Anda tidak punya izin ini, jadi tidak bisa memberikannya";
    return undefined;
  };

  if (rows.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <Layers className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-700" />
        <p className="mt-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Belum ada akses modul</p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Klik “Tambah Akses Modul” untuk memberi akses ke modul tertentu.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse min-w-[620px]">
        <thead>
          <tr className="bg-zinc-50 dark:bg-zinc-900">
            <th className={`${thCls} !text-left w-[34%]`}>Modul</th>
            {PERM_COLUMNS.map((c) => (
              <th key={c} className={thCls}>
                {COLUMN_HEAD[c]}
              </th>
            ))}
            <th className={thCls}>Aksi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.map((d) => (
            <tr key={d.key} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/60 transition-colors duration-150">
              <td className="px-3 py-3 align-middle">
                <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{d.label}</span>
                {d.extras?.map((x) => {
                  const cur = allGranted || getField(permissions, d.key, x.field);
                  const why = reasonFor(d.key, x.field, cur);
                  return (
                    <label
                      key={x.field}
                      title={why ?? x.hint}
                      className={`mt-1.5 flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 ${
                        why ? "cursor-not-allowed" : "cursor-pointer"
                      }`}
                    >
                      <Switch
                        label={`${d.label}: ${x.label}`}
                        checked={cur}
                        disabled={!!why}
                        title={why ?? x.hint}
                        onChange={() => onChange(setField(permissions, d.key, x.field, !cur, canGrant))}
                      />
                      {x.label}
                    </label>
                  );
                })}
              </td>
              {PERM_COLUMNS.map((c) => {
                const hint = d.columns[c];
                if (hint === undefined) {
                  return (
                    <td key={c} className="px-3 py-3 text-center text-zinc-300 dark:text-zinc-700 select-none">
                      –
                    </td>
                  );
                }
                const cur = allGranted || getField(permissions, d.key, c);
                const why = reasonFor(d.key, c, cur);
                return (
                  <td key={c} className="px-3 py-3 text-center">
                    <Switch
                      label={`${d.label}: ${COLUMN_HEAD[c]}`}
                      checked={cur}
                      disabled={!!why}
                      title={why ?? hint}
                      onChange={() => onChange(setField(permissions, d.key, c, !cur, canGrant))}
                    />
                  </td>
                );
              })}
              <td className="px-3 py-3 text-center">
                {allGranted ? (
                  <span className="text-zinc-300 dark:text-zinc-700 select-none">–</span>
                ) : (
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => onChange(revokeModule(permissions, d.key))}
                    title={readOnly ? "Anda tidak bisa mengubah izin akun Anda sendiri" : `Cabut akses ${d.label}`}
                    aria-label={`Cabut akses ${d.label}`}
                    className="p-1.5 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors duration-150"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Modal: Tambah Akses Modul ───────────────────────────────────────────────

const INITIAL_ROWS: { field: "create" | "edit" | "delete"; title: string; hint: string }[] = [
  { field: "create", title: "Buat Data (Create)", hint: "Izin menambah entri data baru" },
  { field: "edit", title: "Ubah Data (Update)", hint: "Izin mengedit data yang sudah ada" },
  { field: "delete", title: "Hapus Data (Delete)", hint: "Izin menghapus catatan data" },
];

export function AddModuleModal({
  available,
  onClose,
  onSubmit,
}: {
  /** Modul yang belum punya akses dan boleh diberikan oleh pengguna ini. */
  available: ModuleDef[];
  onClose: () => void;
  onSubmit: (keys: PermKey[], initial: InitialGrant) => void;
}) {
  const [selected, setSelected] = useState<PermKey[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showError, setShowError] = useState(false);
  const [initial, setInitial] = useState<InitialGrant>({
    create: true,
    edit: true,
    delete: true,
    maker: false,
    approver: false,
  });
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const labelOf = (k: PermKey) => available.find((d) => d.key === k)?.label ?? String(k);
  const options = useMemo(
    () =>
      available.filter(
        (d) => !selected.includes(d.key) && d.label.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [available, selected, query],
  );
  const allSelected = available.length > 0 && selected.length === available.length;
  const hasKeuangan = selected.includes("keuangan");

  // Tutup dropdown bila klik di luar
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Escape: tutup dropdown dulu, lalu modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (open) setOpen(false);
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const pick = (k: PermKey) => {
    setSelected((s) => [...s, k]);
    setQuery("");
    setShowError(false);
    inputRef.current?.focus();
  };
  const unpick = (k: PermKey) => setSelected((s) => s.filter((x) => x !== k));

  const submit = () => {
    if (selected.length === 0) {
      setShowError(true);
      setOpen(false);
      return;
    }
    onSubmit(selected, initial);
  };

  const err = showError && selected.length === 0;

  return (
    <div
      className="fixed inset-0 bg-black/70 z-99 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-module-title"
        className="bg-white dark:bg-zinc-950 rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto border border-zinc-200 dark:border-zinc-800 shadow-xl"
      >
        <div className="px-5 pt-5 pb-4 flex items-start gap-3 border-b border-zinc-100 dark:border-zinc-800">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-[#124540]/10 text-[#124540] dark:text-[#49BFB4] flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 id="add-module-title" className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Tambah Akses Modul
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Tetapkan hak akses modul dan perizinan awal untuk akun ini
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors duration-150"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {available.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Semua modul yang boleh Anda berikan sudah punya akses.
            </p>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Pilih Modul <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(allSelected ? [] : available.map((d) => d.key));
                      setShowError(false);
                    }}
                    className="text-xs font-semibold text-[#124540] dark:text-[#49BFB4] hover:underline"
                  >
                    {allSelected ? "Batal Pilih Semua" : "Pilih Semua"}
                  </button>
                </div>

                <div ref={boxRef} className="relative">
                  <div
                    onClick={() => {
                      setOpen(true);
                      inputRef.current?.focus();
                    }}
                    className={`flex items-center gap-1.5 min-h-[42px] rounded-lg border px-2 py-1.5 bg-white dark:bg-zinc-900 cursor-text transition-colors duration-150 ${
                      err
                        ? "border-red-300 ring-2 ring-red-100 dark:border-red-900 dark:ring-red-950"
                        : open
                          ? "border-[#124540] ring-2 ring-[#124540]/20"
                          : "border-zinc-200 dark:border-zinc-800"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                      {selected.map((k) => (
                        <span
                          key={k}
                          className="inline-flex items-center gap-1 rounded-md bg-[#124540]/15 text-[#124540] dark:bg-[#49BFB4]/20 dark:text-[#49BFB4] pl-2 pr-1 py-0.5 text-xs font-semibold"
                        >
                          {labelOf(k)}
                          <button
                            type="button"
                            aria-label={`Hapus ${labelOf(k)}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              unpick(k);
                            }}
                            className="p-0.5 rounded hover:bg-black/10"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => {
                          setQuery(e.target.value);
                          setOpen(true);
                        }}
                        onFocus={() => setOpen(true)}
                        onKeyDown={(e) => {
                          if (e.key === "Backspace" && query === "" && selected.length > 0) {
                            unpick(selected[selected.length - 1]);
                          } else if (e.key === "Enter") {
                            e.preventDefault();
                            if (options[0]) pick(options[0].key);
                          }
                        }}
                        placeholder={selected.length === 0 ? "Pilih satu atau beberapa modul..." : ""}
                        aria-label="Cari modul"
                        className="flex-1 min-w-[80px] bg-transparent outline-none text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 px-1 py-0.5"
                      />
                    </div>
                    {selected.length > 0 && (
                      <button
                        type="button"
                        aria-label="Kosongkan pilihan"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected([]);
                        }}
                        className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <span className="w-px self-stretch bg-zinc-200 dark:bg-zinc-800" />
                    <ChevronDown
                      className={`w-4 h-4 mx-1 text-zinc-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
                    />
                  </div>

                  {open && (
                    <ul
                      role="listbox"
                      className="absolute z-10 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-lg py-1"
                    >
                      {options.length === 0 ? (
                        <li className="px-3 py-2 text-xs text-zinc-400">
                          {selected.length === available.length ? "Semua modul sudah dipilih" : "Modul tidak ditemukan"}
                        </li>
                      ) : (
                        options.map((d) => (
                          <li
                            key={d.key}
                            role="option"
                            aria-selected={false}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pick(d.key)}
                            className="px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900"
                          >
                            {d.label}
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
                {err && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">Minimal pilih satu modul</p>}
              </div>

              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 p-4">
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-3">Izin Awal Modul</p>
                <div className="space-y-3">
                  {INITIAL_ROWS.map((r) => (
                    <div key={r.field} className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{r.title}</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{r.hint}</p>
                      </div>
                      <Switch
                        label={r.title}
                        checked={initial[r.field]}
                        onChange={() => setInitial((s) => ({ ...s, [r.field]: !s[r.field] }))}
                      />
                    </div>
                  ))}
                  {hasKeuangan && (
                    <>
                      <div className="border-t border-zinc-200 dark:border-zinc-800 pt-3">
                        <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em]">
                          Khusus Keuangan
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                          Keuangan memakai Maker dan Approver sebagai pengganti Buat/Ubah. Keduanya terpisah.
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Maker (Pembuat)</p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            Menerbitkan tagihan, mencatat pembayaran & pengeluaran
                          </p>
                        </div>
                        <Switch
                          label="Keuangan: Maker"
                          checked={initial.maker}
                          onChange={() => setInitial((s) => ({ ...s, maker: !s.maker }))}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                            Approver (Pemverifikasi)
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            Memverifikasi atau menolak pembayaran & pengeluaran
                          </p>
                        </div>
                        <Switch
                          label="Keuangan: Approver"
                          checked={initial.approver}
                          onChange={() => setInitial((s) => ({ ...s, approver: !s.approver }))}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150"
          >
            Batalkan
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={available.length === 0}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${
              selected.length === 0 ? "bg-[#124540]/50 hover:bg-[#124540]/60" : "bg-[#124540] hover:bg-[#0d332f]"
            }`}
          >
            {selected.length > 0 ? `Tambah Akses (${selected.length} Modul)` : "Tambah Akses"}
          </button>
        </div>
      </div>
    </div>
  );
}
