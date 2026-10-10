// app/components/settings/tabs/UsersTab.tsx
// Tab Pengguna — kelola akses user & permission
"use client";

import React, { useState } from "react";
import { Trash2, X, Eye, EyeOff } from "lucide-react";
import { UserData, UserPermissions, DEFAULT_PERMISSIONS } from "@/types";
import {
  ROLE_OPTIONS,
  getUserRoles,
  primaryRole,
  roleLabel,
} from "@/lib/roles";
import { PermissionTable } from "@/app/components/settings/PermissionTable";
import { inputCls, labelCls } from "@/app/components/settings/settingsShared";

interface UsersTabProps {
  users: UserData[];
  onSaveUser: (u: any) => void;
  onDeleteUser: (id: string) => void;
}

export default function UsersTab({
  users,
  onSaveUser,
  onDeleteUser,
}: UsersTabProps) {
  // ─── State: User ────────────────────────────────────────────────────────────
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [formData, setFormData] = useState<Partial<UserData>>({});
  const [permissions, setPermissions] =
    useState<UserPermissions>(DEFAULT_PERMISSIONS);
  const [showPassword, setShowPassword] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);

  // ─── User handlers ──────────────────────────────────────────────────────────

  const handleSelectUser = (u: UserData) => {
    setSelectedUser(u);
    setIsNewUser(false);
    setShowPassword(false);
    setFormData({
      id: u.id,
      name: u.name,
      username: u.username,
      no_wa: (u as any).no_wa || "", // ── TAMBAHAN ──
      role: u.role,
      roles: getUserRoles(u),
      password: "",
    });
    const merged: UserPermissions = {
      dashboard: { view: false, ...((u.permissions as any)?.dashboard || {}) },
      orders: {
        view: false,
        create: false,
        edit: false,
        delete: false,
        ...((u.permissions as any)?.orders || {}),
      },
      produksi: {
        view: false,
        create: false,
        edit: false,
        delete: false,
        ...((u.permissions as any)?.produksi || {}),
      },
      finishing: {
        view: false,
        create: false,
        edit: false,
        delete: false,
        ...((u.permissions as any)?.finishing || {}),
      },
      salary: {
        view: false,
        create: false,
        edit: false,
        ...((u.permissions as any)?.salary || {}),
      },
      logs: { view: false, ...((u.permissions as any)?.logs || {}) },
      settings: {
        view: false,
        create: false,
        edit: false,
        delete: false,
        ...((u.permissions as any)?.settings || {}),
      },
      kalkulator: {
        view: false,
        ...((u.permissions as any)?.kalkulator || {}),
      },
      config_harga: {
        view: false,
        edit: false,
        ...((u.permissions as any)?.config_harga || {}),
      },
      trash: {
        view: false,
        delete: false,
        ...((u.permissions as any)?.trash || {}),
      },
      weekly_notes: {
        view: false,
        ...((u.permissions as any)?.weekly_notes || {}),
      },
      nota: { view: false, ...((u.permissions as any)?.nota || {}) },
      keuangan: {
        view: false,
        create: false,
        edit: false,
        delete: false,
        ...((u.permissions as any)?.keuangan || {}),
      },
      po_management: {
        view: false,
        create: false,
        edit: false,
        delete: false,
        ...((u.permissions as any)?.po_management || {}),
      }, // ← TAMBAHAN
      harga_pesanan: {
        view: false,
        create: false,
        edit: false,
        delete: false,
        ...((u.permissions as any)?.harga_pesanan || {}),
      },
    };
    setPermissions(merged);
  };

  const handleNewUser = () => {
    setSelectedUser(null);
    setIsNewUser(true);
    setShowPassword(false);
    setFormData({
      id: "",
      name: "",
      username: "",
      no_wa: "", // ── TAMBAHAN ──
      role: "produksi",
      roles: ["produksi"],
      password: "",
    });
    setPermissions(DEFAULT_PERMISSIONS);
  };

  const handleSubmitUser = () => {
    onSaveUser({ ...formData, permissions });
    setSelectedUser(null);
    setIsNewUser(false);
  };

  const handleCancel = () => {
    setSelectedUser(null);
    setIsNewUser(false);
  };

  const showEditor = selectedUser !== null || isNewUser;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 md:p-6">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Data Pengguna
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Kelola akses user aplikasi
          </p>
        </div>
        <button
          onClick={handleNewUser}
          className="bg-[#124540] hover:bg-[#0d332f] text-white px-3 py-1.5 rounded-md text-xs font-semibold transition-colors duration-150"
        >
          + User Baru
        </button>
      </div>

      <div
        className={`grid gap-4 md:gap-6 ${showEditor ? "grid-cols-1 lg:grid-cols-5" : "grid-cols-1"}`}
      >
        {/* Daftar User */}
        <div
          className={`${showEditor ? "lg:col-span-2" : ""} bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden`}
        >
          <div className="px-4 md:px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
            <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em]">
              Daftar User
            </p>
          </div>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {users.map((u) => {
              const isSelected = selectedUser?.id === u.id;
              return (
                <li
                  key={u.id}
                  onClick={() => handleSelectUser(u)}
                  className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors duration-150 ${
                    isSelected
                      ? "bg-zinc-50 dark:bg-zinc-900 border-l-2 border-l-[#124540]"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm border ${
                        isSelected
                          ? "bg-[#124540] text-white border-[#124540]"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700"
                      }`}
                    >
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {u.name}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
                          @{u.username}
                        </span>
                        <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em]">
                          · {getUserRoles(u).map(roleLabel).join(" + ")}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteUser(u.id);
                      if (selectedUser?.id === u.id) {
                        setSelectedUser(null);
                        setIsNewUser(false);
                      }
                    }}
                    className="p-1.5 text-zinc-300 dark:text-zinc-600 hover:text-red-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors duration-150"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Editor: Info + Permission Table */}
        {showEditor && (
          <div className="lg:col-span-3 space-y-4">
            <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <div className="px-4 md:px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em]">
                  {isNewUser ? "User Baru" : `Edit: ${selectedUser?.name}`}
                </p>
                <button
                  onClick={handleCancel}
                  className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors duration-150"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 md:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Nama Lengkap</label>
                  <input
                    className={inputCls}
                    value={formData.name || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Nama lengkap"
                  />
                </div>
                <div>
                  <label className={labelCls}>Username</label>
                  <input
                    className={inputCls}
                    value={formData.username || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, username: e.target.value })
                    }
                    placeholder="Username"
                  />
                </div>
                <div>
                  <label className={labelCls}>No. WhatsApp</label>
                  <input
                    className={inputCls}
                    inputMode="tel"
                    value={formData.no_wa || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, no_wa: e.target.value })
                    }
                    placeholder="08xxxxxxxxxx (untuk notifikasi WA)"
                  />
                </div>
                <div>
                  <label className={labelCls}>Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      className={`${inputCls} pr-9`}
                      value={formData.password || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, password: e.target.value })
                      }
                      placeholder={
                        isNewUser ? "Password" : "Kosongkan jika tidak diubah"
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-[#2589ff] transition-colors duration-150"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>
                    Role (boleh pilih lebih dari satu)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {ROLE_OPTIONS.map((opt) => {
                      const current = formData.roles || [];
                      const selected = current.includes(opt.value);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            const next = selected
                              ? current.filter((r) => r !== opt.value)
                              : [...current, opt.value];
                            if (next.length === 0) return; // minimal satu role
                            setFormData({
                              ...formData,
                              roles: next,
                              role: primaryRole(next) as any,
                            });
                          }}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors duration-150 ${
                            selected
                              ? "bg-[#124540] border-[#124540] text-white"
                              : "border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <div className="px-4 md:px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
                <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em]">
                  Hak Akses
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Klik sel untuk toggle. Hover untuk melihat keterangan.
                </p>
              </div>
              <PermissionTable
                permissions={permissions}
                onChange={setPermissions}
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancel}
                className="px-4 py-2 rounded-md border border-zinc-200 dark:border-zinc-800 text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150"
              >
                Batal
              </button>
              <button
                onClick={handleSubmitUser}
                className="px-5 py-2 rounded-md bg-[#124540] hover:bg-[#0d332f] text-white text-sm font-semibold transition-colors duration-150"
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
