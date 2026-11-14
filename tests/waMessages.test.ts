// Jalankan: npx tsx --test tests/waMessages.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  labelProduk, detailPesanan, pesanOrderBaruPersonal, pesanTahapPersonal,
  pesanKendalaPengelola, pesanDeadlineGrup, pesanVerifikasi, labelMetodeWa, labelAkun,
} from "../lib/waMessages";
import { tambahTagar, WA_TAGAR } from "../lib/waRows";
import { buatLinkPreview } from "../wa-gateway/src/safety";

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

test("pesanVerifikasi: memuat metode bayar; pengeluaran tanpa baris metode", () => {
  const dasar = { nominal: 150000, pencatat: "Sari", menunggu: { pembayaran: 1, pengeluaran: 0 }, link: "https://x" };
  for (const m of ["Transfer", "Tunai", "QRIS"]) {
    const t = pesanVerifikasi({ ...dasar, jenis: "pembayaran", rincian: detailPesanan(kaos), metode: m });
    assert.match(t, new RegExp(`Metode: \\*${m}\\*`));
    assert.match(t, /\*Pemesan:\* Budi/);
  }
  assert.match(pesanVerifikasi({ ...dasar, jenis: "refund", rincian: "x", metode: "Tunai" }), /Metode: \*Tunai\*/);
  assert.doesNotMatch(pesanVerifikasi({ ...dasar, jenis: "pengeluaran", rincian: "Beli tinta" }), /Metode/);
});

test("link diberi label seragam di baris sendiri", () => {
  const k = pesanKendalaPengelola(kaos, "mesin rusak", "Sari", "Andi", undefined, "https://app.co/?tab=orders&view=detail&orderId=1");
  assert.match(k, /👉 \*Buka pesanan di aplikasi:\*\nhttps:\/\/app\.co\/\?tab=orders/);
  const v = pesanVerifikasi({ jenis: "pembayaran", nominal: 1000, pencatat: "S", rincian: "x", menunggu: { pembayaran: 1, pengeluaran: 0 }, link: "https://app.co/?tab=finance&ftab=verify" });
  assert.match(v, /👉 \*Buka verifikasi di aplikasi:\*\nhttps:\/\/app\.co\/\?tab=finance&ftab=verify/);
});

test("buatLinkPreview: kendala → judul laporan + kode • pemesan • produksi", () => {
  const url = "https://app.co/?tab=orders&view=detail&orderId=1";
  const p = buatLinkPreview(tambahTagar(pesanKendalaPengelola(kaos, "mesin rusak", "Sari", "Andi", undefined, url)))!;
  assert.equal(p.url, url);
  assert.match(p.title, /LAPORAN KENDALA PESANAN/);
  assert.equal(p.description, "KP-001 • Budi • Kaos – DTF");
});

test("buatLinkPreview: pembayaran → nominal & metode; pengeluaran → keterangan", () => {
  const dasar = { nominal: 150000, pencatat: "S", menunggu: { pembayaran: 1, pengeluaran: 0 }, link: "https://app.co/x" };
  const bayar = buatLinkPreview(pesanVerifikasi({ ...dasar, jenis: "pembayaran", rincian: detailPesanan(kaos), metode: "QRIS" }))!;
  assert.match(bayar.title, /PEMBAYARAN MENUNGGU VERIFIKASI/);
  assert.equal(bayar.description, "KP-001 • Budi • Kaos – DTF • Rp 150.000 • QRIS");
  const keluar = buatLinkPreview(pesanVerifikasi({ ...dasar, jenis: "pengeluaran", rincian: "Beli tinta DTF" }))!;
  assert.equal(keluar.description, "Beli tinta DTF • Rp 150.000");
});

test("buatLinkPreview: tanpa link → null; tanda baca di ujung link dibuang; teks panjang dipotong", () => {
  assert.equal(buatLinkPreview("Halo, tidak ada link"), null);
  assert.equal(buatLinkPreview("Lihat https://app.co/x).")!.url, "https://app.co/x");
  assert.ok(buatLinkPreview(`${"A".repeat(300)}\nhttps://app.co/x`)!.title.length <= 100);
});

test("jenis pembayaran: Transfer Bank / QRIS / Tunai + akun tujuan", () => {
  assert.equal(labelMetodeWa("transfer"), "Transfer Bank");
  assert.equal(labelMetodeWa("qris"), "QRIS");
  assert.equal(labelMetodeWa("tunai"), "Tunai");
  assert.equal(labelMetodeWa("lainnya"), "Lainnya");
  assert.equal(labelMetodeWa(undefined), "");
  assert.equal(labelAkun("BCA", "bank"), "BCA (Bank)");
  assert.equal(labelAkun("QRIS Toko", "ewallet"), "QRIS Toko (E-Wallet)");
  assert.equal(labelAkun("Kas Kecil", "cash"), "Kas Kecil (Kas)");
  assert.equal(labelAkun("Lain", "tipe_baru"), "Lain");
  assert.equal(labelAkun(null, "bank"), "");
  const t = pesanVerifikasi({
    jenis: "pembayaran", nominal: 150000, pencatat: "Sari", rincian: detailPesanan(kaos),
    metode: labelMetodeWa("transfer"), akun: labelAkun("BCA", "bank"),
    menunggu: { pembayaran: 1, pengeluaran: 0 }, link: "https://app.co/x",
  });
  assert.match(t, /Metode: \*Transfer Bank\*\nAkun tujuan: \*BCA \(Bank\)\*/);
});
