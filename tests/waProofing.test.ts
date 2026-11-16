// Jalankan: npx tsx --test tests/waProofing.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { bacaBalasanProofing, teksDariPesan } from "../lib/waProofing";

test("siap produksi → ACC (huruf besar/kecil & tanda baca bebas)", () => {
  for (const t of ["siap produksi", "Siap Produksi", "  SIAP   PRODUKSI! ", "siap produksi.", "\u200esiap produksi"]) {
    assert.deepEqual(bacaBalasanProofing(t), { jenis: "acc" }, t);
  }
});

test("Revisi: alasan → revisi, alasan = teks setelah titik dua pertama", () => {
  assert.deepEqual(bacaBalasanProofing("Revisi: warna merah terlalu gelap"), { jenis: "revisi", alasan: "warna merah terlalu gelap" });
  assert.deepEqual(bacaBalasanProofing("revisi:logo geser kiri"), { jenis: "revisi", alasan: "logo geser kiri" });
  assert.deepEqual(bacaBalasanProofing("REVISI : ukuran: XL diganti L"), { jenis: "revisi", alasan: "ukuran: XL diganti L" });
  assert.deepEqual(bacaBalasanProofing("Revisi: baris 1\nbaris 2"), { jenis: "revisi", alasan: "baris 1\nbaris 2" });
});

test("Revisi tanpa alasan → minta alasan", () => {
  assert.deepEqual(bacaBalasanProofing("Revisi:"), { jenis: "revisi_kosong" });
  assert.deepEqual(bacaBalasanProofing("revisi:   "), { jenis: "revisi_kosong" });
});

test("pesan biasa diabaikan", () => {
  for (const t of ["", "ok", "siap", "siap produksi besok ya", "tolong revisi", "revisi warna", null, undefined]) {
    assert.equal(bacaBalasanProofing(t as any), null, String(t));
  }
});

test("alasan revisi dibatasi 500 karakter", () => {
  const r = bacaBalasanProofing("Revisi: " + "a".repeat(900));
  assert.equal(r?.jenis, "revisi");
  assert.equal((r as any).alasan.length, 500);
});

test("teksDariPesan membaca teks biasa, balasan, dan keterangan gambar", () => {
  assert.equal(teksDariPesan({ conversation: "a" }), "a");
  assert.equal(teksDariPesan({ extendedTextMessage: { text: "b" } }), "b");
  assert.equal(teksDariPesan({ imageMessage: { caption: "c" } }), "c");
  assert.equal(teksDariPesan(null), "");
});
