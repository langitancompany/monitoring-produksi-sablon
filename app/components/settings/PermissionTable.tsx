// app/components/settings/PermissionTable.tsx
// Tabel hak akses per modul (dipakai di tab Pengguna).
"use client";

import React from "react";
import { Check, Minus } from "lucide-react";
import { UserPermissions } from "@/types";

// ─── Definisi modul untuk tabel permission ───────────────────────────────────

type PermKey = keyof UserPermissions;

interface ModuleDef {
  key: PermKey;
  label: string;
  hasCreate: boolean;
  hasEdit: boolean;
  hasDelete: boolean;
  createLabel?: string;
  editLabel?: string;
  deleteLabel?: string;
}

const MODULES: ModuleDef[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    hasCreate: false,
    hasEdit: false,
    hasDelete: false,
  },
  {
    key: "orders",
    label: "Pesanan",
    hasCreate: true,
    hasEdit: true,
    hasDelete: true,
    createLabel: "Buat pesanan",
    editLabel: "Edit pesanan",
    deleteLabel: "Hapus pesanan",
  },
  {
    key: "produksi",
    label: "Produksi",
    hasCreate: true,
    hasEdit: true,
    hasDelete: true,
    createLabel: "Upload approval",
    editLabel: "Update step & kendala",
    deleteLabel: "Hapus file bukti",
  },
  {
    key: "finishing",
    label: "Finishing & QC",
    hasCreate: true,
    hasEdit: true,
    hasDelete: true,
    createLabel: "Reset QC",
    editLabel: "Cek QC, packing, kirim",
    deleteLabel: "Hapus file finishing",
  },
  {
    key: "salary",
    label: "Gaji & Upah",
    hasCreate: true,
    hasEdit: true,
    hasDelete: false,
    createLabel: "Cetak slip gaji",
    editLabel: "Edit pesanan dari halaman Gaji",
  },
  {
    key: "keuangan",
    label: "Keuangan",
    hasCreate: true,
    hasEdit: true,
    hasDelete: true,
    createLabel: "Terbitkan tagihan & catat pembayaran",
    editLabel: "Verifikasi / tolak pembayaran",
    deleteLabel: "Void (batalkan) transaksi",
  },
  {
    key: "harga_pesanan",
    label: "Harga & Pembayaran (Order)",
    hasCreate: false,
    hasEdit: true,
    hasDelete: true,
    editLabel: "Isi harga, DP, status & upload bukti bayar",
    deleteLabel: "Hapus bukti pembayaran",
  },
  {
    key: "logs",
    label: "Log Aktivitas",
    hasCreate: false,
    hasEdit: false,
    hasDelete: false,
  },
  {
    key: "settings",
    label: "Pengaturan",
    hasCreate: true,
    hasEdit: true,
    hasDelete: true,
    createLabel: "Tambah user/tipe",
    editLabel: "Edit user/tipe",
    deleteLabel: "Hapus user/tipe",
  },
  {
    key: "kalkulator",
    label: "Kalkulator",
    hasCreate: false,
    hasEdit: false,
    hasDelete: false,
  },
  {
    key: "config_harga",
    label: "Config Harga",
    hasCreate: false,
    hasEdit: true,
    hasDelete: false,
    editLabel: "Edit harga",
  },
  {
    key: "trash",
    label: "Sampah",
    hasCreate: false,
    hasEdit: false,
    hasDelete: true,
    deleteLabel: "Hapus permanen",
  },
  {
    key: "weekly_notes",
    label: "Catatan Rapat",
    hasCreate: false,
    hasEdit: false,
    hasDelete: false,
  },
  {
    key: "nota",
    label: "Generator Nota",
    hasCreate: false,
    hasEdit: false,
    hasDelete: false,
  },
  // ── TAMBAHAN ──
  {
    key: "po_management",
    label: "PO Management",
    hasCreate: true,
    hasEdit: true,
    hasDelete: true,
    createLabel: "Tambah produk & reseller",
    editLabel: "Edit setting PO, produk, aktif/nonaktif",
    deleteLabel: "Hapus produk & reseller",
  },
];

// ─── Helper: ambil/set nilai permission ──────────────────────────────────────

function getPermVal(
  permissions: UserPermissions,
  key: PermKey,
  field: string,
): boolean {
  const mod = permissions[key] as any;
  return mod ? !!mod[field] : false;
}

function setPermVal(
  permissions: UserPermissions,
  key: PermKey,
  field: string,
  value: boolean,
): UserPermissions {
  return {
    ...permissions,
    [key]: { ...(permissions[key] as any), [field]: value },
  };
}

// ─── Komponen: Sel tabel ─────────────────────────────────────────────────────

function PermCell({
  active,
  disabled,
  tooltip,
  onChange,
}: {
  active: boolean;
  disabled?: boolean;
  tooltip?: string;
  onChange: () => void;
}) {
  if (disabled) {
    return (
      <td className="px-3 py-2.5 text-center">
        <Minus className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-700 mx-auto" />
      </td>
    );
  }
  return (
    <td className="px-3 py-2.5 text-center" title={tooltip}>
      <button
        onClick={onChange}
        className={`w-5 h-5 rounded-md border mx-auto flex items-center justify-center transition-colors duration-150 ${
          active
            ? "bg-[#124540] border-[#124540]"
            : "bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-500"
        }`}
      >
        {active && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
      </button>
    </td>
  );
}

// ─── Komponen: Tabel Permission ───────────────────────────────────────────────

export function PermissionTable({
  permissions,
  onChange,
}: {
  permissions: UserPermissions;
  onChange: (updated: UserPermissions) => void;
}) {
  const toggle = (key: PermKey, field: string) => {
    const current = getPermVal(permissions, key, field);
    onChange(setPermVal(permissions, key, field, !current));
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-zinc-50 dark:bg-zinc-900">
            <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] border-b border-zinc-200 dark:border-zinc-800 w-[40%]">
              Modul / Fitur
            </th>
            <th className="px-3 py-2.5 text-center text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] border-b border-zinc-200 dark:border-zinc-800">
              Lihat
            </th>
            <th className="px-3 py-2.5 text-center text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] border-b border-zinc-200 dark:border-zinc-800">
              Buat
            </th>
            <th className="px-3 py-2.5 text-center text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] border-b border-zinc-200 dark:border-zinc-800">
              Edit
            </th>
            <th className="px-3 py-2.5 text-center text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] border-b border-zinc-200 dark:border-zinc-800">
              Hapus
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {MODULES.map((mod) => (
            <tr
              key={mod.key}
              className="hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150"
            >
              <td className="px-3 py-2.5">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  {mod.label}
                </span>
              </td>
              <PermCell
                active={getPermVal(permissions, mod.key, "view")}
                tooltip="Akses halaman ini"
                onChange={() => toggle(mod.key, "view")}
              />
              <PermCell
                active={
                  mod.hasCreate
                    ? getPermVal(permissions, mod.key, "create")
                    : false
                }
                disabled={!mod.hasCreate}
                tooltip={mod.createLabel}
                onChange={() => mod.hasCreate && toggle(mod.key, "create")}
              />
              <PermCell
                active={
                  mod.hasEdit ? getPermVal(permissions, mod.key, "edit") : false
                }
                disabled={!mod.hasEdit}
                tooltip={mod.editLabel}
                onChange={() => mod.hasEdit && toggle(mod.key, "edit")}
              />
              <PermCell
                active={
                  mod.hasDelete
                    ? getPermVal(permissions, mod.key, "delete")
                    : false
                }
                disabled={!mod.hasDelete}
                tooltip={mod.deleteLabel}
                onChange={() => mod.hasDelete && toggle(mod.key, "delete")}
              />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
