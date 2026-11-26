// Jalankan: npx tsx tests/produksiMassal.test.ts
import assert from "node:assert/strict";
import { durasiMs, fasePM, formatDurasi, isProduksiMassalStep } from "../lib/produksiMassal";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const MENIT = 60000;

console.log("Fase & durasi Produksi Massal");
test("hanya langkah bernama Produksi Massal", () => {
  assert.equal(isProduksiMassalStep({ name: "Produksi Massal" }), true);
  assert.equal(isProduksiMassalStep({ name: "produksi  massal" }), true);
  assert.equal(isProduksiMassalStep({ name: "Print Film" }), false);
  assert.equal(isProduksiMassalStep(undefined), false);
});
test("fase: belum, berjalan, selesai", () => {
  assert.equal(fasePM({ isCompleted: false }), "belum");
  assert.equal(fasePM({ isCompleted: false, mulaiAt: "2026-12-01T01:00:00Z" }), "berjalan");
  assert.equal(fasePM({ isCompleted: true, mulaiAt: "2026-12-01T01:00:00Z" }), "selesai");
});
test("durasi dari mulai ke selesai", () => {
  const s = { mulaiAt: "2026-12-01T01:00:00Z", completedAt: "2026-12-01T06:20:00Z" };
  assert.equal(durasiMs(s), 320 * MENIT);
});
test("durasi berjalan memakai waktu sekarang; belum mulai atau rusak = null", () => {
  const s = { mulaiAt: "2026-12-01T01:00:00Z", completedAt: null };
  assert.equal(durasiMs(s), null);
  assert.equal(durasiMs(s, new Date("2026-12-01T01:30:00Z")), 30 * MENIT);
  assert.equal(durasiMs({ mulaiAt: null, completedAt: null }, new Date()), null);
  assert.equal(durasiMs({ mulaiAt: "bukan-waktu", completedAt: null }, new Date()), null);
});
test("selesai sebelum mulai (jam perangkat berbeda) tidak negatif", () => {
  const s = { mulaiAt: "2026-12-01T05:00:00Z", completedAt: "2026-12-01T04:59:00Z" };
  assert.equal(durasiMs(s), 0);
});
test("format durasi", () => {
  assert.equal(formatDurasi(20_000), "kurang dari 1 menit");
  assert.equal(formatDurasi(45 * MENIT), "45 menit");
  assert.equal(formatDurasi(60 * MENIT), "1 jam");
  assert.equal(formatDurasi(320 * MENIT), "5 jam 20 menit");
  assert.equal(formatDurasi(24 * 60 * MENIT), "1 hari");
  assert.equal(formatDurasi((51 * 60 + 10) * MENIT), "2 hari 3 jam");
});

console.log(`\n${passed} tes lulus`);
