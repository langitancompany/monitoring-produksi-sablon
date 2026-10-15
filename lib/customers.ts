// lib/customers.ts
//
// Daftar PELANGGAN LAMA yang dibangun dari riwayat pesanan (menu Kaos DAN
// Merchandise digabung), dipakai untuk mengisi otomatis Nama, No HP, dan
// Alamat saat membuat pesanan baru dari pelanggan yang repeat order.
//
// Tidak ada tabel/kolom baru di database: daftar ini dihitung dari data
// `orders` yang sudah dimuat aplikasi.

import type { Order } from "@/types";

export interface Customer {
  /** Kunci unik: nomor HP ter-normalisasi (cadangan: nama bila HP kosong). */
  key: string;
  nama: string;
  /** Format WA internasional tanpa "+" (mis. 62812xxxx), sama dengan di form. */
  hp: string;
  /** Alamat terbaru yang pernah diisi ('' bila belum pernah). */
  alamat: string;
  orderCount: number;
  /** created_at pesanan terbaru pelanggan ini. */
  lastOrderAt: string;
}

/** Normalisasi nomor HP ke format WA internasional (sama dengan di form pesanan). */
export function normalizePhone(raw: string): string {
  const cleaned = (raw ?? "").replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned.slice(1);
  if (cleaned.startsWith("0")) return "62" + cleaned.slice(1);
  return cleaned;
}

/** Tampilan nomor yang lebih mudah dibaca: 62812xxxx → 0812xxxx. */
export function displayPhone(hp: string): string {
  return hp.startsWith("62") ? "0" + hp.slice(2) : hp;
}

/**
 * Satu pelanggan = satu nomor HP. Bila nama atau alamatnya berbeda antar
 * pesanan, yang dipakai adalah data dari pesanan TERBARU (alamat: terbaru
 * yang tidak kosong). Pesanan di Sampah tidak ikut dihitung.
 */
export function buildCustomerList(orders: Order[]): Customer[] {
  const map = new Map<string, Customer & { alamatAt: string }>();

  for (const o of orders) {
    if (o.deleted_at) continue;

    const nama = (o.nama_pemesan ?? "").trim();
    const hp = normalizePhone(o.no_hp ?? "");
    if (!nama && !hp) continue;

    const key = hp ? `p:${hp}` : `n:${nama.toLowerCase()}`;
    const at = o.created_at ?? "";
    const alamat = (o.alamat_pemesan ?? "").trim();
    const cur = map.get(key);

    if (!cur) {
      map.set(key, {
        key,
        nama,
        hp,
        alamat,
        alamatAt: alamat ? at : "",
        orderCount: 1,
        lastOrderAt: at,
      });
      continue;
    }

    cur.orderCount += 1;
    if (at > cur.lastOrderAt) {
      cur.lastOrderAt = at;
      if (nama) cur.nama = nama;
    }
    if (alamat && at > cur.alamatAt) {
      cur.alamat = alamat;
      cur.alamatAt = at;
    }
  }

  return Array.from(map.values())
    .map((c) => ({
      key: c.key,
      nama: c.nama,
      hp: c.hp,
      alamat: c.alamat,
      orderCount: c.orderCount,
      lastOrderAt: c.lastOrderAt,
    }))
    .sort((a, b) => b.lastOrderAt.localeCompare(a.lastOrderAt));
}

/**
 * Cari pelanggan untuk saran saat mengetik.
 *  - field "nama": cocok bila nama mengandung teks (yang diawali teks diutamakan), min. 2 huruf.
 *  - field "hp"  : cocok bila nomor mengandung angka yang diketik, min. 3 angka.
 */
export function searchCustomers(
  customers: Customer[],
  query: string,
  field: "nama" | "hp",
  limit = 6,
): Customer[] {
  if (field === "hp") {
    if (query.replace(/\D/g, "").length < 3) return [];
    const digits = normalizePhone(query).replace(/\D/g, "");
    return customers.filter((c) => c.hp.includes(digits)).slice(0, limit);
  }

  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const startsWith: Customer[] = [];
  const contains: Customer[] = [];
  for (const c of customers) {
    const n = c.nama.toLowerCase();
    if (n.startsWith(q)) startsWith.push(c);
    else if (n.includes(q)) contains.push(c);
  }
  return [...startsWith, ...contains].slice(0, limit);
}
