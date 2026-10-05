// app/components/orders/ApprovalForm.tsx
//
// Form Approval otomatis. Dibentuk dari data order + gambar mockup yang
// diupload admin (order.link_approval.link). Gambar mockup (termasuk size
// chart di dalamnya) ditampilkan apa adanya di sisi kiri; sisi kanan dibuat
// dari data order. Layout fixed A4 landscape (1123x794 px) supaya hasil
// cetak/PDF konsisten.

import React from "react";
import { Order, SizeEntry } from "@/types";

export const SHEET_W = 1123;
export const SHEET_H = 794;

// Lebar kolom kiri (banner + mockup). Naikkan untuk banner & mockup yang lebih
// lebar, turunkan (mis. 468) untuk tabel yang lebih lega; kolom kanan menyesuaikan.
const LEFT_W = 520;

const TEAL = "#6bbdb0";
const GRAY = "#bdbdbd";
const RED = "#e8392b";

// Kolom ukuran tetap di form. XXXL di sistem = 3XL di form.
const BASE_COLS = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"];

function normSize(k: string): string {
  const u = k.trim().toUpperCase();
  if (u === "XXXL") return "3XL";
  if (u === "XXXXL") return "4XL";
  return u;
}

function fmtDate(v?: string | null): string {
  if (!v) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return `${String(d.getDate()).padStart(2, "0")}/${String(
    d.getMonth() + 1,
  ).padStart(2, "0")}/${d.getFullYear()}`;
}

// Jenis aplikasi diambil dari "Jenis" di form pemesanan.
// manual/sablon = Sablon Manual, dtf = DTF.
function jenisAplikasiLabel(jenis?: string | null): string {
  const j = (jenis || "").trim().toLowerCase();
  if (!j) return "";
  if (j === "manual" || j === "sablon") return "Sablon Manual";
  if (j === "dtf") return "DTF";
  return j.toUpperCase();
}

type SizeMap = Record<string, number>;
interface ColorGroup {
  warna: string;
  pendek: SizeMap;
  panjang: SizeMap;
}

function buildTable(
  detail: SizeEntry[] | null | undefined,
  isSweater: boolean,
) {
  const groups = new Map<string, ColorGroup>();
  const extra: string[] = [];

  (detail ?? []).forEach((entry) => {
    const key = (entry.warna || "").trim().toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, {
        warna: (entry.warna || "").trim().toUpperCase(),
        pendek: {},
        panjang: {},
      });
    }
    const g = groups.get(key)!;
    // Sweater/Hoodie: lengan selalu panjang → satu baris per warna
    const target =
      isSweater || entry.lengan === "panjang" ? g.panjang : g.pendek;
    Object.entries(entry.ukuran || {}).forEach(([k, v]) => {
      const qty = Number(v) || 0;
      if (qty <= 0) return;
      const nk = normSize(k);
      target[nk] = (target[nk] || 0) + qty;
      if (!BASE_COLS.includes(nk) && !extra.includes(nk)) extra.push(nk);
    });
  });

  const list = Array.from(groups.values());
  // Dinamis: hanya warna yang ada. Kalau belum ada data, tampilkan 1 grup kosong.
  if (list.length === 0) list.push({ warna: "", pendek: {}, panjang: {} });
  return { groups: list, cols: [...BASE_COLS, ...extra] };
}

const sum = (m: SizeMap) => Object.values(m).reduce((a, b) => a + b, 0);

// Tinggi baris tabel menyesuaikan jumlah warna supaya TTD tidak terdorong
const ROW_MAX = 19;
const ROW_MIN = 11;
// Ruang (px) untuk tabel (header + baris + total) agar blok TTD tidak terdorong
const TABLE_SPACE = 316;
const SIGN_H = 112;
const SIGN_H_MIN = 56;

const makeCell = (h: number): React.CSSProperties => ({
  border: "1px solid #555",
  padding: "0 3px",
  textAlign: "center",
  height: h,
  lineHeight: `${h - 2}px`,
  fontSize: h >= 17 ? 11 : h >= 13 ? 10 : 9,
  overflow: "hidden",
  whiteSpace: "nowrap",
});

function SectionTitle({
  n,
  children,
}: {
  n: number;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", height: 20, marginBottom: 4 }}>
      <div
        style={{
          width: 40,
          background: TEAL,
          fontWeight: 700,
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginRight: 4,
        }}
      >
        {n}
      </div>
      <div
        style={{
          flex: 1,
          background: GRAY,
          fontWeight: 700,
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          paddingLeft: 8,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  bold,
  boldLabel,
  labelWidth = 120,
}: {
  label: string;
  value?: React.ReactNode;
  bold?: boolean;
  boldLabel?: boolean;
  labelWidth?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        fontSize: 12,
        minHeight: 17,
        lineHeight: "17px",
      }}
    >
      <div style={{ width: labelWidth, fontWeight: boldLabel ? 700 : 400 }}>
        {label}
      </div>
      <div style={{ width: 10 }}>:</div>
      <div style={{ fontWeight: bold ? 700 : 400 }}>{value}</div>
    </div>
  );
}

function ArtBlock({ title, jenis }: { title: string; jenis?: string }) {
  return (
    <>
      <div
        style={{
          background: TEAL,
          width: "100%",
          height: 17,
          lineHeight: "17px",
          fontSize: 12,
          paddingLeft: 3,
          boxSizing: "border-box",
        }}
      >
        {title}
      </div>
      <Field label="Jenis Aplikasi" labelWidth={90} value={jenis} />
    </>
  );
}

function SignBox({ title, dotted }: { title: string; dotted?: boolean }) {
  return (
    <div
      style={{
        flex: 1,
        border: "2px solid #000",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          borderBottom: "2px solid #000",
          textAlign: "center",
          fontSize: 12,
          height: 18,
          lineHeight: "18px",
        }}
      >
        {title}
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
        }}
      >
        {dotted && (
          <span style={{ fontSize: 11, paddingBottom: 3, letterSpacing: 1 }}>
            ..................................
          </span>
        )}
      </div>
    </div>
  );
}

export default function ApprovalForm({ order }: { order: Order }) {
  const mockup = order.link_approval?.link || null;
  const isPdf = !!mockup && /\.pdf(\?|$)/i.test(mockup);
  const isSweater = order.jenis_pakaian === "sweater_hoodie";
  const { groups, cols } = buildTable(order.detail_ukuran, isSweater);
  const rowsPerGroup = isSweater ? 1 : 2;

  let grandTotal = 0;

  const pj = order.assigned_user?.name || "";
  const helper = order.helper_user?.name || "";
  const isManual = ["manual", "sablon"].includes(
    (order.jenis_produksi || "").toLowerCase(),
  );
  const g = order.detail_gesut;
  // Jumlah screen = total komposisi gesut (hanya order Manual)
  const jumlahScreen =
    isManual && g
      ? String((g.kecil || 0) + (g.sedang || 0) + (g.besar || 0))
      : "";
  const areaBesar = isManual && g ? String(g.besar || 0) : "";
  const areaSedang = isManual && g ? String(g.sedang || 0) : "";
  const areaKecil = isManual && g ? String(g.kecil || 0) : "";

  const depan = (order.ukuran_desain_depan || "").trim();
  const belakang = (order.ukuran_desain_belakang || "").trim();
  const catatan = (order.catatan_pesanan || "").trim();

  // Jenis aplikasi per art (pilihan ganda dari form pesanan).
  const art = order.jenis_aplikasi_art;
  const hasArt =
    !!art &&
    (["depan", "belakang", "kanan", "kiri"] as const).some(
      (k) => art[k]?.length,
    );
  const joinArt = (k: "depan" | "belakang" | "kanan" | "kiri") =>
    (art?.[k] ?? []).join(", ");
  // Order lama (belum ada pilihan art): Depan = jenis order, Belakang bila ukuran belakang diisi.
  const fallback = jenisAplikasiLabel(order.jenis_produksi);
  const jenisDepan = hasArt ? joinArt("depan") : fallback;
  const jenisBelakang = hasArt ? joinArt("belakang") : belakang ? fallback : "";
  const jenisKanan = hasArt ? joinArt("kanan") : "";
  const jenisKiri = hasArt ? joinArt("kiri") : "";

  // Baris = 2 per warna (+ header + total). Makin banyak warna, baris makin
  // rapat; kalau masih kurang, kotak TTD dipendekkan (tetap menempel di bawah).
  const totalRows = groups.length * rowsPerGroup + 2;
  const rowH = Math.max(
    ROW_MIN,
    Math.min(ROW_MAX, Math.floor(TABLE_SPACE / totalRows)),
  );
  const overflow = Math.max(0, totalRows * rowH - TABLE_SPACE);
  const signH = Math.max(SIGN_H_MIN, SIGN_H - overflow);
  const cell = makeCell(rowH);

  return (
    <div
      className="approval-sheet"
      style={{
        width: SHEET_W,
        height: SHEET_H,
        background: "#fff",
        color: "#000",
        boxSizing: "border-box",
        padding: 14,
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div
        style={{
          border: "3px solid #000",
          height: "100%",
          boxSizing: "border-box",
          padding: 12,
          display: "flex",
          gap: 18,
        }}
      >
        {/* ───────── KIRI: header + mockup + keterangan desain ───────── */}
        <div
          style={{
            width: LEFT_W,
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
          }}
        >
          {/* Banner header: menempel di pojok kiri-atas bingkai (menutup padding 12px),
              lebarnya hanya selebar kolom kiri. File: public/header-nota.png */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/Header-approval.png"
            alt="Langitan Company"
            style={{
              display: "block",
              width: "calc(100% + 12px)",
              // Tailwind preflight memberi max-width:100% ke semua <img> → tanpa ini
              // lebar banner terpotong 12px dan tidak sejajar dengan garis di bawahnya.
              maxWidth: "none",
              height: "auto",
              margin: "-12px 0 0 -12px",
            }}
          />

          {/* Info order (kiri) + Deadline (kanan, sejajar baris paling bawah) */}
          <div
            style={{
              borderBottom: "2px solid #000",
              padding: "8px 0 6px",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div>
              <Field
                label="Code produksi"
                value={`#${order.kode_produksi}`}
                bold
                boldLabel
              />
              <Field label="PJ Produksi" value={pj} />
              {helper && <Field label="Helper" value={helper} />}
            </div>
            <div style={{ textAlign: "center", flexShrink: 0 }}>
              <div
                style={{
                  background: RED,
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 11,
                  padding: "2px 10px",
                  marginBottom: 2,
                }}
              >
                DEADLINE
              </div>
              <div
                style={{
                  border: `2px solid ${RED}`,
                  color: RED,
                  fontWeight: 700,
                  fontSize: 13,
                  padding: "1px 10px",
                }}
              >
                {fmtDate(order.deadline)}
              </div>
            </div>
          </div>

          {/* Mockup — gambar apa adanya, termasuk size chart di dalamnya */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {mockup && !isPdf ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mockup}
                alt="Mockup desain"
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain",
                }}
              />
            ) : (
              <div
                style={{
                  border: "2px dashed #aaa",
                  color: "#888",
                  fontSize: 12,
                  padding: 20,
                  textAlign: "center",
                  width: "90%",
                }}
              >
                {isPdf
                  ? "Mockup berupa PDF dan tidak bisa ditampilkan di form. Upload ulang sebagai gambar (JPG/PNG)."
                  : "Mockup belum diupload."}
              </div>
            )}
          </div>

          <div
            style={{ borderTop: "2px solid #000", paddingTop: 6, fontSize: 12 }}
          >
            <div style={{ height: 17, fontWeight: 700 }}>KET DESAIN:</div>
            <Field label="UKURAN DESAIN DEPAN" labelWidth={200} value={depan} />
            <Field
              label="UKURAN DESAIN BELAKANG"
              labelWidth={200}
              value={belakang}
            />
            <div
              style={{
                display: "flex",
                fontSize: 12,
                lineHeight: "15px",
                marginTop: 2,
              }}
            >
              <div style={{ width: 200 }}>CATATAN</div>
              <div style={{ width: 10 }}>:</div>
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: "-webkit-box",
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  whiteSpace: "pre-line",
                  wordBreak: "break-word",
                }}
              >
                {catatan}
              </div>
            </div>
          </div>
        </div>

        {/* ───────── KANAN: data order ───────── */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <SectionTitle n={1}>DETAIL CUSTOMER</SectionTitle>
          <div style={{ marginBottom: 8 }}>
            <Field
              label="Nama Customers"
              value={order.nama_pemesan}
              bold
              boldLabel
            />
            <Field label="Tanggal Masuk" value={fmtDate(order.tanggal_masuk)} />
            <Field label="Wa Customer" value={order.no_hp} />
          </div>

          <SectionTitle n={2}>DIV OPERATOR POTONG KAIN</SectionTitle>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              tableLayout: "fixed",
              marginBottom: 8,
            }}
          >
            <thead>
              <tr style={{ background: "#000", color: "#fff" }}>
                <th
                  style={{
                    ...cell,
                    border: "1px solid #000",
                    width: 92,
                    fontWeight: 700,
                  }}
                >
                  JENIS ARTIKEL
                </th>
                <th
                  style={{
                    ...cell,
                    border: "1px solid #000",
                    width: 66,
                    fontWeight: 700,
                  }}
                >
                  WARNA
                </th>
                {cols.map((c) => (
                  <th
                    key={c}
                    style={{
                      ...cell,
                      border: "1px solid #000",
                      fontWeight: 700,
                    }}
                  >
                    {c}
                  </th>
                ))}
                <th
                  style={{
                    ...cell,
                    border: "1px solid #000",
                    width: 42,
                    fontWeight: 700,
                  }}
                >
                  JMLH
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g, gi) =>
                (isSweater
                  ? (["panjang"] as const)
                  : (["pendek", "panjang"] as const)
                ).map((len, li) => {
                  const row = g[len];
                  const total = sum(row);
                  grandTotal += total;
                  return (
                    <tr key={`${gi}-${len}`}>
                      <td style={cell}>
                        {isSweater
                          ? "Sweater/Hoodie"
                          : len === "pendek"
                            ? "Kaos Pendek"
                            : "Kaos Panjang"}
                      </td>
                      {li === 0 && (
                        <td
                          rowSpan={rowsPerGroup}
                          style={{
                            ...cell,
                            fontSize: 10,
                            whiteSpace: "normal",
                            lineHeight: "11px",
                          }}
                        >
                          {g.warna}
                        </td>
                      )}
                      {cols.map((c) => (
                        <td key={c} style={cell}>
                          {row[c] ? row[c] : ""}
                        </td>
                      ))}
                      <td style={cell}>{total}</td>
                    </tr>
                  );
                }),
              )}
              <tr>
                <td
                  colSpan={2 + cols.length}
                  style={{ ...cell, border: "1px solid #000" }}
                >
                  TOTAL
                </td>
                <td
                  style={{
                    ...cell,
                    background: "#000",
                    color: "#fff",
                    fontWeight: 700,
                    border: "1px solid #000",
                  }}
                >
                  {grandTotal}
                </td>
              </tr>
            </tbody>
          </table>

          <SectionTitle n={3}>DIV OPERATOR AFDRUK</SectionTitle>
          <div style={{ display: "flex", gap: 16 }}>
            {/* Kiri: posisi ART + jenis aplikasinya (mengisi sisa lebar, nilai panjang aman) */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <ArtBlock title="ART DEPAN" jenis={jenisDepan} />
              <ArtBlock title="ART BELAKANG" jenis={jenisBelakang} />
              <ArtBlock title="ART KANAN" jenis={jenisKanan} />
              <ArtBlock title="ART KIRI" jenis={jenisKiri} />
            </div>
            {/* Kanan: jumlah screen & area (komposisi gesut) — cukup untuk 3 digit */}
            <div style={{ width: 132, flexShrink: 0 }}>
              <Field
                label="Jumlah Screen"
                labelWidth={92}
                value={jumlahScreen}
                bold
                boldLabel
              />
              <Field label="Area Besar" labelWidth={92} value={areaBesar} />
              <Field label="Area Sedang" labelWidth={92} value={areaSedang} />
              <Field label="Area Kecil" labelWidth={92} value={areaKecil} />
            </div>
          </div>

          {/* marginTop:auto → blok TTD selalu menempel di bawah */}
          <div style={{ marginTop: "auto" }}>
            <SectionTitle n={4}>APPROVAL & TTD PENERIMAAN</SectionTitle>
            <div style={{ display: "flex", gap: 14, height: signH }}>
              <SignBox title="Approval" />
              <div style={{ flex: 1.3, display: "flex" }}>
                <SignBox title="Customer" dotted />
                <SignBox title="Langitan.co" dotted />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
