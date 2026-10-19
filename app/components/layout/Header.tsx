// app/components/layout/Header.tsx
"use client";

import React, { useState } from "react";
import {
  Menu,
  Bell,
  LogOut,
  Settings,
  AlertTriangle,
  Info,
  CheckCircle,
} from "lucide-react";
import { UserData } from "@/types";

import { roleLabel } from "@/lib/roles";
interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  isRead: boolean;
  orderId?: string;
  type?: "warning" | "info" | "success"; // opsional, fallback ke 'info'
}

interface HeaderProps {
  currentUser: UserData;
  onToggleSidebar: () => void;
  onLogout: () => void;
  /** Buka modal Edit Profil (dipakai di dropdown foto profil mode HP). */
  onOpenProfile?: () => void;
  sidebarOpen: boolean;
  currentPage?: string;
  notifications?: Notification[];
  onNotificationClick?: (notificationId: string, orderId: string) => void;
  onMarkAllRead?: () => void; // callback untuk tandai semua dibaca
}

// ─── Helper: ikon & warna per tipe notifikasi ────────────────────────────────

function NotifIcon({ type }: { type: "warning" | "info" | "success" }) {
  if (type === "warning") {
    return (
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-orange-50 dark:bg-orange-900/20">
        <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
      </div>
    );
  }
  if (type === "success") {
    return (
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-emerald-50 dark:bg-emerald-900/20">
        <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
      </div>
    );
  }
  // default: info — pakai aksen tema
  return (
    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-[#49BFB4]/10 dark:bg-[#49BFB4]/15">
      <Info className="w-4 h-4 text-[#49BFB4]" />
    </div>
  );
}

// ─── Komponen: Panel Notifikasi ──────────────────────────────────────────────

interface NotifPanelProps {
  notifications: Notification[];
  onNotificationClick: (notif: Notification) => void;
  onMarkAllRead: () => void;
  onClose: () => void;
}

function NotifPanel({
  notifications,
  onNotificationClick,
  onMarkAllRead,
  onClose,
}: NotifPanelProps) {
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const hasUnread = unreadCount > 0;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-30 bg-zinc-950/10 dark:bg-zinc-950/50"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="
        fixed md:absolute right-4 md:right-0 top-24 md:top-full md:mt-2
        w-[calc(100vw-2rem)] md:w-80 max-w-sm
        bg-white dark:bg-zinc-950
        rounded-xl border border-zinc-200 dark:border-zinc-800
        z-40 overflow-hidden
      "
      >
        {/* Header panel */}
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between sticky top-0 bg-white dark:bg-zinc-950 z-10">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Notifikasi
            </span>
            {hasUnread && (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-red-600 text-white">
                {unreadCount} baru
              </span>
            )}
          </div>
          {hasUnread && (
            <button
              onClick={onMarkAllRead}
              className="text-[11px] font-semibold text-[#49BFB4] hover:underline transition-colors duration-150 whitespace-nowrap"
            >
              Tandai semua dibaca
            </button>
          )}
        </div>

        {/* List notifikasi */}
        {notifications.length === 0 ? (
          <div className="py-10 px-4 flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center">
              <Bell className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />
            </div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">
              Semua sudah dibaca
            </p>
          </div>
        ) : (
          <div className="max-h-[60vh] md:max-h-96 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-900">
            {notifications.map((notif) => {
              const type = notif.type ?? "info";
              return (
                <div
                  key={notif.id}
                  onClick={() => onNotificationClick(notif)}
                  style={{ WebkitTapHighlightColor: "transparent" }}
                  className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors duration-150
                    hover:bg-zinc-50 dark:hover:bg-zinc-900
                    ${!notif.isRead ? "bg-[#49BFB4]/5 dark:bg-[#49BFB4]/10" : ""}
                  `}
                >
                  {/* Ikon tipe */}
                  <NotifIcon type={type} />

                  {/* Konten */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                      <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-200 line-clamp-1 leading-tight">
                        {notif.title}
                      </p>
                      <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 whitespace-nowrap flex-shrink-0 mt-0.5">
                        {notif.time}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                      {notif.message}
                    </p>
                    {notif.orderId && (
                      <p className="text-[10px] font-mono text-[#49BFB4] mt-1">
                        #{notif.orderId}
                      </p>
                    )}
                  </div>

                  {/* Dot unread */}
                  {!notif.isRead && (
                    <div className="w-1.5 h-1.5 rounded-full bg-[#49BFB4] flex-shrink-0 mt-1.5" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Komponen Utama: Header ──────────────────────────────────────────────────

export default function Header({
  currentUser,
  onToggleSidebar,
  onLogout,
  onOpenProfile,
  sidebarOpen,
  currentPage = "dashboard",
  notifications = [],
  onNotificationClick,
  onMarkAllRead,
}: HeaderProps) {
  const [showNotif, setShowNotif] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const pageTitles: Record<string, string> = {
    dashboard: "Dashboard",
    orders: "Daftar Pesanan",
    merchandise: "Pesanan Merchandise",
    completed_orders: "Arsip Selesai",
    trash: "Sampah",
    settings: "Pengaturan",
    kalkulator: "Kalkulator HPP",
    config_harga: "Konfigurasi Harga",
    about: "Tentang Aplikasi",
    default: "Langitan.co",
  };

  const currentTitle = pageTitles[currentPage] ?? pageTitles.default;

  const handleNotificationClick = (notif: Notification) => {
    setShowNotif(false);
    if (notif.orderId && onNotificationClick) {
      onNotificationClick(notif.id, notif.orderId);
    }
  };

  const handleMarkAllRead = () => {
    onMarkAllRead?.();
    // Tidak langsung tutup panel supaya user bisa lihat perubahannya
  };

  return (
    <header
      className={`
      sticky top-0 h-20 px-4 md:px-10 flex items-center justify-between transition-colors duration-150
      z-30 border-b border-transparent dark:border-transparent
      ${sidebarOpen ? "bg-zinc-50 dark:bg-zinc-900" : "bg-zinc-50 dark:bg-zinc-950"}
      md:bg-zinc-50 md:dark:bg-zinc-950
    `}
    >
      {/* ── KIRI ── */}
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleSidebar}
          className="p-2.5 bg-white dark:bg-zinc-900 rounded-xl text-zinc-600 dark:text-zinc-200 md:hidden hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 transition-colors duration-150"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          <Menu className="w-6 h-6" />
        </button>

        <div className="hidden md:block">
          {currentPage === "dashboard" && (
            <>
              <h2 className="text-xl md:text-2xl font-semibold text-zinc-900 dark:text-white tracking-tight">
                Assalamu'alaikum
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Selamat datang kembali,{" "}
                <span className="font-semibold text-[#49BFB4]">
                  {currentUser.name}
                </span>{" "}
              </p>
            </>
          )}
        </div>

        <div className="md:hidden">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-white tracking-tight">
            {currentTitle}
          </h1>
        </div>
      </div>

      {/* ── KANAN ── */}
      <div className="flex items-center gap-3">
        {/* Bell notifikasi */}
        <div className="relative">
          <button
            onClick={() => {
              setShowNotif(!showNotif);
              setShowProfile(false);
            }}
            className="p-2.5 md:p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-500 dark:text-zinc-200 hover:text-[#49BFB4] dark:hover:text-[#49BFB4] transition-colors duration-150 relative"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-600 rounded-full border-2 border-white dark:border-zinc-900" />
            )}
          </button>

          {showNotif && (
            <NotifPanel
              notifications={notifications}
              onNotificationClick={handleNotificationClick}
              onMarkAllRead={handleMarkAllRead}
              onClose={() => setShowNotif(false)}
            />
          )}
        </div>

        {/* Profil user (mobile only) */}
        <div className="relative md:hidden">
          <button
            onClick={() => {
              setShowProfile(!showProfile);
              setShowNotif(false);
            }}
            className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center overflow-hidden transition-colors duration-150"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            {currentUser.avatar_url ? (
              <img
                src={currentUser.avatar_url}
                alt="User"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="font-semibold text-zinc-700 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 w-full h-full flex items-center justify-center">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
            )}
          </button>

          {showProfile && (
            <>
              <div
                className="fixed inset-0 z-30 bg-zinc-950/10 dark:bg-zinc-950/50"
                onClick={() => setShowProfile(false)}
              />
              <div
                className="
                fixed md:absolute right-4 md:right-0 top-24 md:top-full md:mt-2
                w-56 bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800
                z-40 p-2
              "
              >
                <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-200 truncate">
                    {currentUser.name}
                  </p>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                    {roleLabel(currentUser.role)}
                  </p>
                </div>
                {onOpenProfile && (
                  <button
                    onClick={() => {
                      setShowProfile(false);
                      onOpenProfile();
                    }}
                    className="w-full text-left px-4 py-3 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900 rounded-md flex items-center gap-2 font-semibold transition-colors duration-150 mt-1"
                    style={{ WebkitTapHighlightColor: "transparent" }}
                  >
                    <Settings className="w-4 h-4" /> Edit Profil
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowProfile(false);
                    onLogout();
                  }}
                  className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md flex items-center gap-2 font-semibold transition-colors duration-150 mt-1"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  <LogOut className="w-4 h-4" /> Logout
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
