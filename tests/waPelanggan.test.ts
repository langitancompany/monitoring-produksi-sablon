// Jalankan: npx tsx --test tests/waPelanggan.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { pesanTrackingPelanggan, pesanProofingPelanggan, pesanProofingFormat, pesanAccUntukTim, pesanRevisiUntukTim } from "../lib/waMessages";
import { linkTracking } from "../lib/waAppUrl";
import { bacaBalasanProofing } from "../lib/waProofing";

const order = { kode_produksi: "LC-2611-007", nama_pemesan: "Ahmad", jumlah: 24, jenis_produksi: "dtf", deadline: "2026-12-01" };

test("pesan tracking memuat kode, link, dan petunjuk 4 digit HP", () => {
  const url = linkTracking("LC-2611-007");
  const t = pesanTrackingPelanggan(order, url);
  assert.ok(t.includes("LC-2611-007"));
  assert.ok(t.includes(url));
  assert.match(t, /4 digit terakhir/);
  assert.match(url, /\/tracking\?kode=LC-2611-007$/);
});

test("pesan proofing pelanggan memuat link gambar dan cara membalas ACC / Revisi:", () => {
  const t = pesanProofingPelanggan(order, "https://x.test/p/abc23456");
  assert.ok(t.includes("https://x.test/p/abc23456"));
  assert.match(t, /\*ACC\*/);
  assert.match(t, /Revisi: /);
});

test("petunjuk format menyebut kedua format balasan", () => {
  const t = pesanProofingFormat();
  assert.match(t, /ACC/);
  assert.match(t, /Revisi:/);
});

test("kabar ke tim: ACC mengajak mulai produksi, revisi memuat alasan", () => {
  const acc = pesanAccUntukTim("Budi", order, "Proofing", "https://x.test/o");
  assert.match(acc, /Budi/);
  assert.match(acc, /mulai produksi/i);
  const rev = pesanRevisiUntukTim("Budi", order, "Proofing", "warna kurang terang", "https://x.test/o");
  assert.ok(rev.includes("warna kurang terang"));
});

test("balasan pelanggan yang ambigu tidak dianggap ACC (dijawab petunjuk format, bukan disetujui)", () => {
  for (const t of ["acc dulu ya", "oke kak", "siap", "sudah bagus", "revisi warna"]) {
    assert.equal(bacaBalasanProofing(t), null, t);
  }
  assert.deepEqual(bacaBalasanProofing("ACC"), { jenis: "acc" });
});
