// Jalankan: npx tsx --test tests/waMessages.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  labelProduk, detailPesanan, pesanOrderBaruPersonal, pesanTahapPersonal,
  pesanKendalaPengelola, pesanDeadlineGrup,
} from "../lib/waMessages";
import { tambahTagar, WA_TAGAR } from "../lib/waRows";

const kaos = { kode_produksi: "KP-001", nama_pemesan: "Budi", jumlah: 60, jenis_produksi: "DTF", deadline: "2026-11-30" };

test("labelProduk: kaos DTF / Manual / sweater", () => {
  assert.equal(labelProduk(kaos), "Kaos – DTF");
  assert.equal(labelProduk({ ...kaos, jenis_produksi: "Manual" }), "Kaos – Manual");
  assert.equal(labelProduk({ ...kaos, jenis_produksi: "manual", jenis_pakaian: "sweater_hoodie" }), "Sweater / Hoodie – Manual");
});

test("labelProduk: merchandise lanyard dengan/tanpa stopper, produk tanpa varian", () => {
  const m = { ...kaos, jenis_produksi: "merchandise", jenis_merchandise: "lanyard" };
  assert.equal(labelProduk({ ...m, varian_merchandise: "stopper" }), "Lanyard – Dengan Stopper");
  assert.equal(labelProduk({ ...m, varian_merchandise: "tanpa_stopper" }), "Lanyard – Tanpa Stopper");
  assert.equal(labelProduk({ ...m, jenis_merchandise: "totebag", varian_merchandise: null }), "Totebag");
  assert.equal(labelProduk({ ...m, jenis_merchandise: "pin_enamel" }), "Pin Enamel"); // produk baru tetap terbaca
});

test("detailPesanan memuat kode, pemesan, produksi, jumlah", () => {
  const t = detailPesanan(kaos);
  assert.match(t, /\*Kode:\* KP-001/);
  assert.match(t, /\*Pemesan:\* Budi/);
  assert.match(t, /\*Produksi:\* Kaos – DTF/);
  assert.match(t, /\*Jumlah:\* 60 pcs/);
});

test("pesan satu-pesanan & daftar sama-sama memuat pemesan + jenis produksi", () => {
  assert.match(pesanOrderBaruPersonal("Andi", "PJ", kaos), /Budi[\s\S]*Kaos – DTF/);
  assert.match(pesanTahapPersonal("Andi", "On Process", kaos), /Pesanan berikut sudah masuk tahap \*PRODUKSI\*/);
  assert.match(pesanKendalaPengelola(kaos, "mesin rusak", "Sari", "Andi", undefined, "https://x"), /Kaos – DTF/);
  assert.match(pesanDeadlineGrup([{ order: kaos, sisaHari: 2 }]), /KP-001\* — Budi • Kaos – DTF \(60 pcs\)/);
});

test("tambahTagar: di bagian bawah, tidak ganda", () => {
  const a = tambahTagar("Halo\n");
  assert.equal(a, `Halo\n\n${WA_TAGAR}`);
  assert.equal(tambahTagar(a), a);
});
