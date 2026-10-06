// app/components/settings/SettingsPage.tsx
// Kerangka halaman Pengaturan: tab di bagian atas, isi tiap tab ada di folder ./tabs
// Tab yang tampil mengikuti role user (sama seperti aturan akses sebelumnya).
"use client";

import React, { useState } from "react";
import { Users, Layers, Wallet, Megaphone, Bell, Database } from "lucide-react";
import { UserData, ProductionTypeData } from "@/types";
import UsersTab from "@/app/components/settings/tabs/UsersTab";
import ProductionTypesTab from "@/app/components/settings/tabs/ProductionTypesTab";
import GesutSalaryTab from "@/app/components/settings/tabs/GesutSalaryTab";
import AnnouncementsTab from "@/app/components/settings/tabs/AnnouncementsTab";
import NotificationsTab from "@/app/components/settings/tabs/NotificationsTab";
import BackupTab from "@/app/components/settings/tabs/BackupTab";

interface SettingsPageProps {
  users: UserData[];
  productionTypes: ProductionTypeData[];
  currentUser: UserData;
  onSaveUser: (u: any) => void;
  onDeleteUser: (id: string) => void;
  onSaveProductionType: (t: any) => void;
  onDeleteProductionType: (id: string) => void;
}

type TabId =
  | "pengguna"
  | "produksi"
  | "gaji"
  | "pengumuman"
  | "notifikasi"
  | "backup";

export default function SettingsPage({
  users,
  productionTypes,
  currentUser,
  onSaveUser,
  onDeleteUser,
  onSaveProductionType,
  onDeleteProductionType,
}: SettingsPageProps) {
  const isManagement = ["admin", "manager", "supervisor"].includes(
    currentUser.role,
  );
  const isSupervisor = currentUser.role === "supervisor";

  // Daftar tab + siapa yang boleh melihatnya
  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = (
    [
      { id: "pengguna", label: "Pengguna", icon: Users, show: true },
      { id: "produksi", label: "Jenis Produksi", icon: Layers, show: true },
      { id: "gaji", label: "Gaji", icon: Wallet, show: isManagement },
      {
        id: "pengumuman",
        label: "Pengumuman",
        icon: Megaphone,
        show: isManagement,
      },
      { id: "notifikasi", label: "Notifikasi", icon: Bell, show: true },
      { id: "backup", label: "Backup", icon: Database, show: isSupervisor },
    ] as {
      id: TabId;
      label: string;
      icon: React.ElementType;
      show: boolean;
    }[]
  ).filter((t) => t.show);

  const [activeId, setActiveId] = useState<TabId>("pengguna");
  const active: TabId = tabs.some((t) => t.id === activeId)
    ? activeId
    : tabs[0].id;

  // Panah kiri/kanan untuk pindah tab (aksesibilitas)
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = tabs.findIndex((t) => t.id === active);
    const next =
      e.key === "ArrowRight"
        ? tabs[(i + 1) % tabs.length]
        : tabs[(i - 1 + tabs.length) % tabs.length];
    setActiveId(next.id);
  };

  return (
    <div className="space-y-6 pb-24">
      {/* ── Tab navigasi (gaya sama dengan PO Management) ── */}
      <div
        role="tablist"
        aria-label="Menu pengaturan"
        onKeyDown={onKeyDown}
        className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-1.5 flex gap-1 overflow-x-auto no-scrollbar [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = id === active;
          return (
            <button
              key={id}
              id={`tab-${id}`}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls={`panel-${id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveId(id)}
              className={`
                flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold rounded-md
                whitespace-nowrap shrink-0 transition-colors duration-150
                ${
                  isActive
                    ? "bg-[#124540] text-white"
                    : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:text-zinc-700 dark:hover:text-zinc-200"
                }
              `}
            >
              <Icon size={14} className="shrink-0" />
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Isi tab (hanya tab aktif yang dirender) ── */}
      <div
        role="tabpanel"
        id={`panel-${active}`}
        aria-labelledby={`tab-${active}`}
      >
        {active === "pengguna" && (
          <UsersTab
            users={users}
            onSaveUser={onSaveUser}
            onDeleteUser={onDeleteUser}
          />
        )}
        {active === "produksi" && (
          <ProductionTypesTab
            productionTypes={productionTypes}
            onSaveProductionType={onSaveProductionType}
            onDeleteProductionType={onDeleteProductionType}
          />
        )}
        {active === "gaji" && <GesutSalaryTab />}
        {active === "pengumuman" && (
          <AnnouncementsTab currentUser={currentUser} />
        )}
        {active === "notifikasi" && (
          <NotificationsTab isManagement={isManagement} />
        )}
        {active === "backup" && <BackupTab />}
      </div>
    </div>
  );
}
