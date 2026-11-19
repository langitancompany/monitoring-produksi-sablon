// app/components/settings/WaSenders.tsx
// Kartu "Nomor pengirim" di Pengaturan → Notifikasi: tambah / ubah / hapus nomor WhatsApp pengirim
// tanpa batas tetap (maks. 10), bagi tugasnya per jenis pesan, dan scan QR tiap nomor.
// - Nomor utama = nomor yang sudah ada (QR-nya di kartu koneksi di atas). Ia mengirim semua
//   jenis pesan yang tidak dialihkan ke nomor tambahan.
// - Nomor tambahan hanya mengirim jenis pesan yang dicentang. Selama belum terhubung (menunggu
//   scan QR), tugasnya otomatis dikerjakan nomor utama supaya notifikasi tidak tertahan.
// Daftar disimpan lewat /api/wa/senders; gateway membacanya tiap ±30 detik.
"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Pencil, Power } from "lucide-react";

interface Tugas { key: string; label: string; desc: string }
interface Sender { id: string; label: string; enabled: boolean; is_default: boolean; tasks: string[] }
interface Live {
  id: string;
  wa: "starting" | "qr" | "open" | "closed";
  reason: string | null;
  sent_last_hour: number;
  sent_last_day: number;
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
  "shrink-0 px-3 py-2 rounded-md text-sm font-semibold border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150 disabled:opacity-50";

function Status({ live, enabled }: { live?: Live; enabled: boolean }) {
  let teks = "Menunggu gateway…";
  let cls = "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400";
  if (!enabled) {
    teks = "Dimatikan";
  } else if (live) {
    if (live.paused_until) { teks = "Dijeda (batas WhatsApp)"; cls = "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"; }
    else if (live.wa === "open") { teks = "Terhubung"; cls = "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"; }
    else if (live.wa === "qr") { teks = "Menunggu scan QR"; cls = "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"; }
    else if (live.reason === "forbidden") { teks = "Dibatasi WhatsApp"; cls = "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"; }
    else if (live.wa === "closed") { teks = "Terputus"; cls = "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"; }
    else teks = "Memulai…";
  }
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{teks}</span>;
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

export default function WaSenders({ configured }: { configured: boolean }) {
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

  // Form tambah
  const [labelBaru, setLabelBaru] = useState("");
  const [tugasBaru, setTugasBaru] = useState<string[]>([]);
  // Edit & hapus
  const [editId, setEditId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftTugas, setDraftTugas] = useState<string[]>([]);
  const [hapusId, setHapusId] = useState<string | null>(null);

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

  // Status koneksi semua nomor (tiap 5 detik) + QR nomor yang menunggu scan
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
        if (l.wa === "qr" && l.id !== "utama") {
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

  // key tugas → nama nomor yang memegangnya (kecuali nomor `kecuali`)
  const dipakaiOleh = (kecuali?: string) => {
    const peta: Record<string, string> = {};
    for (const s of senders) {
      if (s.is_default || s.id === kecuali || !s.enabled) continue;
      for (const k of s.tasks) peta[k] = s.label;
    }
    return peta;
  };

  const jalankan = async (fn: () => Promise<{ ok: boolean; data: any }>, sukses: string) => {
    setBusy(true);
    setMsg(null);
    const { ok, data } = await fn();
    setBusy(false);
    if (!ok) { setMsg({ type: "err", text: data?.error || "Gagal." }); return false; }
    setMsg({ type: "ok", text: sukses });
    await muat();
    return true;
  };

  const tambah = async () => {
    const okTambah = await jalankan(
      () => kirim("POST", { label: labelBaru, tasks: tugasBaru }),
      "Nomor ditambahkan. Kodenya muncul di bawah dalam ±30 detik; scan dengan WhatsApp nomor itu.",
    );
    if (okTambah) { setLabelBaru(""); setTugasBaru([]); }
  };

  const simpanEdit = async () => {
    if (!editId) return;
    const s = senders.find((x) => x.id === editId);
    const okSimpan = await jalankan(
      () => kirim("PATCH", { id: editId, label: draftLabel, ...(s?.is_default ? {} : { tasks: draftTugas }) }),
      "Perubahan tersimpan. Gateway menerapkannya dalam ±30 detik.",
    );
    if (okSimpan) setEditId(null);
  };

  if (loadErr) {
    return <div className={`${cardCls} p-5 md:p-6`}><p className="text-xs text-red-600 dark:text-red-400">{loadErr}</p></div>;
  }

  return (
    <div className={`${cardCls} p-5 md:p-6 space-y-4`}>
      <div>
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Nomor pengirim</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Tambah nomor WhatsApp pengirim dan bagi tugasnya per jenis pesan. Nomor utama mengirim semua
          pesan yang tidak dialihkan ke nomor lain. Tiap nomor punya batas kirim dan perlindungan
          sendiri. Sebaiknya gunakan nomor khusus bot, bukan nomor pribadi.
        </p>
      </div>

      {!migrated && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Fitur ini butuh tabel baru. Jalankan <code>supabase/migrations/023_wa_senders.sql</code> di Supabase
          dulu, lalu muat ulang halaman ini.
        </p>
      )}
      {liveErr && <p className="text-xs text-amber-700 dark:text-amber-400">{liveErr}</p>}

      <ul className="border border-zinc-200 dark:border-zinc-800 rounded-md divide-y divide-zinc-200 dark:divide-zinc-800">
        {senders.map((s) => {
          const l = live[s.id];
          const edit = editId === s.id;
          return (
            <li key={s.id} className="p-3 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{s.label}</span>
                    {s.is_default && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Utama</span>
                    )}
                    <Status live={l} enabled={s.enabled} />
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {s.is_default
                      ? "Mengirim semua pesan yang tidak dialihkan ke nomor lain."
                      : s.tasks.length
                        ? `Tugas: ${s.tasks.map((k) => tugas.find((t) => t.key === k)?.label ?? k).join(", ")}`
                        : "Belum punya tugas (tidak mengirim apa pun)."}
                  </p>
                  {l && (
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Terkirim: {l.sent_last_hour}{l.limits ? `/${l.limits.per_hour}` : ""} per jam, {l.sent_last_day}{l.limits ? `/${l.limits.per_day}` : ""} per hari
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={btnGhost}
                    disabled={busy}
                    onClick={() => {
                      setEditId(edit ? null : s.id);
                      setDraftLabel(s.label);
                      setDraftTugas(s.tasks);
                    }}
                    aria-label={`Ubah ${s.label}`}
                  >
                    <Pencil size={14} />
                  </button>
                  {!s.is_default && (
                    <>
                      <button
                        type="button"
                        className={btnGhost}
                        disabled={busy}
                        onClick={() => jalankan(() => kirim("PATCH", { id: s.id, enabled: !s.enabled }), s.enabled ? "Nomor dimatikan." : "Nomor dihidupkan.")}
                        aria-label={s.enabled ? `Matikan ${s.label}` : `Hidupkan ${s.label}`}
                        title={s.enabled ? "Matikan (sesi dipertahankan)" : "Hidupkan"}
                      >
                        <Power size={14} />
                      </button>
                      {hapusId === s.id ? (
                        <button
                          type="button"
                          className="shrink-0 px-3 py-2 rounded-md text-sm font-semibold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                          disabled={busy}
                          onClick={async () => { await jalankan(() => kirim("DELETE", { id: s.id }), "Nomor dihapus. Gateway memutus sesinya dalam ±30 detik."); setHapusId(null); }}
                        >
                          Yakin hapus?
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={btnGhost}
                          disabled={busy}
                          onClick={() => setHapusId(s.id)}
                          onBlur={() => setHapusId((v) => (v === s.id ? null : v))}
                          aria-label={`Hapus ${s.label}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {edit && (
                <div className="space-y-3 pt-1">
                  <input className={inputCls} value={draftLabel} maxLength={40} onChange={(e) => setDraftLabel(e.target.value)} placeholder="Nama nomor" aria-label="Nama nomor" />
                  {!s.is_default && (
                    <PilihTugas tugas={tugas} dipilih={draftTugas} onChange={setDraftTugas} dipakaiLain={dipakaiOleh(s.id)} />
                  )}
                  <div className="flex gap-2">
                    <button type="button" className={btnPrimary} disabled={busy || !draftLabel.trim()} onClick={simpanEdit}>Simpan</button>
                    <button type="button" className={btnGhost} onClick={() => setEditId(null)}>Batal</button>
                  </div>
                </div>
              )}

              {!s.is_default && s.enabled && l?.wa === "qr" && (
                <div className="flex flex-col sm:flex-row items-center gap-4 rounded-md bg-zinc-50 dark:bg-zinc-900 p-3">
                  <div className="w-[200px] h-[200px] shrink-0 rounded-lg bg-white border border-zinc-200 p-2 flex items-center justify-center">
                    {qr[s.id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={qr[s.id] as string} alt={`QR ${s.label}`} width={184} height={184} className="w-full h-full" />
                    ) : (
                      <span className="w-6 h-6 border-2 border-zinc-300 border-t-[#124540] rounded-full animate-spin" />
                    )}
                  </div>
                  <ol className="text-sm text-zinc-600 dark:text-zinc-300 space-y-1 list-decimal list-inside">
                    <li>Buka WhatsApp di HP untuk nomor ini.</li>
                    <li>Pengaturan → Perangkat tertaut.</li>
                    <li>Tautkan perangkat, arahkan kamera ke kode ini.</li>
                    <li className="text-[11px] text-zinc-500 dark:text-zinc-400 list-none -ml-4">Selama belum terhubung, tugasnya dikerjakan nomor utama.</li>
                  </ol>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {migrated && senders.length < maks && (
        <div className="space-y-3 pt-1">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Tambah nomor pengirim</p>
          <div className="flex gap-2">
            <input className={inputCls} value={labelBaru} maxLength={40} onChange={(e) => setLabelBaru(e.target.value)} placeholder="Nama nomor, mis. Admin Gudang" aria-label="Nama nomor baru" />
          </div>
          <PilihTugas tugas={tugas} dipilih={tugasBaru} onChange={setTugasBaru} dipakaiLain={dipakaiOleh()} />
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Tugas boleh dikosongkan dulu dan diisi nanti. Nomor tanpa tugas tidak mengirim apa pun.
          </p>
          <button type="button" className={btnPrimary} disabled={busy || !labelBaru.trim()} onClick={tambah}>
            <Plus size={14} />
            Tambah nomor
          </button>
        </div>
      )}
      {migrated && senders.length >= maks && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Sudah mencapai batas {maks} nomor pengirim.</p>
      )}

      {msg && (
        <p className={`text-xs ${msg.type === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{msg.text}</p>
      )}
    </div>
  );
}
