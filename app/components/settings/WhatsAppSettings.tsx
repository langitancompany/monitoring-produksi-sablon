// app/components/settings/WhatsAppSettings.tsx
// Bagian "WhatsApp Bot" di halaman Pengaturan (dirender dari SettingsPage, hanya management).
// - Saklar aktif/nonaktif
// - URL + token gateway, ID grup produksi
// - Status koneksi, scan QR, cari grup, kirim pesan tes
// Semua panggilan lewat /api/wa/* (token gateway tidak pernah sampai ke browser).
"use client";

import React, { useCallback, useEffect, useState } from "react";

interface WaSettingsData {
  enabled: boolean;
  gateway_url: string;
  group_jid: string;
  token_set: boolean;
  token_hint: string;
}

type GwState = "starting" | "qr" | "open" | "closed";

interface GwStatus {
  state: GwState | null;
  error?: string;
}

interface WaGroup {
  id: string;
  nama: string;
  anggota: number;
}

type Msg = { type: "ok" | "err"; text: string } | null;

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { cache: "no-store", ...init });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data: data as any };
}

const inputCls =
  "w-full border border-zinc-200 dark:border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600 transition-colors duration-150 placeholder-zinc-400 dark:placeholder-zinc-500";
const labelCls =
  "block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] mb-1";
const cardCls =
  "bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800";
const btnPrimary =
  "shrink-0 flex items-center justify-center gap-2 bg-[#124540] hover:bg-[#0d332f] text-white px-4 py-2 rounded-md text-sm font-semibold transition-colors duration-150 disabled:opacity-50";
const btnGhost =
  "shrink-0 px-3 py-2 rounded-md text-sm font-semibold border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150 disabled:opacity-50";

export default function WhatsAppSettings() {
  const [settings, setSettings] = useState<WaSettingsData | null>(null);
  const [loadError, setLoadError] = useState("");

  // Form koneksi
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [groupJid, setGroupJid] = useState("");
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  // Status gateway
  const [gw, setGw] = useState<GwStatus>({ state: null });
  const [qr, setQr] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // naikkan untuk memaksa cek status ulang

  // Grup & tes
  const [groups, setGroups] = useState<WaGroup[] | null>(null);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState("");
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<Msg>(null);

  // ─── Muat pengaturan ──────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { ok, data } = await api("/api/wa/settings");
      if (!ok) {
        setLoadError(data?.error || "Gagal memuat pengaturan WhatsApp.");
        return;
      }
      setSettings(data);
      setUrl(data.gateway_url || "");
      setGroupJid(data.group_jid || "");
    })();
  }, []);

  const configured = !!settings?.gateway_url && !!settings?.token_set;

  // ─── Pantau status gateway (tiap 5 detik) ─────────────────────────────────
  useEffect(() => {
    if (!configured) {
      setGw({ state: null });
      setQr(null);
      return;
    }
    let cancelled = false;

    const cek = async () => {
      const st = await api("/api/wa/gateway?action=status");
      if (cancelled) return;
      if (!st.ok) {
        setGw({
          state: null,
          error: st.data?.error || "Gateway tidak bisa dihubungi.",
        });
        setQr(null);
        return;
      }
      const state = (st.data?.wa ?? "starting") as GwState;
      setGw({ state });
      if (state === "open") {
        setQr(null);
        return;
      }
      const q = await api("/api/wa/gateway?action=qr");
      if (!cancelled) setQr(q.ok ? (q.data?.qr ?? null) : null);
    };

    cek();
    const t = setInterval(cek, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [configured, tick]);

  // ─── Aksi ─────────────────────────────────────────────────────────────────
  const dirty =
    !!settings &&
    (url.trim().replace(/\/+$/, "") !== settings.gateway_url ||
      groupJid.trim() !== settings.group_jid ||
      token.trim() !== "");

  const simpan = async () => {
    setSaving(true);
    setMsg(null);
    const { ok, data } = await api("/api/wa/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gateway_url: url,
        group_jid: groupJid,
        ...(token.trim() ? { gateway_token: token } : {}),
      }),
    });
    setSaving(false);
    if (!ok) {
      setMsg({ type: "err", text: data?.error || "Gagal menyimpan." });
      return;
    }
    setSettings(data);
    setUrl(data.gateway_url || "");
    setGroupJid(data.group_jid || "");
    setToken("");
    setMsg({ type: "ok", text: "Pengaturan tersimpan." });
    setTick((n) => n + 1);
  };

  const toggle = async () => {
    if (!settings) return;
    const next = !settings.enabled;
    setToggling(true);
    setMsg(null);
    const { ok, data } = await api("/api/wa/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });
    setToggling(false);
    if (!ok) {
      setMsg({ type: "err", text: data?.error || "Gagal mengubah status." });
      return;
    }
    setSettings(data);
  };

  const cariGrup = async () => {
    setGroupsLoading(true);
    setGroupsError("");
    const { ok, data } = await api("/api/wa/gateway?action=groups");
    setGroupsLoading(false);
    if (!ok) {
      setGroups(null);
      setGroupsError(data?.error || "Gagal mengambil daftar grup.");
      return;
    }
    setGroups(Array.isArray(data) ? data : []);
  };

  const kirimTes = async () => {
    setTesting(true);
    setTestMsg(null);
    const { ok, data } = await api("/api/wa/gateway", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test", to: testTo }),
    });
    setTesting(false);
    setTestMsg(
      ok
        ? {
            type: "ok",
            text: "Pesan tes terkirim. Cek WhatsApp di nomor tersebut.",
          }
        : { type: "err", text: data?.error || "Gagal mengirim pesan tes." },
    );
  };

  // ─── Tampilan status ──────────────────────────────────────────────────────
  const status = (() => {
    if (!configured)
      return {
        dot: "bg-zinc-400",
        text: "Belum disambungkan",
        hint: "Isi URL dan token gateway lalu simpan.",
      };
    if (gw.error)
      return {
        dot: "bg-red-500",
        text: "Gateway tidak bisa dihubungi",
        hint: gw.error,
      };
    if (gw.state === "open")
      return { dot: "bg-emerald-500", text: "WhatsApp terhubung", hint: "" };
    if (gw.state === "qr")
      return { dot: "bg-amber-500", text: "Menunggu scan QR", hint: "" };
    if (gw.state)
      return { dot: "bg-amber-500", text: "Menghubungkan…", hint: "" };
    return { dot: "bg-zinc-400", text: "Memeriksa status…", hint: "" };
  })();

  if (loadError) {
    return (
      <div className={`${cardCls} p-5 md:p-6`}>
        <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          WhatsApp Bot
        </h2>
        <p className="text-xs text-red-600 dark:text-red-400 mt-1">
          {loadError}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
          Pastikan file SQL migration WhatsApp sudah dijalankan di Supabase.
        </p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className={`${cardCls} p-5 md:p-6`}>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Memuat pengaturan WhatsApp…
        </p>
      </div>
    );
  }

  const bolehAktifkan = !dirty || settings.enabled; // mematikan selalu boleh

  return (
    <div className="space-y-4">
      {/* Judul + saklar */}
      <div
        className={`${cardCls} divide-y divide-zinc-200 dark:divide-zinc-800`}
      >
        <div className="p-5 md:p-6">
          <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            WhatsApp Bot
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Kirim notifikasi pesanan, kendala, revisi QC, dan pengingat deadline
            ke WhatsApp tim. Gateway berjalan sebagai service terpisah; di sini
            Anda mengatur sambungannya.
          </p>
        </div>

        <div className="p-5 md:p-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Kirim notifikasi WhatsApp
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {settings.enabled
                ? "Aktif. Pesan baru dimasukkan ke antrian dan dikirim oleh gateway."
                : "Nonaktif. Tidak ada pesan yang dibuat atau dikirim."}
              {!bolehAktifkan &&
                " Simpan perubahan koneksi dulu untuk mengaktifkan."}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.enabled}
            disabled={toggling || !bolehAktifkan}
            onClick={toggle}
            className={`shrink-0 w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-150 disabled:opacity-60 ${settings.enabled ? "bg-emerald-600" : "bg-zinc-300 dark:bg-zinc-700"}`}
          >
            <span
              className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-150 ${settings.enabled ? "translate-x-6" : "translate-x-0"}`}
            />
          </button>
        </div>
      </div>

      {/* Koneksi gateway */}
      <div className={`${cardCls} p-5 md:p-6 space-y-4`}>
        <div>
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Sambungan ke gateway
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            URL dan token sama dengan yang Anda pasang di service wa-gateway (
            <code>GATEWAY_TOKEN</code>). Token disimpan di server dan tidak
            ditampilkan lagi.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelCls}>URL gateway</label>
            <input
              className={inputCls}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://wa.domain-anda.com"
              inputMode="url"
              autoComplete="off"
            />
          </div>
          <div>
            <label className={labelCls}>Token gateway</label>
            <input
              className={inputCls}
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={
                settings.token_set
                  ? `Tersimpan (…${settings.token_hint}) — kosongkan jika tidak diganti`
                  : "Tempel GATEWAY_TOKEN"
              }
              autoComplete="new-password"
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>ID grup produksi (opsional)</label>
          <div className="flex gap-2">
            <input
              className={inputCls}
              value={groupJid}
              onChange={(e) => setGroupJid(e.target.value)}
              placeholder="1203630xxxxxxxxx@g.us"
              autoComplete="off"
            />
            <button
              type="button"
              className={btnGhost}
              onClick={cariGrup}
              disabled={groupsLoading || gw.state !== "open"}
              title={
                gw.state !== "open"
                  ? "WhatsApp harus terhubung dulu"
                  : undefined
              }
            >
              {groupsLoading ? "Mencari…" : "Cari grup"}
            </button>
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
            Kosong = notifikasi grup tidak dikirim, hanya pesan pribadi ke PJ
            dan helper.
          </p>
          {groupsError && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
              {groupsError}
            </p>
          )}
          {groups && (
            <div className="mt-2 border border-zinc-200 dark:border-zinc-800 rounded-md divide-y divide-zinc-200 dark:divide-zinc-800 max-h-56 overflow-y-auto">
              {groups.length === 0 ? (
                <p className="p-3 text-xs text-zinc-500 dark:text-zinc-400">
                  Nomor gateway belum masuk ke grup mana pun.
                </p>
              ) : (
                groups.map((g) => (
                  <div
                    key={g.id}
                    className="p-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                        {g.nama}
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {g.anggota} anggota
                      </p>
                    </div>
                    <button
                      type="button"
                      className={btnGhost}
                      onClick={() => {
                        setGroupJid(g.id);
                        setGroups(null);
                        setMsg({
                          type: "ok",
                          text: `Grup "${g.nama}" dipilih. Klik Simpan untuk menyimpan.`,
                        });
                      }}
                    >
                      Pakai
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            className={btnPrimary}
            onClick={simpan}
            disabled={saving || !dirty}
          >
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
          {msg && (
            <p
              className={`text-xs ${msg.type === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
            >
              {msg.text}
            </p>
          )}
        </div>
      </div>

      {/* Status + QR + tes */}
      <div className={`${cardCls} p-5 md:p-6 space-y-4`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${status.dot}`} />
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                {status.text}
              </p>
            </div>
            {status.hint && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                {status.hint}
              </p>
            )}
          </div>
          {configured && (
            <button
              type="button"
              className={btnGhost}
              onClick={() => setTick((n) => n + 1)}
            >
              Periksa ulang
            </button>
          )}
        </div>

        {gw.state === "qr" && (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            {/* Kepala bermerek */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/favicon.ico"
                alt=""
                width={32}
                height={32}
                className="w-8 h-8 object-contain"
              />
              <div className="leading-none">
                <p className="font-semibold text-base tracking-tight">
                  <span className="text-zinc-900 dark:text-white">
                    Langitan
                  </span>
                  <span className="text-[#49BFB4]">.co</span>
                </p>
                <p className="mt-1 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 tracking-[0.14em] uppercase">
                  WhatsApp Bot
                </p>
              </div>
            </div>

            <div className="p-5 md:p-6 grid gap-6 md:grid-cols-[auto_1fr] items-center">
              {/* QR (harus latar putih agar terbaca kamera) */}
              <div className="mx-auto w-[248px] h-[248px] rounded-xl bg-white border border-zinc-200 p-3 flex items-center justify-center">
                {qr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qr}
                    alt="QR login WhatsApp"
                    width={224}
                    height={224}
                    className="w-full h-full"
                  />
                ) : (
                  <span className="w-6 h-6 border-2 border-zinc-300 border-t-[#124540] rounded-full animate-spin" />
                )}
              </div>

              {/* Langkah (memang berurutan) */}
              <div>
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  Hubungkan nomor pengirim
                </p>
                <ol className="mt-3 space-y-3">
                  {[
                    "Buka WhatsApp di HP nomor bisnis.",
                    "Masuk ke Pengaturan, lalu Perangkat tertaut.",
                    "Ketuk Tautkan perangkat dan arahkan kamera ke kode ini.",
                  ].map((t, i) => (
                    <li key={t} className="flex items-start gap-3">
                      <span className="shrink-0 w-5 h-5 mt-0.5 rounded-full bg-[#124540] text-white text-[11px] font-semibold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <span className="text-sm text-zinc-600 dark:text-zinc-300">
                        {t}
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="mt-4 text-[11px] text-zinc-500 dark:text-zinc-400">
                  Kode diperbarui otomatis. Hanya admin, manager, dan supervisor
                  yang bisa melihat halaman ini.
                </p>
              </div>
            </div>
          </div>
        )}

        {gw.state === "open" && (
          <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
            <label className={labelCls}>Kirim pesan tes</label>
            <div className="flex gap-2">
              <input
                className={inputCls}
                inputMode="tel"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="08xxxxxxxxxx"
              />
              <button
                type="button"
                className={btnPrimary}
                onClick={kirimTes}
                disabled={testing || testTo.replace(/\D/g, "").length < 8}
              >
                {testing ? "Mengirim…" : "Kirim tes"}
              </button>
            </div>
            {testMsg && (
              <p
                className={`text-xs ${testMsg.type === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
              >
                {testMsg.text}
              </p>
            )}
          </div>
        )}

        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 pt-2 border-t border-zinc-200 dark:border-zinc-800">
          Gateway memakai WhatsApp tidak resmi (Baileys). Gunakan nomor khusus
          bisnis dan hanya kirim ke orang internal, bukan broadcast ke
          pelanggan, untuk menekan risiko nomor dibatasi WhatsApp.
        </p>
      </div>
    </div>
  );
}
