/*
 * Copyright 2026 [abdllahmajid]
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// app/page.tsx
"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { createBrowserClient } from "@supabase/ssr";

// ─── Hooks ───────────────────────────────────────────────────────────────────
import { useNotifications } from "@/hooks/useNotifications";
import { useOrders } from "@/hooks/useOrders";
import { useUpload } from "@/hooks/useUpload";
import { useUsers } from "@/hooks/useUsers";

// ─── Layout & UI ─────────────────────────────────────────────────────────────
import Sidebar from "@/app/components/layout/Sidebar";
import Header from "@/app/components/layout/Header";
import CustomAlert from "@/app/components/ui/CustomAlert";
import LoginScreen from "@/app/components/auth/LoginScreen";
import ProfileModal from "@/app/components/ui/ProfileModal";
import POListSelector from "@/app/components/po/POListSelector";

// ─── Lazy Load ───────────────────────────────────────────────────────────────
import dynamic from "next/dynamic";

const Dashboard = dynamic(
  () => import("@/app/components/dashboard/Dashboard"),
  {
    loading: () => (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-[#49BFB4] border-t-transparent rounded-full animate-spin" />
      </div>
    ),
    ssr: false,
  },
);
const CalculatorView = dynamic(
  () => import("@/app/components/apps/CalculatorView"),
);
const ConfigPriceView = dynamic(
  () => import("@/app/components/apps/ConfigPriceView"),
);
const ActivityLogView = dynamic(
  () => import("@/app/components/apps/ActivityLogView"),
);
const AboutView = dynamic(() => import("@/app/components/misc/AboutView"));
const CalendarView = dynamic(
  () => import("@/app/components/apps/CalendarView"),
);
const SalaryView = dynamic(() => import("@/app/components/apps/SalaryView"));
const NotaView = dynamic(() => import("@/app/components/apps/NotaView"));
const OrderList = dynamic(() => import("@/app/components/orders/OrderList"));
const CreateOrder = dynamic(
  () => import("@/app/components/orders/CreateOrder"),
);
const EditOrder = dynamic(() => import("@/app/components/orders/EditOrder"));
const OrderDetail = dynamic(
  () => import("@/app/components/orders/OrderDetail"),
);
const CompletedOrders = dynamic(
  () => import("@/app/components/orders/CompletedOrders"),
);
const TrashView = dynamic(() => import("@/app/components/orders/TrashView"));
const SettingsPage = dynamic(
  () => import("@/app/components/settings/SettingsPage"),
);
const WeeklyNotesView = dynamic(
  () => import("@/app/components/apps/WeeklyNotesView"),
);
const FinanceModule = dynamic(
  () => import("@/app/components/finance/FinanceModule"),
  {
    loading: () => (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-[#49BFB4] border-t-transparent rounded-full animate-spin" />
      </div>
    ),
    ssr: false,
  },
);
import POManagementView from "@/app/components/po/POManagementView";

// ─── Types ───────────────────────────────────────────────────────────────────
import {
  UserData,
  Order,
  ProductionTypeData,
  DEFAULT_PERMISSIONS,
  OrderStatus,
} from "@/types";
import { DEFAULT_PRODUCTION_TYPES } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type ActiveTab =
  | "dashboard"
  | "orders"
  | "calendar"
  | "logs"
  | "completed_orders"
  | "settings"
  | "trash"
  | "kalkulator"
  | "config_harga"
  | "about"
  | "salary"
  | "nota"
  | "weekly_notes"
  | "finance"
  | "po_management";

interface CurrentUser extends UserData {
  id: string;
}

const VALID_TABS: ActiveTab[] = [
  "dashboard",
  "orders",
  "calendar",
  "logs",
  "completed_orders",
  "settings",
  "trash",
  "kalkulator",
  "config_harga",
  "about",
  "salary",
  "nota",
  "weekly_notes",
  "finance",
  "po_management",
];

function isValidTab(value: string | null): value is ActiveTab {
  return !!value && (VALID_TABS as string[]).includes(value);
}

// ── TAMBAHAN ── Fallback ringan saat selectedOrderId ada tapi order-nya
// tidak ketemu di `orders` (belum ke-load / race condition / sudah dihapus).
// Dipakai di render "detail" dan "edit" di bawah, MENGGANTIKAN pola lama
// `orders.find(...)!` yang bisa lolos undefined ke OrderDetail/EditOrder.
function OrderNotFound({ onBack }: { onBack: () => void }) {
  return (
    <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center text-zinc-400 dark:text-zinc-600">
      <p className="text-sm font-semibold mb-2 text-zinc-600 dark:text-zinc-300">
        Data pesanan tidak ditemukan.
      </p>
      <p className="text-xs max-w-xs mx-auto mb-4">
        Pesanan mungkin belum selesai dimuat, sudah dihapus, atau gagal
        tersimpan sebelumnya.
      </p>
      <button
        onClick={onBack}
        className="text-xs font-semibold text-[#124540] dark:text-[#49BFB4] underline underline-offset-2"
      >
        Kembali ke daftar pesanan
      </button>
    </div>
  );
}

export default function ProductionApp() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [previousTab, setPreviousTab] = useState<ActiveTab | null>(null);
  // ── TAMBAHAN ── Khusus utk edit order yg dipicu LANGSUNG dari tab lain
  // (mis. SalaryView) tanpa mampir ke view "detail" dulu. Dipisah dari
  // `previousTab` supaya tidak bentrok dgn alur Dashboard/Calendar, yg
  // juga pakai `previousTab` tapi utk kembali dari "detail" ke tab asal
  // (bukan dari "edit"). Kalau state ini null, alur edit-dari-Detail yg
  // lama (Detail → Edit → Batal/Simpan → kembali ke Detail) tetap sama
  // persis seperti sebelumnya — efek di bawah cuma aktif kalau state ini
  // terisi.
  const [editReturnTab, setEditReturnTab] = useState<ActiveTab | null>(null);
  // ── TAMBAHAN ── SalaryView menyimpan filter/tab aktifnya sendiri via
  // useState LOKAL di dalam komponen itu. Kalau kita render dia dgn
  // `{activeTab === "salary" && <SalaryView/>}` seperti tab lain, React
  // meng-UNMOUNT komponennya tiap pindah tab — semua state lokal (bulan,
  // tahun, tab Manual/DTF, user terpilih) ikut hilang & reset ke default
  // saat balik lagi. Makanya dipisah jadi flag "sudah pernah dibuka" +
  // disembunyikan pakai CSS `display:none` (bukan unmount) di bawah,
  // supaya state internalnya tetap hidup persis spt terakhir ditinggalkan.
  const [salaryMounted, setSalaryMounted] = useState(false);
  const [completedOrdersPage, setCompletedOrdersPage] = useState(1);
  const [completedOrdersPerPage, setCompletedOrdersPerPage] = useState(10);
  const [loadingUser, setLoadingUser] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>("dashboard");
  const [view, setView] = useState<"list" | "detail" | "create" | "edit">(
    "list",
  );
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "success" | "error" | "confirm";
    onConfirm?: () => void;
  }>({ isOpen: false, title: "", message: "", type: "success" });

  const [isRestored, setIsRestored] = useState(false);

  // ─── Ref untuk scroll container utama ──────────────────────────────────────
  const mainRef = useRef<HTMLDivElement>(null);

  const showAlert = useCallback(
    (title: string, message: string, type: "success" | "error" = "success") => {
      setAlertState({
        isOpen: true,
        title,
        message,
        type,
        onConfirm: undefined,
      });
    },
    [],
  );
  const showConfirm = useCallback(
    (title: string, message: string, onConfirm: () => void) => {
      setAlertState({
        isOpen: true,
        title,
        message,
        type: "confirm",
        onConfirm,
      });
    },
    [],
  );
  const closeAlert = useCallback(
    () => setAlertState((prev) => ({ ...prev, isOpen: false })),
    [],
  );

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookieOptions: {
            // HARUS SAMA PERSIS dengan cookieOptions di app.langitan.co
            // (lihat supabaseClients.ts) supaya signOut() di sini benar-benar
            // menghapus cookie sesi lintas subdomain, bukan cookie host-only
            // yang berbeda scope.
            domain: ".langitan.co",
            path: "/",
            sameSite: "lax",
            secure: true,
          },
        },
      ),
    [],
  );

  // ─── Hooks ─────────────────────────────────────────────────────────────────

  const { notifications, fetchNotifications, markAsRead, markAllAsRead } =
    useNotifications({
      currentUserId: currentUser?.id ?? null,
      supabase,
    });

  const {
    orders,
    activeOrders,
    fetchOrders,
    writeLog,
    checkAutoStatus,
    isCreating,
    deletingOrderId,
    handleCreateOrder,
    handleEditOrder,
    handleDeleteOrder,
    handleRestoreOrder,
    handlePermanentDelete,
  } = useOrders({
    supabase,
    currentUser,
    fetchNotifications,
    showAlert,
    showConfirm,
    setView,
  });

  const { fileInputRef, isUploading, triggerUpload, handleFileChange } =
    useUpload({
      supabase,
      currentUser,
      orders,
      selectedOrderId,
      checkAutoStatus,
      writeLog,
      showAlert,
    });

  // ── PERBAIKAN ── sebelumnya `orders.find(...)!` dipakai langsung di JSX
  // dengan non-null assertion — TypeScript percaya hasilnya selalu ada,
  // padahal saat runtime bisa `undefined` (order belum ke-load, race
  // condition setelah create/update gagal, atau sudah dihapus). Itu yang
  // bikin OrderDetail/EditOrder menerima `order=undefined` dan crash.
  // Sekarang dihitung sekali di sini (tanpa `!`), dan render OrderDetail/
  // EditOrder DI-GUARD supaya komponen itu sama sekali tidak di-mount kalau
  // order-nya tidak ketemu — bukan di-guard di dalam komponennya sendiri
  // (early return di dalam komponen sebelum hook lain jalan melanggar Rules
  // of Hooks, itu penyebab error "Rendered more hooks than during the
  // previous render" sebelumnya).
  const selectedOrder = useMemo(
    () => orders.find((o: Order) => o.id === selectedOrderId),
    [orders, selectedOrderId],
  );

  const {
    usersList,
    productionTypes,
    fetchUsers,
    fetchProductionTypes,
    handleSaveUser,
    handleDeleteUser,
    handleSaveType,
    handleDeleteType,
  } = useUsers({ supabase, showAlert, showConfirm });

  // ─── Auth ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const initSession = async () => {
      setLoadingUser(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        const { data: userData } = await supabase
          .from("users")
          .select("*")
          .eq("id", session.user.id)
          .single();
        if (userData) {
          setCurrentUser({
            id: session.user.id,
            username: userData.username || "",
            name: userData.name || "User",
            role: userData.role || "produksi",
            password: "",
            permissions: userData.permissions || DEFAULT_PERMISSIONS,
            address: userData.address,
            dob: userData.dob,
            avatar_url: userData.avatar_url,
          });
        }
      }
      setLoadingUser(false);
    };
    initSession();
  }, [supabase]);

  // ─── Load Data ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!currentUser) return;
    Promise.all([fetchOrders(), fetchUsers(), fetchProductionTypes()]);
  }, [currentUser, fetchOrders, fetchUsers, fetchProductionTypes]);

  // ─── Navigation ────────────────────────────────────────────────────────────

  // ─── Restore state dari URL saat pertama kali mount ─────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const tabFromUrl = params.get("tab");
    const viewFromUrl = params.get("view");
    const orderIdFromUrl = params.get("orderId");
    const poIdFromUrl = params.get("poId");

    if (isValidTab(tabFromUrl)) setActiveTab(tabFromUrl);
    if (
      viewFromUrl === "list" ||
      viewFromUrl === "detail" ||
      viewFromUrl === "create" ||
      viewFromUrl === "edit"
    ) {
      setView(viewFromUrl);
    }
    if (orderIdFromUrl) setSelectedOrderId(orderIdFromUrl);
    if (poIdFromUrl) setSelectedPoId(poIdFromUrl);

    setIsRestored(true);
    // sengaja hanya jalan sekali saat mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Sinkronkan state ke URL setiap kali berubah ─────────────────────────────
  useEffect(() => {
    // jangan push history sebelum restore awal selesai,
    // supaya tidak menimpa state yang baru saja di-restore dari URL
    if (!isRestored) return;

    const params = new URLSearchParams();
    params.set("tab", activeTab);
    if (activeTab === "orders") {
      params.set("view", view);
      if (selectedOrderId) params.set("orderId", selectedOrderId);
    }
    if (activeTab === "po_management" && selectedPoId) {
      params.set("poId", selectedPoId);
    }

    const query = params.toString();
    const newUrl = query ? `?${query}` : window.location.pathname;

    window.history.pushState(
      { tab: activeTab, view, selectedOrderId, selectedPoId },
      "",
      newUrl,
    );
  }, [activeTab, view, selectedOrderId, selectedPoId, isRestored]);

  // ─── Scroll to top saat view atau tab berubah ───────────────────────────────
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [view, selectedOrderId, activeTab]);

  // ── TAMBAHAN ── Tandai "pernah dibuka" sekali saja, supaya SalaryView
  // baru pertama kali di-mount pas user benar2 buka tab Salary (tetap
  // lazy, tidak ikut ke-load di awal kalau user tidak pernah ke tab ini),
  // tapi sesudahnya TIDAK pernah di-unmount lagi walau pindah tab.
  useEffect(() => {
    if (activeTab === "salary") setSalaryMounted(true);
  }, [activeTab]);

  // ── TAMBAHAN ── Redirect balik ke tab asal (mis. "salary") begitu form
  // edit selesai (Batal ATAU Simpan) — keduanya sama-sama berakhir dgn
  // `setView("detail")` (lihat onCancel EditOrder & handleEditOrder di
  // useOrders). Efek ini HANYA jalan kalau `editReturnTab` terisi, yaitu
  // saat edit dipicu langsung dari luar view "detail" (lihat onEditOrder
  // di SalaryView di bawah). Alur normal Detail → Edit → Batal/Simpan
  // TIDAK terpengaruh sama sekali karena `editReturnTab` tetap null di
  // alur itu.
  useEffect(() => {
    if (view === "detail" && editReturnTab) {
      setSelectedOrderId(null);
      setView("list");
      setActiveTab(editReturnTab);
      setEditReturnTab(null);
    }
  }, [view, editReturnTab]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleLogout = useCallback(async () => {
    showConfirm("Logout", "Keluar aplikasi?", async () => {
      await supabase.auth.signOut();
      // Reload halaman ini sendiri — otomatis akan menampilkan
      // <LoginScreen /> lokal karena sesi sudah terhapus (lihat baris
      // "if (!currentUser) return <LoginScreen />" di bawah).
      window.location.reload();
    });
  }, [showConfirm, supabase]);

  const handleUpdateProfile = useCallback(
    async (newData: any) => {
      if (!currentUser) return;
      const { error } = await supabase
        .from("users")
        .update({
          name: newData.name,
          address: newData.address,
          dob: newData.dob,
          avatar_url: newData.avatar_url,
        })
        .eq("id", currentUser.id);
      if (!error) {
        setCurrentUser({ ...currentUser, ...newData });
        setShowProfileModal(false);
        showAlert("Sukses", "Profil diperbarui");
      } else {
        showAlert("Gagal", error.message, "error");
      }
    },
    [currentUser, supabase, showAlert],
  );

  const handleNotificationClick = useCallback(
    async (notificationId: string, orderId: string) => {
      await markAsRead(notificationId);
      setActiveTab("orders");
      setView("detail");
      setSelectedOrderId(orderId);
      setSidebarOpen(false);
    },
    [markAsRead],
  );

  // ─── Guards ────────────────────────────────────────────────────────────────

  if (loadingUser)
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="w-10 h-10 border-4 border-[#49BFB4] border-t-transparent rounded-full animate-spin" />
      </div>
    );

  if (!currentUser) return <LoginScreen />;

  const p = currentUser.permissions;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen overflow-hidden bg-zinc-50 dark:bg-zinc-950 flex flex-col md:flex-row font-sans text-zinc-900 dark:text-zinc-100 relative">
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*,application/pdf"
        onChange={handleFileChange}
      />

      {isUploading && (
        <div className="absolute inset-0 z-9999 bg-zinc-950/80 flex flex-col items-center justify-center text-white">
          <Loader2 className="w-12 h-12 animate-spin mb-3 text-[#49BFB4]" />
          <p className="text-sm font-semibold">Mengupload File...</p>
          <p className="text-xs text-zinc-400 mt-1">
            Mohon tunggu, jangan tutup aplikasi
          </p>
        </div>
      )}

      <CustomAlert alertState={alertState} closeAlert={closeAlert} />

      {currentUser && (
        <ProfileModal
          user={currentUser}
          isOpen={showProfileModal}
          onClose={() => setShowProfileModal(false)}
          onSave={handleUpdateProfile}
        />
      )}

      <Sidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        currentUser={currentUser}
        activeTab={activeTab}
        handleNav={(tab: any) => {
          setActiveTab(tab);
          setView("list");
          setSelectedPoId(null);
          setSidebarOpen(false);
        }}
        onLogout={handleLogout}
        onOpenProfile={() => setShowProfileModal(true)}
      />

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <Header
          currentUser={currentUser}
          onToggleSidebar={() => setSidebarOpen(true)}
          onLogout={handleLogout}
          sidebarOpen={sidebarOpen}
          currentPage={activeTab}
          notifications={notifications}
          onNotificationClick={handleNotificationClick}
          onMarkAllRead={markAllAsRead}
        />

        {/* ref ditambahkan di sini agar scroll bisa dikontrol secara programatik */}
        <main
          ref={mainRef}
          className="flex-1 overflow-y-auto px-4 md:px-6 py-2 md:py-3 pb-32 relative bg-zinc-50 dark:bg-zinc-950 no-scrollbar"
        >
          <div className="w-full h-full">
            {activeTab === "dashboard" && p?.dashboard?.view && (
              <Dashboard
                role={currentUser.role}
                orders={activeOrders}
                onSelectOrder={(id) => {
                  setPreviousTab(activeTab); // simpan "dashboard"
                  setSelectedOrderId(id);
                  setView("detail");
                  setActiveTab("orders");
                }}
              />
            )}

            {activeTab === "orders" && p?.orders?.view && (
              <>
                {view === "list" && (
                  <OrderList
                    role={currentUser.role}
                    orders={activeOrders}
                    productionTypes={productionTypes}
                    onSelectOrder={(id) => {
                      setSelectedOrderId(id);
                      setView("detail");
                    }}
                    onNewOrder={() => setView("create")}
                    onDeleteOrder={handleDeleteOrder}
                    currentUser={currentUser}
                  />
                )}
                {view === "create" && (
                  <CreateOrder
                    users={usersList}
                    productionTypes={productionTypes}
                    onCancel={() => setView("list")}
                    onSubmit={handleCreateOrder}
                    isSubmitting={isCreating}
                  />
                )}
                {view === "edit" &&
                  selectedOrderId &&
                  (selectedOrder ? (
                    <EditOrder
                      users={usersList}
                      order={selectedOrder}
                      productionTypes={productionTypes}
                      onCancel={() => setView("detail")}
                      onSubmit={(d) => handleEditOrder(d, selectedOrderId)}
                    />
                  ) : (
                    <OrderNotFound
                      onBack={() => {
                        setSelectedOrderId(null);
                        setView("list");
                      }}
                    />
                  ))}
                {view === "detail" &&
                  selectedOrderId &&
                  (selectedOrder ? (
                    <OrderDetail
                      currentUser={currentUser}
                      order={selectedOrder}
                      onBack={() => {
                        setSelectedOrderId(null);
                        setView("list");
                        if (previousTab) {
                          setActiveTab(previousTab);
                          setPreviousTab(null);
                        }
                      }}
                      onEdit={() => setView("edit")}
                      onTriggerUpload={triggerUpload}
                      onUpdateOrder={checkAutoStatus}
                      onDelete={handleDeleteOrder}
                      isDeleting={deletingOrderId === selectedOrderId}
                      onConfirm={showConfirm}
                      writeLog={writeLog}
                    />
                  ) : (
                    <OrderNotFound
                      onBack={() => {
                        setSelectedOrderId(null);
                        setView("list");
                        if (previousTab) {
                          setActiveTab(previousTab);
                          setPreviousTab(null);
                        }
                      }}
                    />
                  ))}
              </>
            )}

            {activeTab === "completed_orders" && p?.orders?.view && (
              <CompletedOrders
                orders={activeOrders}
                currentPage={completedOrdersPage}
                onPageChange={setCompletedOrdersPage}
                itemsPerPage={completedOrdersPerPage}
                onItemsPerPageChange={setCompletedOrdersPerPage}
                onSelectOrder={(id) => {
                  setPreviousTab(activeTab);
                  setSelectedOrderId(id);
                  setView("detail");
                  setActiveTab("orders");
                }}
              />
            )}

            {activeTab === "calendar" && (
              <CalendarView
                orders={activeOrders}
                onSelectOrder={(id) => {
                  setPreviousTab(activeTab); // simpan "dashboard"
                  setSelectedOrderId(id);
                  setView("detail");
                  setActiveTab("orders");
                }}
              />
            )}

            {/* ── PERBAIKAN ── Tidak lagi `{activeTab === "salary" && ...}`
                (unmount tiap ganti tab). Tetap di-mount begitu pernah
                dibuka (`salaryMounted`), lalu disembunyikan via CSS kalau
                tab lain aktif — supaya filter/tab internal SalaryView
                (bulan, kategori, user terpilih) tetap sama persis saat
                user balik lagi, misal setelah Simpan/Batal dari form
                edit order. */}
            {p?.salary?.view && salaryMounted && (
              <div
                style={{ display: activeTab === "salary" ? "block" : "none" }}
              >
                <SalaryView
                  users={usersList}
                  orders={orders}
                  currentUser={currentUser}
                  onEditOrder={(order) => {
                    setEditReturnTab("salary"); // trigger redirect balik setelah edit selesai
                    setSelectedOrderId(order.id);
                    setView("edit");
                    setActiveTab("orders");
                  }}
                />
              </div>
            )}
            {activeTab === "nota" && p?.nota?.view && <NotaView />}
            {activeTab === "logs" && p?.logs?.view && <ActivityLogView />}
            {activeTab === "weekly_notes" && p?.logs?.view && (
              <WeeklyNotesView />
            )}
            {activeTab === "finance" && p?.keuangan?.view && (
              <FinanceModule currentUser={currentUser} />
            )}
            {activeTab === "po_management" &&
              (selectedPoId ? (
                <POManagementView
                  poId={selectedPoId}
                  onBack={() => setSelectedPoId(null)}
                />
              ) : (
                <POListSelector onSelect={setSelectedPoId} />
              ))}
            {activeTab === "kalkulator" && p?.kalkulator?.view && (
              <CalculatorView />
            )}
            {activeTab === "config_harga" && p?.config_harga?.view && (
              <ConfigPriceView />
            )}
            {activeTab === "about" && <AboutView />}

            {activeTab === "trash" && p?.trash?.view && (
              <TrashView
                orders={orders.filter((o: Order) => o.deleted_at)}
                onRestore={handleRestoreOrder}
                onPermanentDelete={handlePermanentDelete}
              />
            )}

            {activeTab === "settings" && p?.settings?.view && (
              <SettingsPage
                currentUser={currentUser}
                users={usersList}
                productionTypes={productionTypes}
                onSaveUser={handleSaveUser}
                onDeleteUser={handleDeleteUser}
                onSaveProductionType={handleSaveType}
                onDeleteProductionType={handleDeleteType}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
