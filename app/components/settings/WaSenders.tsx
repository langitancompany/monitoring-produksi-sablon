// app/components/settings/WaSenders.tsx
// Daftar kartu "Nomor pengirim" di Pengaturan → Notifikasi. Satu kartu per nomor WhatsApp:
// nama, status koneksi, bar sisa pemakaian (per jam & per 24 jam, ditumpuk atas-bawah) khusus nomor itu,
// ringkasan tugasnya, dan antrian pesan yang menjadi bagian nomor itu (menunggu & gagal). Antrian dibagi
// per nomor menurut jenis pesannya, mengikuti aturan gateway. Kartu hanya punya dua tombol ikon: pena (buka
// pop-up pengaturan: nama, tugas, hidup/mati, QR) dan tong sampah (hapus, dengan konfirmasi). Menambah nomor
// juga lewat pop-up, jadi daftar tetap pendek.
// - Nomor utama = nomor yang sudah ada (QR-nya di kartu koneksi di atas). Tugasnya boleh dibiarkan
//   "semua pesan yang tidak dipegang nomor lain" atau dibatasi ke jenis pesan tertentu.
// - Nomor tambahan hanya mengirim jenis pesan yang dicentang. Selama belum terhubung (menunggu scan QR,
//   dibatasi WhatsApp, atau dimatikan), tugasnya otomatis dikerjakan nomor utama supaya notifikasi tidak tertahan.
// Daftar disimpan lewat /api/wa/senders; gateway membacanya tiap ±30 detik.
"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Power, Pencil, X, Smartphone, TriangleAlert, Inbox, XCircle } from "lucide-react";
import { pemilikEvent, type PemegangNomor } from "@/lib/waSenders";
import { kapan, lamaMenunggu, namaEvent, warnaPemakaian, type WaQueueInfo } from "@/app/components/settings/waUsageShared";

interface Tugas { key: string; label: string; desc: string; events: string[] }
interface Sender { id: string; label: string; enabled: boolean; is_default: boolean; tasks: string[] }
interface Live {
  id: string;
  wa: "starting" | "qr" | "open" | "closed";
  reason: string | null;
  sent_last_hour: number;
  sent_last_day: number;
  hour_frees_at?: string | null;
  day_frees_at?: string | null;
  limits?: { per_hour: number; per_day: number };
  paused_until: string | null;
}
type Msg = { type: "ok" | "err"; text: string } | null;

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { cache: "no-store", ...init });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data: data as any };
}
const kirim = (method: string, body: unknown) =>
  api("/api/wa/senders", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const inputCls =
  "w-full border border-zinc-200 dark:border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600 transition-colors duration-150 placeholder-zinc-400 dark:placeholder-zinc-500";
const cardCls = "bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800";
const btnPrimary =
  "shrink-0 flex items-center justify-center gap-2 bg-[#124540] hover:bg-[#0d332f] text-white px-4 py-2 rounded-md text-sm font-semibold transition-colors duration-150 disabled:opacity-50";
const btnGhost =
  "shrink-0 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-semibold border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150 disabled:opacity-50";

const btnIcon =
  "shrink-0 flex items-center justify-center w-8 h-8 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150 disabled:opacity-50";

function Status({ live, enabled }: { live?: Live; enabled: boolean }) {
  let teks = "Menunggu gateway";
  let cls = "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400";
  if (!enabled) {
    teks = "Dimatikan";
  } else if (live) {
    if (live.paused_until) { teks = "Dijeda"; cls = "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"; }
    else if (live.wa === "open") { teks = "Terhubung"; cls = "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"; }
    else if (live.wa === "qr") { teks = "Menunggu scan QR"; cls = "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"; }
    else if (live.reason === "forbidden") { teks = "Dibatasi WhatsApp"; cls = "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"; }
    else if (live.wa === "closed") { teks = "Terputus"; cls = "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"; }
    else teks = "Memulai";
  }
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>{teks}</span>;
}

// Bar tipis sisa pemakaian satu nomor
function BarNomor({ label, used, max, freesAt }: { label: string; used: number; max: number; freesAt?: string | null }) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const penuh = max > 0 && used >= max;
  const c = warnaPemakaian(pct);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">{label}</span>
        <span className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
          <span className={`font-semibold ${c.text}`}>{used}</span> / {max}
          <span className="ml-1.5">· sisa {Math.max(0, max - used)}</span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(used, max)}
        className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden"
      >
        <div className={`h-full rounded-full transition-all duration-500 ${c.bar}`} style={{ width: `${pct}%` }} />
      </div>
      {penuh && freesAt && (
        <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">Tersedia lagi sekitar {kapan(freesAt)}</p>
      )}
    </div>
  );
}

// Kotak centang tugas. Tugas yang sudah dipegang nomor lain dinonaktifkan.
function PilihTugas({
  tugas, dipilih, onChange, dipakaiLain,
}: {
  tugas: Tugas[];
  dipilih: string[];
  onChange: (next: string[]) => void;
  dipakaiLain: Record<string, string>;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {tugas.map((t) => {
        const milikLain = dipakaiLain[t.key];
        const on = dipilih.includes(t.key);
        return (
          <label
            key={t.key}
            className={`flex items-start gap-2 rounded-md border border-zinc-200 dark:border-zinc-800 p-2.5 ${milikLain ? "opacity-50" : "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900"}`}
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={on}
              disabled={!!milikLain}
              onChange={() => onChange(on ? dipilih.filter((k) => k !== t.key) : [...dipilih, t.key])}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">{t.label}</span>
              <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">
                {milikLain ? `Dipegang ${milikLain}` : t.desc}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

const MAKS_CHIP = 3;

function RingkasTugas({ s, tugas }: { s: Sender; tugas: Tugas[] }) {
  const nama = (k: string) => tugas.find((t) => t.key === k)?.label ?? k;
  if (s.is_default && s.tasks.length === 0) {
    return (
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
        Semua jenis pesan yang tidak dipegang nomor lain
      </p>
    );
  }
  if (s.tasks.length === 0) {
    return <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Belum punya tugas, tidak mengirim apa pun</p>;
  }
  const tampil = s.tasks.slice(0, MAKS_CHIP);
  const sisa = s.tasks.length - tampil.length;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tampil.map((k) => (
        <span key={k} className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          {nama(k)}
        </span>
      ))}
      {sisa > 0 && (
        <span
          className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400"
          title={s.tasks.slice(MAKS_CHIP).map(nama).join(", ")}
        >
          +{sisa} lainnya
        </span>
      )}
    </div>
  );
}

// Pop-up di atas halaman: tutup dengan tombol X, Escape, atau klik latar.
function Modal({
  judul, subjudul, onClose, children, footer,
}: {
  judul: string;
  subjudul?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const tutup = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", tutup);
    const lama = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", tutup); document.body.style.overflow = lama; };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={judul}
        className="w-full sm:max-w-xl max-h-[92vh] flex flex-col bg-white dark:bg-zinc-950 rounded-t-xl sm:rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{judul}</p>
            {subjudul && <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{subjudul}</div>}
          </div>
          <button type="button" className={btnIcon} onClick={onClose} aria-label="Tutup">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-2 flex-wrap">{footer}</div>
        )}
      </div>
    </div>
  );
}

type Dialog = { mode: "tambah" } | { mode: "atur"; id: string } | { mode: "hapus"; id: string } | null;

export default function WaSenders({
  configured, enabled, queue,
}: {
  configured: boolean;
  enabled: boolean;
  queue: WaQueueInfo | null;
}) {
  const [senders, setSenders] = useState<Sender[]>([]);
  const [tugas, setTugas] = useState<Tugas[]>([]);
  const [maks, setMaks] = useState(10);
  const [migrated, setMigrated] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [live, setLive] = useState<Record<string, Live>>({});
  const [liveErr, setLiveErr] = useState("");
  const [qr, setQr] = useState<Record<string, string | null>>({});
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogErr, setDialogErr] = useState("");

  // Isi form pop-up
  const [labelBaru, setLabelBaru] = useState("");
  const [tugasBaru, setTugasBaru] = useState<string[]>([]);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftTugas, setDraftTugas] = useState<string[]>([]);
  const [draftSemua, setDraftSemua] = useState(true); // khusus nomor utama
  const [gagalBuka, setGagalBuka] = useState<string | null>(null); // kartu yang daftar gagalnya terbuka

  const tutupDialog = useCallback(() => { setDialog(null); setDialogErr(""); }, []);

  const muat = useCallback(async () => {
    const { ok, data } = await api("/api/wa/senders");
    if (!ok) { setLoadErr(data?.error || "Gagal memuat daftar nomor pengirim."); return; }
    setLoadErr("");
    setSenders(data.senders ?? []);
    setTugas(data.tugas ?? []);
    setMaks(data.maks ?? 10);
    setMigrated(data.migrated !== false);
  }, []);

  useEffect(() => { void muat(); }, [muat]);

  // Status koneksi & pemakaian semua nomor (tiap 5 detik) + QR nomor yang menunggu scan
  useEffect(() => {
    if (!configured) { setLive({}); return; }
    let batal = false;
    const cek = async () => {
      if (document.visibilityState === "hidden") return;
      const r = await api("/api/wa/gateway?action=senders");
      if (batal) return;
      if (!r.ok || !Array.isArray(r.data)) {
        setLiveErr(
          r.data?.error === "Not found"
            ? "Gateway belum diperbarui ke versi banyak nomor. Deploy ulang service wa-gateway."
            : r.data?.error || "Status gateway tidak bisa dibaca.",
        );
        return;
      }
      setLiveErr("");
      const peta: Record<string, Live> = {};
      for (const l of r.data as Live[]) peta[l.id] = l;
      setLive(peta);
      const qrBaru: Record<string, string | null> = {};
      for (const l of r.data as Live[]) {
        if (l.wa === "qr") {
          const q = await api(`/api/wa/gateway?action=qr&sender=${encodeURIComponent(l.id)}`);
          qrBaru[l.id] = q.ok ? (q.data?.qr ?? null) : null;
        }
      }
      if (!batal) setQr(qrBaru);
    };
    void cek();
    const t = setInterval(cek, 5000);
    return () => { batal = true; clearInterval(t); };
  }, [configured]);

  // key tugas → nama nomor yang memegangnya (kecuali nomor `kecuali`). Nomor utama dihitung
  // pemegang hanya bila daftarnya diisi (dibatasi).
  const dipakaiOleh = (kecuali?: string) => {
    const peta: Record<string, string> = {};
    for (const s of senders) {
      if (s.id === kecuali || !s.enabled) continue;
      for (const k of s.tasks) peta[k] = s.label;
    }
    return peta;
  };

  // Nomor utama dibatasi → jenis pesan yang tidak dipegang siapa pun akan menunggu di antrian
  const utama = senders.find((s) => s.is_default);
  const tanpaPemegang = (() => {
    if (!utama || utama.tasks.length === 0) return [] as string[];
    const dipegang = dipakaiOleh();
    return tugas.filter((t) => !dipegang[t.key]).map((t) => t.label);
  })();

  // ── Antrian per nomor ──────────────────────────────────────────────────────
  // Meniru aturan gateway (lihat pemilikEvent di lib/waSenders.ts).
  const eventsDari = (s: Sender) => s.tasks.flatMap((k) => tugas.find((t) => t.key === k)?.events ?? []);
  const siap = (id: string) => {
    const l = live[id];
    return !l || (l.wa !== "qr" && l.reason !== "forbidden" && l.reason !== "logged_out");
  };
  const pemegang: PemegangNomor[] = senders.map((s) => ({
    id: s.id, utama: s.is_default, enabled: s.enabled, siap: siap(s.id), events: eventsDari(s),
  }));
  const pemilik = (ev: string) => pemilikEvent(ev, pemegang);

  const antrian: Record<string, { pending: number; oldest: string | null; gagal: number }> = {};
  const ambil = (id: string) => (antrian[id] ??= { pending: 0, oldest: null, gagal: 0 });
  let tanpaPemegangMenunggu = 0;
  if (queue) {
    for (const [ev, v] of Object.entries(queue.pending_by_event ?? {})) {
      const o = pemilik(ev);
      if (!o) { tanpaPemegangMenunggu += v.n; continue; }
      const a = ambil(o);
      a.pending += v.n;
      if (!a.oldest || v.oldest < a.oldest) a.oldest = v.oldest;
    }
    for (const [ev, n] of Object.entries(queue.failed_by_event ?? {})) {
      const o = pemilik(ev) ?? utama?.id;
      if (o) ambil(o).gagal += n;
    }
  }
  const gagalMilik = (id: string) =>
    (queue?.recent_failed ?? []).filter((f) => (pemilik(f.event_type) ?? utama?.id) === id);

  // Jalankan aksi. Gagal: pesan tampil di dalam pop-up bila terbuka, kalau tidak di bawah daftar.
  const jalankan = async (fn: () => Promise<{ ok: boolean; data: any }>, sukses: string) => {
    setBusy(true);
    setMsg(null);
    setDialogErr("");
    const { ok, data } = await fn();
    setBusy(false);
    if (!ok) {
      const teks = data?.error || "Gagal.";
      if (dialog) setDialogErr(teks); else setMsg({ type: "err", text: teks });
      return false;
    }
    setMsg({ type: "ok", text: sukses });
    await muat();
    return true;
  };

  const bukaTambah = () => { setLabelBaru(""); setTugasBaru([]); setDialogErr(""); setDialog({ mode: "tambah" }); };

  const bukaAtur = (s: Sender) => {
    setDraftLabel(s.label);
    setDraftTugas(s.tasks);
    setDraftSemua(s.tasks.length === 0);
    setDialogErr("");
    setDialog({ mode: "atur", id: s.id });
  };

  const tambah = async () => {
    const ok = await jalankan(
      () => kirim("POST", { label: labelBaru, tasks: tugasBaru }),
      "Nomor ditambahkan. Kodenya muncul di Atur pada kartu barunya dalam ±30 detik; scan dengan WhatsApp nomor itu.",
    );
    if (ok) tutupDialog();
  };

  const simpanAtur = async () => {
    if (dialog?.mode !== "atur") return;
    const s = senders.find((x) => x.id === dialog.id);
    if (!s) return;
    const tasks = s.is_default && draftSemua ? [] : draftTugas;
    const ok = await jalankan(
      () => kirim("PATCH", { id: s.id, label: draftLabel, tasks }),
      "Perubahan tersimpan. Gateway menerapkannya dalam ±30 detik.",
    );
    if (ok) tutupDialog();
  };

  const hapus = async () => {
    if (dialog?.mode !== "hapus") return;
    const s = senders.find((x) => x.id === dialog.id);
    if (!s) return;
    const ok = await jalankan(
      () => kirim("DELETE", { id: s.id }),
      s.is_default
        ? "Nomor utama dihapus. Gateway memutus sesinya dalam ±30 detik, lalu menampilkan QR untuk nomor baru."
        : "Nomor dihapus. Gateway memutus sesinya dalam ±30 detik.",
    );
    if (ok) tutupDialog();
  };

  if (loadErr) {
    return <div className={`${cardCls} p-5 md:p-6`}><p className="text-xs text-red-600 dark:text-red-400">{loadErr}</p></div>;
  }

  const dlgSender = dialog && dialog.mode !== "tambah" ? senders.find((x) => x.id === dialog.id) : undefined;

  return (
    <div className={`${cardCls} p-5 md:p-6 space-y-4`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Nomor pengirim</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 max-w-prose">
            Satu kartu per nomor: status, sisa pemakaian, antrian, dan tugasnya. Ikon pena membuka pengaturan nomor
            (nama, tugas, QR). Tiap nomor punya batas kirim dan perlindungan sendiri. Sebaiknya gunakan nomor khusus
            bot, bukan nomor pribadi.
          </p>
        </div>
        {migrated && senders.length < maks && (
          <button type="button" className={btnPrimary} onClick={bukaTambah}>
            <Plus size={14} />
            Tambah nomor
          </button>
        )}
      </div>

      {!migrated && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Fitur ini butuh tabel baru. Jalankan <code>supabase/migrations/023_wa_senders.sql</code> di Supabase
          dulu, lalu muat ulang halaman ini.
        </p>
      )}
      {liveErr && <p className="text-xs text-amber-700 dark:text-amber-400">{liveErr}</p>}

      {!enabled && (queue?.pending ?? 0) > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 px-3 py-2 text-xs">
          <Inbox size={14} className="mt-0.5 shrink-0" />
          <p>Saklar WhatsApp Bot nonaktif, jadi {queue?.pending} pesan yang sudah antri tidak diproses.</p>
        </div>
      )}

      {tanpaPemegang.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300 px-3 py-2 text-xs">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          <p>
            Nomor utama dibatasi, dan belum ada nomor yang memegang: {tanpaPemegang.join(", ")}. Pesan jenis itu
            menunggu di antrian sampai ada nomor yang ditugaskan
            {tanpaPemegangMenunggu > 0 ? ` (saat ini ${tanpaPemegangMenunggu} pesan)` : ""}.
          </p>
        </div>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {senders.map((s) => {
          const l = live[s.id];
          return (
            <li
              key={s.id}
              className={`rounded-lg border border-zinc-200 dark:border-zinc-800 p-3.5 space-y-3 ${s.enabled ? "" : "bg-zinc-50 dark:bg-zinc-900/50"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className="mt-0.5 shrink-0 text-zinc-500 dark:text-zinc-400"><Smartphone size={16} /></span>
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 break-words">{s.label}</span>
                      {s.is_default && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#124540] text-white">Utama</span>
                      )}
                      <Status live={l} enabled={s.enabled} />
                    </div>
                    <RingkasTugas s={s} tugas={tugas} />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    className={btnIcon}
                    disabled={busy}
                    onClick={() => bukaAtur(s)}
                    aria-label={`Atur ${s.label}`}
                    title="Atur"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className={`${btnIcon} hover:!bg-red-50 hover:!text-red-600 dark:hover:!bg-red-950/40`}
                    disabled={busy}
                    onClick={() => { setDialogErr(""); setDialog({ mode: "hapus", id: s.id }); }}
                    aria-label={`Hapus ${s.label}`}
                    title="Hapus"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {s.enabled && l?.limits ? (
                <div className="space-y-2.5">
                  <BarNomor label="Per jam" used={l.sent_last_hour} max={l.limits.per_hour} freesAt={l.hour_frees_at} />
                  <BarNomor label="Per 24 jam" used={l.sent_last_day} max={l.limits.per_day} freesAt={l.day_frees_at} />
                </div>
              ) : (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {s.enabled ? "Pemakaian tampil setelah gateway terhubung." : "Nomor dimatikan, tidak mengirim pesan."}
                </p>
              )}

              {s.enabled && queue && (
                <div className="border-t border-zinc-200 dark:border-zinc-800 pt-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap text-[11px]">
                    <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                      <Inbox size={13} className="shrink-0" />
                      <span>
                        Antrian <span className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">{antrian[s.id]?.pending ?? 0}</span> menunggu
                        {(antrian[s.id]?.pending ?? 0) > 0 && antrian[s.id]?.oldest ? `, tertua ${lamaMenunggu(antrian[s.id].oldest as string)}` : ""}
                      </span>
                    </span>
                    {(antrian[s.id]?.gagal ?? 0) > 0 ? (
                      <button
                        type="button"
                        className="flex items-center gap-1 font-semibold text-red-600 dark:text-red-400 hover:underline"
                        onClick={() => setGagalBuka((v) => (v === s.id ? null : s.id))}
                        aria-expanded={gagalBuka === s.id}
                      >
                        <XCircle size={13} />
                        Gagal {antrian[s.id].gagal} (24 jam)
                      </button>
                    ) : (
                      <span className="text-zinc-500 dark:text-zinc-400">Tidak ada yang gagal</span>
                    )}
                  </div>
                  {gagalBuka === s.id && (
                    <ul className="border border-zinc-200 dark:border-zinc-800 rounded-md divide-y divide-zinc-200 dark:divide-zinc-800">
                      {gagalMilik(s.id).length === 0 && (
                        <li className="px-2.5 py-2 text-[11px] text-zinc-500 dark:text-zinc-400">Rincian gagal tidak termuat.</li>
                      )}
                      {gagalMilik(s.id).slice(0, 5).map((f) => (
                        <li key={f.id} className="px-2.5 py-2">
                          <p className="text-[11px]">
                            <span className="font-medium capitalize text-zinc-800 dark:text-zinc-200">{namaEvent(f.event_type)}</span>
                            <span className="text-zinc-500 dark:text-zinc-400"> ke {f.to}</span>
                          </p>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 break-words">{f.error ?? "Alasan tidak tercatat."}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {l?.paused_until && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  Pengiriman dijeda sampai {new Date(l.paused_until).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}. Pesan menunggu di antrian.
                </p>
              )}

              {s.enabled && l?.wa === "qr" && (
                <button
                  type="button"
                  className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:underline text-left"
                  onClick={() => bukaAtur(s)}
                >
                  Menunggu scan QR. Buka pengaturan untuk memindai kodenya.
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {migrated && senders.length >= maks && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Sudah mencapai batas {maks} nomor pengirim.</p>
      )}

      {msg && (
        <p className={`text-xs ${msg.type === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{msg.text}</p>
      )}

      {/* ── Pop-up: tambah nomor ── */}
      {dialog?.mode === "tambah" && (
        <Modal
          judul="Tambah nomor pengirim"
          subjudul="Nomor baru muncul sebagai kartu, lalu scan QR-nya dengan WhatsApp nomor itu."
          onClose={tutupDialog}
          footer={
            <>
              <button type="button" className={btnPrimary} disabled={busy || !labelBaru.trim()} onClick={tambah}>
                <Plus size={14} />
                Tambah nomor
              </button>
              <button type="button" className={btnGhost} onClick={tutupDialog}>Batal</button>
              {dialogErr && <p className="w-full text-xs text-red-600 dark:text-red-400">{dialogErr}</p>}
            </>
          }
        >
          <div>
            <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">Nama nomor</label>
            <input className={inputCls} value={labelBaru} maxLength={40} autoFocus onChange={(e) => setLabelBaru(e.target.value)} placeholder="Mis. Admin Gudang" aria-label="Nama nomor baru" />
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">Tugas nomor ini</p>
            <PilihTugas tugas={tugas} dipilih={tugasBaru} onChange={setTugasBaru} dipakaiLain={dipakaiOleh()} />
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Tugas boleh dikosongkan dulu dan diisi nanti. Nomor tanpa tugas tidak mengirim apa pun.
            </p>
          </div>
        </Modal>
      )}

      {/* ── Pop-up: atur nomor (nama, lalu tugas/perizinan, status, QR) ── */}
      {dialog?.mode === "atur" && dlgSender && (
        <Modal
          judul={`Atur ${dlgSender.label}`}
          subjudul={
            <span className="flex items-center gap-2 flex-wrap">
              {dlgSender.is_default && <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#124540] text-white">Utama</span>}
              <Status live={live[dlgSender.id]} enabled={dlgSender.enabled} />
            </span>
          }
          onClose={tutupDialog}
          footer={
            <>
              <button
                type="button"
                className={btnPrimary}
                disabled={busy || !draftLabel.trim() || (dlgSender.is_default && !draftSemua && draftTugas.length === 0)}
                onClick={simpanAtur}
              >
                Simpan
              </button>
              <button type="button" className={btnGhost} onClick={tutupDialog}>Batal</button>
              {dialogErr && <p className="w-full text-xs text-red-600 dark:text-red-400">{dialogErr}</p>}
            </>
          }
        >
          <div>
            <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">Nama nomor</label>
            <input className={inputCls} value={draftLabel} maxLength={40} onChange={(e) => setDraftLabel(e.target.value)} placeholder="Nama nomor" aria-label="Nama nomor" />
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">Tugas nomor ini</p>
            {dlgSender.is_default && (
              <label className="flex items-start gap-2 rounded-md border border-zinc-200 dark:border-zinc-800 p-2.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900">
                <input type="checkbox" className="mt-0.5" checked={draftSemua} onChange={(e) => setDraftSemua(e.target.checked)} />
                <span>
                  <span className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">Kirim semua jenis pesan yang tidak dipegang nomor lain</span>
                  <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">
                    Matikan pilihan ini untuk memilih sendiri jenis pesan yang dikirim nomor utama.
                  </span>
                </span>
              </label>
            )}
            {(!dlgSender.is_default || !draftSemua) && (
              <PilihTugas tugas={tugas} dipilih={draftTugas} onChange={setDraftTugas} dipakaiLain={dipakaiOleh(dlgSender.id)} />
            )}
            {dlgSender.is_default && !draftSemua && draftTugas.length === 0 && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400">Pilih minimal satu jenis pesan, atau nyalakan lagi pilihan di atas.</p>
            )}
          </div>

          {!dlgSender.is_default && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{dlgSender.enabled ? "Nomor aktif" : "Nomor dimatikan"}</p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {dlgSender.enabled
                    ? "Dimatikan = sesi dihentikan, tapi tidak perlu scan QR lagi saat dihidupkan. Tugasnya dikerjakan nomor utama."
                    : "Tidak mengirim pesan. Hidupkan untuk memakainya lagi."}
                </p>
              </div>
              <button
                type="button"
                className={btnGhost}
                disabled={busy}
                onClick={() => jalankan(() => kirim("PATCH", { id: dlgSender.id, enabled: !dlgSender.enabled }), dlgSender.enabled ? "Nomor dimatikan." : "Nomor dihidupkan.")}
              >
                <Power size={14} />
                {dlgSender.enabled ? "Matikan" : "Hidupkan"}
              </button>
            </div>
          )}

          {dlgSender.enabled && live[dlgSender.id]?.wa === "qr" && (
            <div className="flex flex-col sm:flex-row items-center gap-4 rounded-md bg-zinc-50 dark:bg-zinc-900 p-3">
              <div className="w-[200px] h-[200px] shrink-0 rounded-lg bg-white border border-zinc-200 p-2 flex items-center justify-center">
                {qr[dlgSender.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr[dlgSender.id] as string} alt={`QR ${dlgSender.label}`} width={184} height={184} className="w-full h-full" />
                ) : (
                  <span className="w-6 h-6 border-2 border-zinc-300 border-t-[#124540] rounded-full animate-spin" />
                )}
              </div>
              <ol className="text-sm text-zinc-600 dark:text-zinc-300 space-y-1 list-decimal list-inside">
                <li>Buka WhatsApp di HP untuk nomor ini.</li>
                <li>Pengaturan → Perangkat tertaut.</li>
                <li>Tautkan perangkat, arahkan kamera ke kode ini.</li>
                <li className="text-[11px] text-zinc-500 dark:text-zinc-400 list-none -ml-4">
                  {dlgSender.is_default ? "Selama belum terhubung, pesan tertahan di antrian." : "Selama belum terhubung, tugasnya dikerjakan nomor utama."}
                </li>
              </ol>
            </div>
          )}
        </Modal>
      )}

      {/* ── Pop-up: konfirmasi hapus ── */}
      {dialog?.mode === "hapus" && dlgSender && (
        <Modal
          judul={`Hapus ${dlgSender.label}?`}
          onClose={tutupDialog}
          footer={
            <>
              <button
                type="button"
                className="shrink-0 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-semibold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                disabled={busy}
                onClick={hapus}
              >
                <Trash2 size={14} />
                Ya, hapus nomor
              </button>
              <button type="button" className={btnGhost} onClick={tutupDialog}>Batal</button>
              {dialogErr && <p className="w-full text-xs text-red-600 dark:text-red-400">{dialogErr}</p>}
            </>
          }
        >
          <div className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
            {dlgSender.is_default ? (
              <>
                <p>
                  Perangkat nomor utama diputus dari WhatsApp dan sesinya dihapus. Nama dan tugasnya kembali ke
                  bawaan, dan untuk memakainya lagi harus scan QR ulang.
                </p>
                <p>
                  Kartu ini tetap ada sebagai tempat nomor utama, karena gateway selalu membutuhkan satu nomor.
                  Setelah dihapus kartu menampilkan QR untuk menghubungkan nomor baru.
                </p>
              </>
            ) : (
              <p>
                Perangkat nomor ini diputus dari WhatsApp dan sesinya dihapus. Untuk memakainya lagi harus scan QR
                ulang. Tugasnya kembali dikerjakan nomor lain.
              </p>
            )}
            {senders.length <= 1 && (
              <p className="text-amber-700 dark:text-amber-400">
                Ini satu-satunya nomor. Tidak ada pesan yang terkirim sampai ada nomor yang terhubung lagi; pesan
                baru menunggu di antrian.
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
