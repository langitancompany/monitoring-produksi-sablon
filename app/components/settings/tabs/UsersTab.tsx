// app/components/settings/tabs/UsersTab.tsx
// Tab Pengguna: dua layar.
//   1. Daftar user (cari, halaman) → ikon kunci "Lihat Akses"
//   2. Detail user: Informasi Pengguna (kiri) + Hak Akses Modul (kanan, toggle per modul;
//      Maker/Approver satu baris dengan Keuangan). "Tambah Akses Modul" membuka modal.
// Perubahan hak akses ditampung dulu (draft) dan baru tersimpan setelah klik "Simpan".
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Eye,
  EyeOff,
  KeyRound,
  Layers,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { UserData, UserPermissions, DEFAULT_PERMISSIONS } from "@/types";
import { ROLE_OPTIONS, getUserRoles, primaryRole, roleLabel } from "@/lib/roles";
import UserAvatar from "@/app/components/ui/UserAvatar";
import TablePagination from "@/app/components/ui/TablePagination";
import { useDialog } from "@/app/components/ui/DialogProvider";
import {
  MODULE_DEFS,
  grantModules,
  moduleHasAccess,
  normalizePermissions,
  permissionsEqual,
  summarizeAccess,
  type InitialGrant,
  type PermKey,
} from "@/lib/permissionModules";
import { AddModuleModal, PermissionMatrix } from "@/app/components/settings/PermissionMatrix";
import { inputCls, labelCls } from "@/app/components/settings/settingsShared";

interface UsersTabProps {
  users: UserData[];
  onSaveUser: (u: any) => Promise<boolean>;
  onDeleteUser: (id: string) => void;
}

type ProfileMode = "new" | "edit" | null;

const cardCls =
  "bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden";
const thCls =
  "px-4 py-3 text-left text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] border-b border-zinc-200 dark:border-zinc-800";
const primaryBtn =
  "inline-flex items-center gap-1.5 bg-[#124540] hover:bg-[#0d332f] disabled:opacity-60 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors duration-150";
const ghostBtn =
  "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-60 transition-colors duration-150";

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">
      <ShieldCheck className="w-3 h-3" />
      {roleLabel(role)}
    </span>
  );
}

export default function UsersTab({ users, onSaveUser, onDeleteUser }: UsersTabProps) {
  const { confirmAsync } = useDialog();

  // ─── State ──────────────────────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<UserPermissions>(DEFAULT_PERMISSIONS);
  const [savingPerm, setSavingPerm] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const [profileMode, setProfileMode] = useState<ProfileMode>(null);
  const [formData, setFormData] = useState<Partial<UserData>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  /** Setelah user baru dibuat, buka detailnya begitu muncul di daftar. */
  const [openAfterCreate, setOpenAfterCreate] = useState<string | null>(null);

  const selectedUser = selectedId ? (users.find((u) => u.id === selectedId) ?? null) : null;
  const savedPerms = useMemo(
    () => (selectedUser ? normalizePermissions(selectedUser.permissions) : DEFAULT_PERMISSIONS),
    [selectedUser],
  );
  const dirty = !!selectedUser && !permissionsEqual(draft, savedPerms);

  const targetIsSuperAdmin = selectedUser ? getUserRoles(selectedUser).includes("super_admin") : false;

  // ─── Navigasi ───────────────────────────────────────────────────────────────
  const openDetail = (u: UserData) => {
    setSelectedId(u.id);
    setDraft(normalizePermissions(u.permissions));
    setAddOpen(false);
  };

  const backToList = async () => {
    if (
      dirty &&
      !(await confirmAsync("Perubahan hak akses belum disimpan. Tinggalkan halaman ini?", {
        title: "Perubahan belum disimpan",
      }))
    ) {
      return;
    }
    setSelectedId(null);
    setAddOpen(false);
  };

  // User yang dibuka sudah dihapus → kembali ke daftar
  useEffect(() => {
    if (selectedId && !selectedUser) setSelectedId(null);
  }, [selectedId, selectedUser]);

  // Buka detail user yang baru dibuat
  useEffect(() => {
    if (!openAfterCreate) return;
    const u = users.find((x) => x.username.toLowerCase() === openAfterCreate.toLowerCase());
    if (u) {
      setOpenAfterCreate(null);
      openDetail(u);
    }
  }, [users, openAfterCreate]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Profil (tambah user / ubah profil) ─────────────────────────────────────
  const openNewUser = () => {
    setShowPassword(false);
    setFormData({ id: "", name: "", username: "", no_wa: "", role: "produksi", roles: ["produksi"], password: "" });
    setProfileMode("new");
  };

  const openEditProfile = () => {
    if (!selectedUser) return;
    setShowPassword(false);
    setFormData({
      id: selectedUser.id,
      name: selectedUser.name,
      username: selectedUser.username,
      no_wa: selectedUser.no_wa || "",
      role: selectedUser.role,
      roles: getUserRoles(selectedUser),
      password: "",
    });
    setProfileMode("edit");
  };

  const submitProfile = async () => {
    if (savingProfile || !profileMode) return;
    setSavingProfile(true);
    // Ubah profil: kirim izin yang SUDAH tersimpan (bukan draft) supaya draft tidak ikut tersimpan.
    const ok = await onSaveUser({
      ...formData,
      permissions: profileMode === "new" ? DEFAULT_PERMISSIONS : savedPerms,
    });
    setSavingProfile(false);
    if (!ok) return; // isian tetap ada bila gagal
    if (profileMode === "new" && formData.username) setOpenAfterCreate(formData.username);
    setProfileMode(null);
  };

  // ─── Hak akses ──────────────────────────────────────────────────────────────
  const available = useMemo(() => MODULE_DEFS.filter((d) => !moduleHasAccess(draft, d.key)), [draft]);

  const handleAddModules = (keys: PermKey[], initial: InitialGrant) => {
    setDraft((d) => grantModules(d, keys, initial));
    setAddOpen(false);
  };

  const savePermissions = async () => {
    if (!selectedUser || savingPerm) return;
    setSavingPerm(true);
    await onSaveUser({
      id: selectedUser.id,
      name: selectedUser.name,
      username: selectedUser.username,
      no_wa: selectedUser.no_wa || "",
      roles: getUserRoles(selectedUser),
      role: selectedUser.role,
      permissions: draft,
    });
    // Bila sukses, `users` dimuat ulang dan `dirty` kembali false dengan sendirinya.
    setSavingPerm(false);
  };

  // ─── Daftar: cari + halaman ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => [u.name, u.username, u.no_wa ?? ""].some((s) => s.toLowerCase().includes(q)));
  }, [users, query]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const curPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((curPage - 1) * perPage, curPage * perPage);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {selectedUser ? (
        <DetailView
          user={selectedUser}
          draft={draft}
          setDraft={setDraft}
          dirty={dirty}
          saving={savingPerm}
          superAdmin={targetIsSuperAdmin}
          onBack={backToList}
          onEditProfile={openEditProfile}
          onAddModule={() => setAddOpen(true)}
          onSave={savePermissions}
          onReset={() => setDraft(savedPerms)}
        />
      ) : (
        <>
          <div className={`${cardCls} p-5 md:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3`}>
            <div>
              <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Akses Pengguna</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Kelola akun dan hak akses modul. Klik ikon kunci untuk melihat dan mengatur akses.
              </p>
            </div>
            <button onClick={openNewUser} className={primaryBtn}>
              + Tambah User
            </button>
          </div>

          <div className={cardCls}>
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Cari nama, email, atau telepon..."
                  aria-label="Cari pengguna"
                  className={`${inputCls} pl-9`}
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[720px]">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-900">
                    <th className={thCls}>Pengguna</th>
                    <th className={thCls}>Kontak</th>
                    <th className={thCls}>Akses Modul</th>
                    <th className={`${thCls} !text-right`}>Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {pageRows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
                        {query ? "Tidak ada pengguna yang cocok dengan pencarian." : "Belum ada pengguna."}
                      </td>
                    </tr>
                  )}
                  {pageRows.map((u) => {
                    const roles = getUserRoles(u);
                    const chips = summarizeAccess(normalizePermissions(u.permissions));
                    return (
                      <tr key={u.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/60 transition-colors duration-150">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <UserAvatar
                              src={u.avatar_url}
                              alt={u.name}
                              fallback={u.name.charAt(0).toUpperCase()}
                              className="w-9 h-9 shrink-0 font-semibold text-sm border bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700"
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{u.name}</p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {roles.map((r) => (
                                  <RoleBadge key={r} role={r} />
                                ))}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <p className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{u.no_wa || "–"}</p>
                          <p className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 truncate max-w-[220px]">
                            {u.username}
                          </p>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          {chips.length === 0 ? (
                            <span className="text-xs text-zinc-400">Belum ada akses</span>
                          ) : (
                            <div className="flex flex-wrap gap-1 max-w-[320px]">
                              {chips.slice(0, 4).map((c) => (
                                <span
                                  key={c.label}
                                  className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                    c.tone === "role"
                                      ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                                  }`}
                                >
                                  {c.label}
                                </span>
                              ))}
                              {chips.length > 4 && (
                                <span
                                  title={chips
                                    .slice(4)
                                    .map((c) => c.label)
                                    .join(", ")}
                                  className="rounded-md bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400"
                                >
                                  +{chips.length - 4}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => openDetail(u)}
                            title="Lihat Akses"
                            aria-label={`Lihat akses ${u.name}`}
                            className="p-2 rounded-md text-zinc-500 hover:text-[#124540] dark:hover:text-[#49BFB4] hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors duration-150"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onDeleteUser(u.id)}
                            title="Hapus user"
                            aria-label={`Hapus ${u.name}`}
                            className="p-2 rounded-md text-zinc-400 hover:text-red-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors duration-150"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <TablePagination
              page={curPage}
              perPage={perPage}
              total={filtered.length}
              onPage={setPage}
              onPerPage={setPerPage}
            />
          </div>
        </>
      )}

      {addOpen && <AddModuleModal available={available} onClose={() => setAddOpen(false)} onSubmit={handleAddModules} />}

      {profileMode && (
        <ProfileModal
          mode={profileMode}
          formData={formData}
          setFormData={setFormData}
          showPassword={showPassword}
          setShowPassword={setShowPassword}
          saving={savingProfile}
          onClose={() => setProfileMode(null)}
          onSubmit={submitProfile}
        />
      )}
    </div>
  );
}

// ─── Layar detail ────────────────────────────────────────────────────────────

function DetailView({
  user,
  draft,
  setDraft,
  dirty,
  saving,
  superAdmin,
  onBack,
  onEditProfile,
  onAddModule,
  onSave,
  onReset,
}: {
  user: UserData;
  draft: UserPermissions;
  setDraft: (p: UserPermissions) => void;
  dirty: boolean;
  saving: boolean;
  superAdmin: boolean;
  onBack: () => void;
  onEditProfile: () => void;
  onAddModule: () => void;
  onSave: () => void;
  onReset: () => void;
}) {
  const roles = getUserRoles(user);
  const info: [string, React.ReactNode][] = [
    ["Nama", user.name],
    ["Telepon", <span key="t" className="font-mono">{user.no_wa || "–"}</span>],
    ["Email", <span key="e" className="font-mono break-all">{user.username}</span>],
    [
      "Peran",
      <span key="r" className="flex flex-wrap gap-1">
        {roles.map((r) => (
          <RoleBadge key={r} role={r} />
        ))}
      </span>,
    ],
  ];

  const hint = superAdmin
    ? "Super Admin selalu boleh semua aksi Keuangan (Maker, Approver, Void) walau toggle-nya mati. Perubahan tersimpan setelah klik Simpan."
    : "Matriks perizinan modul dan hak aksi sistem. Perubahan tersimpan setelah klik Simpan.";

  return (
    <>
      <div>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-[#124540] dark:hover:text-[#49BFB4] transition-colors duration-150"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke daftar
        </button>
        <nav aria-label="Breadcrumb" className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <span>Pengaturan</span>
          <ChevronRight className="w-3 h-3" />
          <button onClick={onBack} className="hover:text-zinc-800 dark:hover:text-zinc-200">
            Informasi Pengguna
          </button>
          <ChevronRight className="w-3 h-3" />
          <span className="font-semibold text-zinc-800 dark:text-zinc-200">{user.name}</span>
        </nav>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-4 md:gap-6 items-start">
        {/* Kiri: Informasi pengguna */}
        <div className={cardCls}>
          <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 shrink-0 rounded-xl bg-[#124540]/10 text-[#124540] dark:text-[#49BFB4] flex items-center justify-center">
                <UserRound className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Informasi Pengguna</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">Data akun dan kredensial akses</p>
              </div>
            </div>
            <button onClick={onEditProfile} className={ghostBtn}>
              <Pencil className="w-3.5 h-3.5" /> Ubah Profil
            </button>
          </div>
          <dl className="m-5 rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
            {info.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[110px_1fr] gap-3 px-4 py-3 text-sm">
                <dt className="text-zinc-500 dark:text-zinc-400">{k}</dt>
                <dd className="font-semibold text-zinc-800 dark:text-zinc-200 min-w-0">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Kanan: Hak akses modul */}
        <div className={cardCls}>
          <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 shrink-0 rounded-xl bg-[#124540]/10 text-[#124540] dark:text-[#49BFB4] flex items-center justify-center">
                <Layers className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Hak Akses Modul</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
              </div>
            </div>
            <button onClick={onAddModule} className={`${primaryBtn} shrink-0`}>
              + Tambah Akses Modul
            </button>
          </div>

          <div className="p-4">
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <PermissionMatrix
                permissions={draft}
                onChange={setDraft}
              />
            </div>
          </div>

          {dirty && (
            <div className="px-5 py-3 border-t border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                Ada perubahan hak akses yang belum disimpan.
              </p>
              <div className="flex gap-2 justify-end">
                <button onClick={onReset} disabled={saving} className={ghostBtn}>
                  Batalkan
                </button>
                <button onClick={onSave} disabled={saving} className={primaryBtn}>
                  {saving ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Modal profil: tambah user / ubah profil ─────────────────────────────────

function ProfileModal({
  mode,
  formData,
  setFormData,
  showPassword,
  setShowPassword,
  saving,
  onClose,
  onSubmit,
}: {
  mode: "new" | "edit";
  formData: Partial<UserData>;
  setFormData: (f: Partial<UserData>) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  saving: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const isNew = mode === "new";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/70 z-99 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? "Tambah user" : "Ubah profil"}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="bg-white dark:bg-zinc-950 rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col border border-zinc-200 dark:border-zinc-800 shadow-xl"
      >
        <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h3 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {isNew ? "Tambah User" : "Ubah Profil"}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {isNew
                ? "Hak akses modul diatur setelah user dibuat."
                : "Data akun pengguna. Hak akses diubah di panel Hak Akses Modul."}
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

        <div className="p-5 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Nama Lengkap</label>
            <input
              className={inputCls}
              value={formData.name || ""}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Nama lengkap"
            />
          </div>
          <div>
            <label className={labelCls}>Email Login</label>
            <input
              type="email"
              autoComplete="off"
              className={`${inputCls} ${isNew ? "" : "opacity-60 cursor-not-allowed"}`}
              value={formData.username || ""}
              disabled={!isNew}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              placeholder="nama@langitan.co"
            />
            {!isNew && (
              <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                Email login tidak bisa diubah (akun dipakai bersama aplikasi Langitan lain).
              </p>
            )}
          </div>
          <div>
            <label className={labelCls}>No. WhatsApp</label>
            <input
              className={inputCls}
              inputMode="tel"
              value={formData.no_wa || ""}
              onChange={(e) => setFormData({ ...formData, no_wa: e.target.value })}
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
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                autoComplete="new-password"
                placeholder={isNew ? "Minimal 8 karakter" : "Kosongkan jika tidak diubah"}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-[#124540] dark:hover:text-[#49BFB4] transition-colors duration-150"
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
              {isNew
                ? "Jika email ini sudah punya akun di aplikasi Langitan lain (mis. Sablon), akun itu dipakai bersama dan password-nya tidak diubah."
                : "Password baru berlaku di semua aplikasi Langitan."}
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Role (boleh pilih lebih dari satu)</label>
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map((opt) => {
                const current = formData.roles || [];
                const selected = current.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      const next = selected ? current.filter((r) => r !== opt.value) : [...current, opt.value];
                      if (next.length === 0) return; // minimal satu role
                      setFormData({ ...formData, roles: next, role: primaryRole(next) as any });
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

        <div className="px-5 py-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3">
          <button type="button" onClick={onClose} className={ghostBtn}>
            Batalkan
          </button>
          <button type="submit" disabled={saving} className={primaryBtn}>
            {saving ? "Menyimpan..." : isNew ? "Buat User" : "Simpan Profil"}
          </button>
        </div>
      </form>
    </div>
  );
}
