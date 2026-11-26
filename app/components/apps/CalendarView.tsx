// app/components/apps/CalendarView.tsx
"use client";

import React, { useState, useMemo, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  parseISO,
} from "date-fns";
import { id } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Package,
  X,
  Clock,
  User,
  Plus,
  Trash2,
  Check,
  Loader2,
  MapPin,
  AlignLeft,
  Users,
  ChevronDown,
  ChevronUp,
  Pencil,
  CalendarClock,
} from "lucide-react";
import { Order, UserData } from "@/types";
import {
  getStatusColor,
  orderTypeLabel,
  isMerchandiseOrder,
} from "@/lib/utils";
import { hasRole } from "@/lib/roles";
import {
  antrianBelumDijadwalkan,
  jadwalOf,
  jumlahMenungguApproval,
  labelPutusan,
  menyentuhHari,
  nilaiJadwal,
  tglIso,
  type JadwalMeja,
} from "@/lib/mejaProduksi";
import JadwalMejaDialog from "./JadwalMejaDialog";
import { VERDICT_BADGE, VERDICT_CHIP, VERDICT_DOT } from "./jadwalMejaStyle";

// 🟢 UPDATE TIPE DATA
interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  event_time?: string; // HH:mm (Bisa kosong)
  location?: string; // Tempat (Bisa kosong)
  color: string;
}

interface CalendarViewProps {
  orders: Order[];
  onSelectOrder: (orderId: string) => void;
  /** Daftar user — dipakai untuk panel "Beban Kerja Petugas Produksi". */
  users?: UserData[];
  /** Boleh mengatur jadwal naik meja (izin Kalender Produksi: Edit). */
  canEditJadwal?: boolean;
  onSaveJadwal?: (
    order: Order,
    jadwal: { mulai: string; durasi: number; gabung: boolean } | null,
  ) => Promise<boolean>;
}

// Statistik beban kerja satu PJ dalam satu bulan.
interface PJStat {
  user: UserData;
  manualOrders: number;
  manualPcs: number;
  dtfOrders: number;
  dtfPcs: number;
  otherOrders: number;
  otherPcs: number;
  totalOrders: number;
  totalPcs: number;
  belumSelesai: number;
  asPJ: number;
  asHelper: number;
}

const isManualJenis = (j?: string | null) => {
  const t = (j ?? "").toLowerCase();
  return t.includes("manual") || t.includes("sablon");
};

// Warna label agenda: pilihan bebas oleh user (bukan token semantik status),
// jadi tetap memakai palet solid -500 standar Tailwind sebagai color picker.
const EVENT_COLORS = [
  { name: "Merah", value: "bg-red-500" },
  { name: "Orange", value: "bg-orange-500" },
  { name: "Kuning", value: "bg-amber-500" },
  { name: "Hijau", value: "bg-emerald-500" },
  { name: "Biru", value: "bg-blue-500" },
  { name: "Ungu", value: "bg-purple-500" },
  { name: "Pink", value: "bg-pink-500" },
  { name: "Abu", value: "bg-zinc-500" },
];

export default function CalendarView({
  orders,
  onSelectOrder,
  users = [],
  canEditJadwal = false,
  onSaveJadwal,
}: CalendarViewProps) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);

  // ── Beban kerja PJ produksi ──
  const [showPJ, setShowPJ] = useState(true);
  // 'deadline' = order yang jatuh tempo di bulan ini (sesuai tampilan kalender)
  // 'masuk'    = order yang masuk/ditugaskan di bulan ini
  const [pjBasis, setPjBasis] = useState<"deadline" | "masuk">("deadline");
  const [selectedPJ, setSelectedPJ] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [mode, setMode] = useState<"meja" | "deadline">("meja");
  const [jadwalTarget, setJadwalTarget] = useState<{
    order: Order;
    defaultMulai: string;
  } | null>(null);
  const [selectedDayEvents, setSelectedDayEvents] = useState<CalendarEvent[]>(
    [],
  );

  // 🟢 FORM STATE (Updated)
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Input Fields
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventTime, setNewEventTime] = useState("");
  const [newEventLocation, setNewEventLocation] = useState("");
  const [newEventColor, setNewEventColor] = useState(EVENT_COLORS[4].value); // Default Biru

  // Fetch Events
  const fetchEvents = async () => {
    try {
      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .order("event_time", { ascending: true }); // Urutkan berdasarkan jam

      if (data) setEvents(data);
    } catch (err) {
      console.error("Err fetch events:", err);
    } finally {
      setIsLoadingEvents(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const resetDate = () => setCurrentDate(new Date());

  const daysInMonth = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: startDate, end: endDate });
  }, [currentDate]);

  // User yang punya role Produksi (termasuk yang ber-role ganda).
  const produksiUsers = useMemo(
    () => users.filter((u) => hasRole(u, "produksi")),
    [users],
  );

  const pjStats = useMemo<PJStat[]>(() => {
    const dateOf = (o: Order) =>
      pjBasis === "deadline" ? o.deadline : o.tanggal_masuk;

    const monthOrders = orders.filter((o) => {
      const raw = dateOf(o);
      if (!raw) return false;
      const d = parseISO(raw);
      return !isNaN(d.getTime()) && isSameMonth(d, currentDate);
    });

    const stats: PJStat[] = produksiUsers.map((user) => {
      const st: PJStat = {
        user,
        manualOrders: 0,
        manualPcs: 0,
        dtfOrders: 0,
        dtfPcs: 0,
        otherOrders: 0,
        otherPcs: 0,
        totalOrders: 0,
        totalPcs: 0,
        belumSelesai: 0,
        asPJ: 0,
        asHelper: 0,
      };
      for (const o of monthOrders) {
        const pcs = Number(o.jumlah) || 0;
        // Petugas produksi = PJ ATAU helper. Order yang sama dihitung sekali per orang.
        const isPJ = o.assigned_to === user.id;
        const isHelper = o.helper_id === user.id && !isPJ;
        if (!isPJ && !isHelper) continue;
        if (isPJ) st.asPJ += 1;
        else st.asHelper += 1;
        if (isMerchandiseOrder(o)) {
          st.otherOrders += 1;
          st.otherPcs += pcs;
        } else if (isManualJenis(o.jenis_produksi)) {
          st.manualOrders += 1;
          st.manualPcs += pcs;
        } else {
          st.dtfOrders += 1;
          st.dtfPcs += pcs;
        }
        st.totalOrders += 1;
        st.totalPcs += pcs;
        if (o.status !== "Selesai") st.belumSelesai += 1;
      }
      return st;
    });

    // Urut dari beban paling ringan → paling berat (memudahkan memilih PJ).
    return stats.sort(
      (a, b) =>
        a.totalPcs - b.totalPcs || a.user.name.localeCompare(b.user.name),
    );
  }, [orders, produksiUsers, currentDate, pjBasis]);

  const maxPcs = useMemo(
    () => Math.max(1, ...pjStats.map((s) => s.totalPcs)),
    [pjStats],
  );

  const getPJName = (o: Order) =>
    o.assigned_user?.name ||
    users.find((u) => u.id === o.assigned_to)?.name ||
    null;

  const matchesPJ = (o: Order) =>
    !selectedPJ || o.assigned_to === selectedPJ || o.helper_id === selectedPJ;

  const deadlineOrdersOn = (day: Date) =>
    orders.filter(
      (o) => !!o.deadline && matchesPJ(o) && isSameDay(parseISO(o.deadline), day),
    );

  const mejaOrdersOn = (day: Date) =>
    orders.filter((o) => {
      const j = jadwalOf(o);
      return !!j && matchesPJ(o) && menyentuhHari(j, day);
    });

  const antrian = useMemo(() => antrianBelumDijadwalkan(orders), [orders]);
  const menungguApproval = useMemo(() => jumlahMenungguApproval(orders), [orders]);

  // Isi modal dihitung dari data terbaru, bukan salinan saat tanggal diklik,
  // supaya jadwal yang baru disimpan langsung tampil.
  const modalDeadline = selectedDate ? deadlineOrdersOn(selectedDate) : [];
  const modalMeja = selectedDate ? mejaOrdersOn(selectedDate) : [];
  const modalMasuk = selectedDate
    ? antrian.filter(
        (o) => !!o.tanggal_masuk && isSameDay(parseISO(o.tanggal_masuk), selectedDate),
      )
    : [];

  const bukaJadwal = (order: Order, defaultMulai?: string) => {
    // Order lama boleh dijadwalkan di tanggal lampau, tetapi tawaran awalnya hari ini atau tanggal masuk bila lebih baru.
    const hariIni = tglIso(new Date());
    const masuk = order.tanggal_masuk?.slice(0, 10) ?? "";
    setJadwalTarget({
      order,
      defaultMulai: defaultMulai ?? (masuk > hariIni ? masuk : hariIni),
    });
  };

  const penilaianOf = (o: Order, j: JadwalMeja) => nilaiJadwal(j.selesai, o.deadline);

  const handleDateClick = (day: Date) => {
    // Filter dan urutkan agenda berdasarkan jam
    const dayEvents = events
      .filter((e) => isSameDay(parseISO(e.date), day))
      .sort((a, b) => (a.event_time || "").localeCompare(b.event_time || ""));

    setSelectedDate(day);
    setSelectedDayEvents(dayEvents);
    setIsModalOpen(true);
    setIsAddingEvent(false);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedDate(null);
    setSelectedDayEvents([]);
    setIsAddingEvent(false);
  };

  const resetForm = () => {
    setNewEventTitle("");
    setNewEventTime("");
    setNewEventLocation("");
    setNewEventColor(EVENT_COLORS[4].value);
    setIsAddingEvent(false);
  };

  // 🟢 SIMPAN KE SUPABASE (Updated fields)
  const handleAddEvent = async () => {
    if (!newEventTitle.trim() || !selectedDate) return;
    setIsSaving(true);

    const payload = {
      title: newEventTitle,
      date: format(selectedDate, "yyyy-MM-dd"),
      event_time: newEventTime || null, // Kirim null jika kosong
      location: newEventLocation || null,
      color: newEventColor,
    };

    const { data, error } = await supabase
      .from("calendar_events")
      .insert([payload])
      .select()
      .single();

    if (!error && data) {
      const updatedList = [...events, data];
      setEvents(updatedList);

      // Update tampilan modal langsung & urutkan ulang
      const updatedDayEvents = [...selectedDayEvents, data].sort((a, b) =>
        (a.event_time || "").localeCompare(b.event_time || ""),
      );
      setSelectedDayEvents(updatedDayEvents);

      resetForm();
    } else {
      alert("Gagal menyimpan agenda.");
    }
    setIsSaving(false);
  };

  const handleDeleteEvent = async (id: string) => {
    const prevEvents = [...events];
    const prevSelected = [...selectedDayEvents];

    setEvents(events.filter((e) => e.id !== id));
    setSelectedDayEvents(selectedDayEvents.filter((e) => e.id !== id));

    const { error } = await supabase
      .from("calendar_events")
      .delete()
      .eq("id", id);

    if (error) {
      setEvents(prevEvents);
      setSelectedDayEvents(prevSelected);
      alert("Gagal menghapus.");
    }
  };

  // Helper warna dot status order (mobile) — diselaraskan dengan token status
  // yang sudah dipakai di HeroSection & ActionList (kendala=ungu, urgent=oranye,
  // aman/selesai=emerald). "Pesanan Masuk" & "Kirim" bukan bagian dari 4 token
  // semantik itu, jadi dipetakan ke warna netral berbeda agar tidak tabrakan makna.
  const getDotColor = (status: string) => {
    switch (status) {
      case "Selesai":
        return "bg-emerald-600";
      case "Ada Kendala":
        return "bg-purple-600";
      case "Pesanan Masuk":
        return "bg-[#2589ff]";
      case "Kirim":
        return "bg-cyan-600";
      case "On Process":
        return "bg-amber-600";
      case "Finishing":
        return "bg-lime-600";
      default:
        return "bg-zinc-400";
    }
  };

  return (
    <div className="flex flex-col md:flex-row gap-3 w-full p-4 md:p-0 mb-20 md:mb-0 h-auto md:h-[calc(100vh-120px)]">
      <div className="flex-1 min-w-0 bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col h-auto md:h-full">
        {/* HEADER */}
        <div className="flex-none flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 z-10">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 capitalize leading-none tracking-tight">
              {format(currentDate, "MMMM yyyy", { locale: id })}
            </h2>
            <p className="text-[10px] md:text-xs text-zinc-500 dark:text-zinc-400 mt-1 hidden md:block">
              {isLoadingEvents
                ? "Memuat..."
                : mode === "meja"
                  ? "Jadwal naik meja produksi & agenda"
                  : "Deadline order & agenda"}
            </p>
          </div>

          <div className="flex items-center gap-0.5 bg-zinc-50 dark:bg-zinc-900 p-0.5 rounded-md border border-zinc-200 dark:border-zinc-800">
            {(
              [
                { v: "meja", l: "Jadwal Meja" },
                { v: "deadline", l: "Deadline" },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                onClick={() => setMode(o.v)}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded transition-colors duration-150 ${
                  mode === o.v
                    ? "bg-[#124540] text-white"
                    : "text-zinc-500 dark:text-zinc-400 hover:bg-white dark:hover:bg-zinc-800"
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-zinc-50 dark:bg-zinc-900 p-1 rounded-md border border-zinc-200 dark:border-zinc-800">
            <button
              onClick={prevMonth}
              className="p-1.5 hover:bg-white dark:hover:bg-zinc-800 rounded-md transition-colors duration-150 text-zinc-600 dark:text-zinc-300"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={resetDate}
              className="px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800 rounded-md transition-colors duration-150"
            >
              Hari Ini
            </button>
            <button
              onClick={nextMonth}
              className="p-1.5 hover:bg-white dark:hover:bg-zinc-800 rounded-md transition-colors duration-150 text-zinc-600 dark:text-zinc-300"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* NAMA HARI */}
        <div className="flex-none grid grid-cols-7 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
          {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((day) => (
            <div
              key={day}
              className="py-3 text-center text-[10px] md:text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em]"
            >
              {day}
            </div>
          ))}
        </div>

        {/* GRID TANGGAL */}
        <div className="flex-none md:flex-1 md:min-h-0 h-auto bg-zinc-100 dark:bg-zinc-900">
          <div className="grid grid-cols-7 gap-[1px] border-b border-zinc-200 dark:border-zinc-800 md:h-full md:auto-rows-fr">
            {daysInMonth.map((day, idx) => {
              const dayOrders =
                mode === "meja" ? mejaOrdersOn(day) : deadlineOrdersOn(day);
              const dayDeadlineCount =
                mode === "meja" ? deadlineOrdersOn(day).length : 0;
              const dayPcs =
                mode === "meja"
                  ? dayOrders.reduce((n, o) => n + (Number(o.jumlah) || 0), 0)
                  : 0;

              // Filter agenda & urutkan jam
              const dayEvents = events
                .filter((e) => isSameDay(parseISO(e.date), day))
                .sort((a, b) =>
                  (a.event_time || "").localeCompare(b.event_time || ""),
                );

              const isCurrentMonth = isSameMonth(day, currentDate);
              const isToday = isSameDay(day, new Date());

              return (
                <div
                  key={idx}
                  onClick={() => handleDateClick(day)}
                  className={`
                    relative p-1 md:p-2 flex flex-col gap-1 transition-colors duration-150 cursor-pointer group outline-none
                    min-h-[5.5rem] md:min-h-0 md:overflow-hidden items-center md:items-stretch
                    aspect-auto
                    ${
                      isCurrentMonth
                        ? "bg-white dark:bg-zinc-950 hover:bg-[#124540]/5 dark:hover:bg-[#124540]/10"
                        : "bg-zinc-50/50 dark:bg-zinc-950/40 text-zinc-400"
                    }
                  `}
                >
                  <div className="flex justify-center md:justify-between items-center w-full mt-1 md:mt-0">
                    <span
                      className={`
                      text-xs md:text-sm font-semibold w-6 h-6 md:w-7 md:h-7 flex items-center justify-center rounded-full transition-colors duration-150
                      ${
                        isToday
                          ? "bg-[#124540] text-white"
                          : isCurrentMonth
                            ? "text-zinc-700 dark:text-zinc-300"
                            : "text-zinc-400"
                      }
                    `}
                    >
                      {format(day, "d")}
                    </span>
                    <div className="hidden md:flex items-center gap-1">
                      {dayDeadlineCount > 0 && (
                        <span
                          title={`${dayDeadlineCount} order deadline di tanggal ini`}
                          className="font-mono tabular-nums text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 border border-dashed border-zinc-400 dark:border-zinc-600"
                        >
                          DL {dayDeadlineCount}
                        </span>
                      )}
                      {(dayOrders.length > 0 || dayEvents.length > 0) && (
                        <span
                          title={
                            mode === "meja"
                              ? `${dayOrders.length} order di meja · ${dayPcs} pcs`
                              : undefined
                          }
                          className="font-mono tabular-nums text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700"
                        >
                          {dayOrders.length + dayEvents.length}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* DESKTOP LIST — maksimal 3 baris agar sel tidak melebar */}
                  <div className="hidden md:flex flex-col gap-0.5 mt-0.5 w-full min-h-0">
                    {dayEvents.slice(0, 3).map((event) => (
                      <div
                        key={event.id}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold truncate text-white ${event.color} flex items-center gap-1`}
                      >
                        {event.event_time && (
                          <span className="font-mono text-[9px] opacity-90">
                            {event.event_time}
                          </span>
                        )}
                        <span className="truncate">{event.title}</span>
                      </div>
                    ))}

                    {dayOrders
                      .slice(0, Math.max(0, 3 - Math.min(dayEvents.length, 3)))
                      .map((order) => {
                        const j = mode === "meja" ? jadwalOf(order) : null;
                        if (!j) {
                          return (
                            <div
                              key={order.id}
                              className={`px-1.5 py-0.5 rounded border-l-[3px] text-[10px] font-semibold truncate opacity-90 text-left ${getStatusColor(order.status)}`}
                            >
                              {order.nama_pemesan}
                            </div>
                          );
                        }
                        const tag = isSameDay(j.mulai, day)
                          ? "Naik · "
                          : isSameDay(j.selesai, day)
                            ? "Selesai · "
                            : "";
                        return (
                          <div
                            key={order.id}
                            className={`px-1.5 py-0.5 rounded border-l-[3px] text-[10px] font-semibold truncate text-left ${VERDICT_CHIP[penilaianOf(order, j).putusan]}`}
                          >
                            {tag}
                            {order.nama_pemesan}
                          </div>
                        );
                      })}
                    {dayOrders.length + dayEvents.length > 3 && (
                      <div className="text-[9px] text-center text-zinc-400 font-medium">
                        + {dayOrders.length + dayEvents.length - 3} lagi
                      </div>
                    )}
                  </div>

                  {/* MOBILE DOTS */}
                  <div className="flex md:hidden flex-wrap justify-center content-start gap-1 mt-1.5 px-0.5 w-full">
                    {dayEvents.map((event) => (
                      <div
                        key={event.id}
                        className={`w-1.5 h-1.5 rounded-full ${event.color}`}
                      />
                    ))}
                    {dayOrders.slice(0, 6).map((order, i) => {
                      const j = mode === "meja" ? jadwalOf(order) : null;
                      return (
                        <div
                          key={i}
                          className={`w-1.5 h-1.5 rounded-full ${
                            j
                              ? VERDICT_DOT[penilaianOf(order, j).putusan]
                              : getDotColor(order.status)
                          }`}
                        />
                      );
                    })}
                    {dayOrders.length + dayEvents.length > 6 && (
                      <span className="text-[6px] text-zinc-400 leading-none self-center">
                        +
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* SIDEBAR: BEBAN KERJA PJ PRODUKSI (kanan di desktop, di bawah kalender di mobile) */}
      {(produksiUsers.length > 0 || mode === "meja") && (
        <div className="w-full md:w-[270px] xl:w-[300px] shrink-0 flex flex-col gap-3 h-auto md:h-full">
      {mode === "meja" && (
        <section className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col md:max-h-[50%] md:min-h-[8rem]">
          <div className="flex-none p-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                <CalendarClock className="w-4 h-4 text-[#124540] dark:text-[#42938b]" />
                Belum naik meja
              </span>
              <span className="font-mono tabular-nums text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300">
                {antrian.length}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
              {canEditJadwal
                ? "Order Manual dengan Approval terbit. Klik untuk menentukan tanggal naik meja."
                : "Order Manual dengan Approval terbit yang belum punya jadwal."}
            </p>
          </div>
          <div className="flex flex-col gap-1.5 p-2.5 md:flex-1 md:min-h-0 md:overflow-y-auto custom-scrollbar max-h-72 md:max-h-none overflow-y-auto">
            {antrian.length === 0 && (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 py-3 text-center">
                Semua order sudah dijadwalkan.
              </p>
            )}
            {menungguApproval > 0 && (
              <p className="text-[10px] text-zinc-400 leading-snug px-1">
                {menungguApproval} order Manual menunggu Approval terbit.
              </p>
            )}
            {antrian.map((o) => (
              <button
                key={o.id}
                onClick={() =>
                  canEditJadwal ? bukaJadwal(o) : onSelectOrder(o.id)
                }
                className="w-full text-left p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-[#124540]/50 transition-colors duration-150"
              >
                <span className="block text-[12px] font-semibold text-zinc-800 dark:text-zinc-100 truncate">
                  {o.nama_pemesan}
                </span>
                <span className="block mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                  <span className="font-mono tabular-nums">{o.jumlah} pcs</span>
                  {o.tanggal_masuk &&
                    ` · masuk ${format(parseISO(o.tanggal_masuk), "d MMM", { locale: id })}`}
                  {o.deadline &&
                    ` · deadline ${format(parseISO(o.deadline), "d MMM", { locale: id })}`}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      {produksiUsers.length > 0 && (
        <aside className="w-full bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col h-auto md:flex-1 md:min-h-0">
          <div className="flex-none p-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
            <button
              onClick={() => setShowPJ((v) => !v)}
              className="w-full flex items-center justify-between gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200 md:cursor-default"
            >
              <span className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#124540] dark:text-[#42938b]" />
                Beban Kerja Petugas Produksi
              </span>
              <span className="md:hidden">
                {showPJ ? (
                  <ChevronUp className="w-4 h-4 text-zinc-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-zinc-400" />
                )}
              </span>
            </button>
            <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400 capitalize">
              {format(currentDate, "MMMM yyyy", { locale: id })}
            </p>

            <div
              className={`${showPJ ? "flex" : "hidden md:flex"} mt-2 items-center gap-1 bg-white dark:bg-zinc-950 p-0.5 rounded-md border border-zinc-200 dark:border-zinc-800`}
            >
              {(
                [
                  { v: "deadline", l: "Deadline" },
                  { v: "masuk", l: "Tgl Masuk" },
                ] as const
              ).map((o) => (
                <button
                  key={o.v}
                  onClick={() => setPjBasis(o.v)}
                  className={`flex-1 px-2 py-1 text-[10px] font-semibold rounded transition-colors duration-150 ${
                    pjBasis === o.v
                      ? "bg-[#124540] text-white"
                      : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>

          <div
            className={`${showPJ ? "flex" : "hidden md:flex"} flex-col gap-2 p-3 md:flex-1 md:min-h-0 md:overflow-y-auto custom-scrollbar`}
          >
            {pjStats.map((s, i) => {
              const isSelected = selectedPJ === s.user.id;
              const isLightest =
                i === 0 &&
                pjStats.length > 1 &&
                s.totalPcs < pjStats[pjStats.length - 1].totalPcs;
              return (
                <button
                  key={s.user.id}
                  onClick={() => setSelectedPJ(isSelected ? null : s.user.id)}
                  title="Klik untuk menyorot order petugas ini di kalender"
                  className={`w-full text-left p-2.5 rounded-lg border bg-white dark:bg-zinc-950 transition-colors duration-150 ${
                    isSelected
                      ? "border-[#124540] ring-1 ring-[#124540]"
                      : "border-zinc-200 dark:border-zinc-800 hover:border-[#124540]/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-100 truncate">
                      {s.user.name}
                    </span>
                    {isLightest && (
                      <span className="shrink-0 text-[8px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">
                        Teringan
                      </span>
                    )}
                  </div>

                  <div className="space-y-0.5 text-[11px] text-zinc-600 dark:text-zinc-400">
                    <div className="flex justify-between">
                      <span>Manual</span>
                      <span className="font-mono tabular-nums">
                        {s.manualOrders} order ·{" "}
                        {s.manualPcs.toLocaleString("id-ID")} pcs
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>DTF</span>
                      <span className="font-mono tabular-nums">
                        {s.dtfOrders} order · {s.dtfPcs.toLocaleString("id-ID")}{" "}
                        pcs
                      </span>
                    </div>
                    {s.otherOrders > 0 && (
                      <div className="flex justify-between">
                        <span>Merchandise</span>
                        <span className="font-mono tabular-nums">
                          {s.otherOrders} order ·{" "}
                          {s.otherPcs.toLocaleString("id-ID")} pcs
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-1.5 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#124540]"
                      style={{ width: `${(s.totalPcs / maxPcs) * 100}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] font-semibold text-zinc-700 dark:text-zinc-300">
                    <span className="font-mono tabular-nums">
                      Total {s.totalPcs.toLocaleString("id-ID")} pcs
                    </span>
                    <span className="font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                      {s.belumSelesai} berjalan
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                    {s.asPJ} sebagai PJ
                    {s.asHelper > 0 && (
                      <span className="text-orange-600 dark:text-orange-400">
                        {" "}
                        · {s.asHelper} sebagai helper
                      </span>
                    )}
                  </p>
                </button>
              );
            })}

            <p className="text-[10px] text-zinc-400 leading-snug">
              {pjBasis === "deadline"
                ? "Dihitung dari order yang deadline-nya bulan ini."
                : "Dihitung dari order yang masuk bulan ini."}{" "}
              Termasuk order yang dikerjakan sebagai helper. Diurutkan dari
              beban teringan.
              {selectedPJ &&
                " Kalender hanya menampilkan order petugas terpilih."}
            </p>
          </div>
        </aside>
      )}
        </div>
      )}

      {/* 🟢 MODAL POPUP */}
      {isModalOpen && selectedDate && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-zinc-950/80"
            onClick={closeModal}
          ></div>
          <div className="relative z-10 w-full max-w-md bg-white dark:bg-zinc-950 rounded-xl flex flex-col max-h-[85vh] border border-zinc-200 dark:border-zinc-800">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 md:p-5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 rounded-t-xl">
              <div>
                <h3 className="text-base md:text-lg font-semibold text-zinc-900 dark:text-white capitalize leading-tight tracking-tight">
                  {format(selectedDate, "EEEE, d MMMM yyyy", { locale: id })}
                </h3>
                <p className="text-[10px] md:text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  {modalMeja.length} di meja • {modalDeadline.length} deadline •{" "}
                  {selectedDayEvents.length} Agenda
                </p>
              </div>
              <button
                onClick={closeModal}
                className="p-2 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 transition-colors duration-150"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 md:p-5 custom-scrollbar bg-zinc-50 dark:bg-zinc-950">
              {/* 🟢 FORM TAMBAH AGENDA (Lebih Lengkap) */}
              {isAddingEvent ? (
                <div className="mb-6 p-4 bg-white dark:bg-zinc-900 rounded-xl border border-[#124540]/30">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
                      <Plus className="w-4 h-4 text-[#49BFB4]" /> Agenda Baru
                    </h4>
                    <button
                      onClick={resetForm}
                      className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-full transition-colors duration-150"
                    >
                      <X className="w-3.5 h-3.5 text-zinc-400" />
                    </button>
                  </div>

                  {/* Input Judul */}
                  <input
                    type="text"
                    placeholder="Judul agenda"
                    className="w-full mb-3 px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 focus:ring-2 focus:ring-[#124540] outline-none transition-colors duration-150"
                    value={newEventTitle}
                    onChange={(e) => setNewEventTitle(e.target.value)}
                    autoFocus
                  />

                  {/* Input Waktu & Lokasi */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Clock className="w-4 h-4 text-zinc-400" />
                      </div>
                      <input
                        type="time"
                        className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 focus:ring-2 focus:ring-[#124540] outline-none transition-colors duration-150"
                        value={newEventTime}
                        onChange={(e) => setNewEventTime(e.target.value)}
                      />
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <MapPin className="w-4 h-4 text-zinc-400" />
                      </div>
                      <input
                        type="text"
                        placeholder="Lokasi"
                        className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 focus:ring-2 focus:ring-[#124540] outline-none truncate transition-colors duration-150"
                        value={newEventLocation}
                        onChange={(e) => setNewEventLocation(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Pilihan Warna */}
                  <div className="mb-4">
                    <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 mb-2 uppercase tracking-[0.12em]">
                      Label Warna
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      {EVENT_COLORS.map((c) => (
                        <button
                          key={c.value}
                          onClick={() => setNewEventColor(c.value)}
                          className={`w-6 h-6 rounded-full ${c.value} transition-colors duration-150 flex items-center justify-center ${newEventColor === c.value ? "ring-2 ring-offset-2 ring-zinc-400 dark:ring-offset-zinc-900" : ""}`}
                        >
                          {newEventColor === c.value && (
                            <Check className="w-3 h-3 text-white" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end pt-2 border-t border-zinc-100 dark:border-zinc-700">
                    <button
                      onClick={handleAddEvent}
                      disabled={isSaving}
                      className="w-full py-2 text-xs font-semibold bg-[#124540] text-white hover:bg-[#0d332f] rounded-md transition-colors duration-150 flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {isSaving ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        "Simpan Agenda"
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsAddingEvent(true)}
                  className="w-full mb-5 py-2.5 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold text-zinc-500 hover:bg-white hover:border-[#124540]/50 hover:text-white dark:hover:bg-[#124540] transition-colors duration-150"
                >
                  <Plus className="w-4 h-4" /> Tambah Agenda Baru
                </button>
              )}

              {/* 🟢 LIST DISPLAY (Updated UI) */}
              <div className="space-y-6">
                {/* Agenda Section */}
                {selectedDayEvents.length > 0 && (
                  <div>
                    <h5 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-[0.14em] mb-3 flex items-center gap-2">
                      <AlignLeft className="w-3 h-3" /> Agenda Kegiatan
                    </h5>
                    <div className="space-y-2">
                      {selectedDayEvents.map((event) => (
                        <div
                          key={event.id}
                          className="group flex items-start gap-3 bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-[#2589ff]/40 transition-colors duration-150"
                        >
                          {/* Warna Bar Samping */}
                          <div
                            className={`w-1 self-stretch rounded-full ${event.color} flex-shrink-0`}
                          ></div>

                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 truncate">
                              {event.title}
                            </h4>
                            {(event.event_time || event.location) && (
                              <div className="flex flex-wrap gap-3 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                {event.event_time && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />{" "}
                                    {event.event_time}
                                  </span>
                                )}
                                {event.location && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />{" "}
                                    {event.location}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          <button
                            onClick={() => handleDeleteEvent(event.id)}
                            className="text-zinc-300 hover:text-red-500 transition-colors duration-150 p-1 opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Order yang sedang di meja produksi */}
                {modalMeja.length > 0 && (
                  <div>
                    <h5 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-[0.14em] mb-3 flex items-center gap-2">
                      <CalendarClock className="w-3 h-3" /> Di Meja Produksi
                    </h5>
                    <div className="space-y-3">
                      {modalMeja.map((order) => {
                        const j = jadwalOf(order)!;
                        const n = penilaianOf(order, j);
                        return (
                          <div
                            key={order.id}
                            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3"
                          >
                            <div className="flex justify-between items-start gap-2 mb-1.5">
                              <span
                                className={`px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide ${VERDICT_BADGE[n.putusan]}`}
                              >
                                {labelPutusan(n)}
                              </span>
                              <span className="text-[9px] font-mono tabular-nums font-semibold text-zinc-400 dark:text-zinc-500">
                                {order.kode_produksi?.split("-").pop() || "#???"}
                              </span>
                            </div>
                            <button
                              onClick={() => {
                                onSelectOrder(order.id);
                                closeModal();
                              }}
                              className="text-left text-sm font-semibold text-zinc-800 dark:text-zinc-100 hover:text-[#2589ff] transition-colors duration-150 line-clamp-1"
                            >
                              {order.nama_pemesan}
                            </button>
                            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                              <span className="font-mono tabular-nums">
                                {order.jumlah} pcs
                              </span>
                              {" · "}
                              {format(j.mulai, "d MMM", { locale: id })} sampai{" "}
                              {format(j.selesai, "d MMM", { locale: id })} (
                              {j.durasi} hari)
                            </p>
                            {order.meja_gabung && (
                              <p className="mt-0.5 text-xs text-sky-700 dark:text-sky-400">
                                Bisa digabung dengan order lain
                              </p>
                            )}
                            {order.deadline && (
                              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                                Deadline customer{" "}
                                {format(parseISO(order.deadline), "d MMM yyyy", {
                                  locale: id,
                                })}
                              </p>
                            )}
                            {canEditJadwal && (
                              <button
                                onClick={() => bukaJadwal(order)}
                                className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#124540] dark:text-[#42938b] hover:underline"
                              >
                                <Pencil className="w-3 h-3" /> Ubah jadwal
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Order masuk di tanggal ini yang belum punya jadwal */}
                {modalMasuk.length > 0 && (
                  <div>
                    <h5 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-[0.14em] mb-3 flex items-center gap-2">
                      <Package className="w-3 h-3" /> Masuk, belum naik meja
                    </h5>
                    <div className="space-y-2">
                      {modalMasuk.map((order) => (
                        <div
                          key={order.id}
                          className="flex items-center justify-between gap-3 bg-white dark:bg-zinc-900 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl p-3"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">
                              {order.nama_pemesan}
                            </p>
                            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                              <span className="font-mono tabular-nums">
                                {order.jumlah} pcs
                              </span>
                              {order.deadline &&
                                ` · deadline ${format(parseISO(order.deadline), "d MMM", { locale: id })}`}
                            </p>
                          </div>
                          {canEditJadwal && (
                            <button
                              onClick={() => bukaJadwal(order, tglIso(selectedDate))}
                              className="shrink-0 px-3 py-1.5 text-[11px] font-semibold bg-[#124540] text-white hover:bg-[#0d332f] rounded-md transition-colors duration-150"
                            >
                              Atur jadwal
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pesanan Section */}
                {modalDeadline.length > 0 && (
                  <div>
                    <h5 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-[0.14em] mb-3 flex items-center gap-2">
                      <Package className="w-3 h-3" /> Deadline Produksi
                    </h5>
                    <div className="space-y-3">
                      {modalDeadline.map((order) => (
                        <div
                          key={order.id}
                          onClick={() => {
                            onSelectOrder(order.id);
                            closeModal();
                          }}
                          className="group relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-[#2589ff]/50 rounded-xl p-3 cursor-pointer transition-colors duration-150"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide border ${getStatusColor(order.status)}`}
                            >
                              {order.status}
                            </span>
                            <span className="text-[9px] font-mono tabular-nums font-semibold text-zinc-400 dark:text-zinc-500">
                              {order.kode_produksi?.split("-").pop() || "#???"}
                            </span>
                          </div>
                          <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 mb-1 group-hover:text-[#2589ff] transition-colors duration-150 line-clamp-1">
                            {order.nama_pemesan}
                          </h4>
                          <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                            <span className="font-mono tabular-nums">
                              {order.jumlah} pcs
                            </span>
                            <span className="w-1 h-1 rounded-full bg-zinc-300"></span>
                            <span>{orderTypeLabel(order)}</span>
                          </div>
                          {getPJName(order) && (
                            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                              <User className="w-3 h-3" /> PJ:{" "}
                              <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                                {getPJName(order)}
                              </span>
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty State */}
                {selectedDayEvents.length === 0 &&
                  modalDeadline.length === 0 &&
                  modalMeja.length === 0 &&
                  modalMasuk.length === 0 &&
                  !isAddingEvent && (
                    <div className="flex flex-col items-center justify-center py-10 text-zinc-400 opacity-60">
                      <Clock className="w-12 h-12 mb-3 stroke-1" />
                      <p className="text-sm font-medium">
                        Tidak ada kegiatan hari ini
                      </p>
                    </div>
                  )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 md:p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-b-xl flex justify-end">
              <button
                onClick={closeModal}
                className="px-5 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors duration-150"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {jadwalTarget && onSaveJadwal && (
        <JadwalMejaDialog
          order={jadwalTarget.order}
          orders={orders}
          defaultMulai={jadwalTarget.defaultMulai}
          onClose={() => setJadwalTarget(null)}
          onSave={(jadwal) => onSaveJadwal(jadwalTarget.order, jadwal)}
        />
      )}
    </div>
  );
}
