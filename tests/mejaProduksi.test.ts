// Jalankan: npx tsx tests/mejaProduksi.test.ts
import assert from "node:assert/strict";
import {
  antrianBelumDijadwalkan,
  bentrokJadwal,
  jumlahMenungguApproval,
  kondisiHari,
  perluJadwalMeja,
  bebanHari,
  estimasiSelesai,
  isDurasiValid,
  jadwalOf,
  labelPutusan,
  menyentuhHari,
  parseTanggal,
  mulaiPalingAkhir,
  nilaiJadwal,
  tglIso,
} from "../lib/mejaProduksi";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const d = (s: string) => parseTanggal(s)!;
const ord = (o: Record<string, unknown>) => o as any;

console.log("Jadwal & estimasi selesai");
test("durasi 1 hari selesai di hari yang sama", () => {
  const j = jadwalOf(ord({ meja_mulai: "2026-12-01", meja_durasi: 1 }))!;
  assert.equal(tglIso(j.selesai), "2026-12-01");
});
test("mulai 1 Des, 5 hari → selesai 5 Des", () => {
  assert.equal(tglIso(estimasiSelesai(d("2026-12-01"), 5)), "2026-12-05");
});
test("melewati pergantian bulan dan tahun", () => {
  assert.equal(tglIso(estimasiSelesai(d("2026-12-30"), 5)), "2027-01-03");
});
test("jadwal tidak lengkap atau rusak dianggap belum dijadwalkan", () => {
  assert.equal(jadwalOf(ord({ meja_mulai: "2026-12-01", meja_durasi: null })), null);
  assert.equal(jadwalOf(ord({ meja_mulai: null, meja_durasi: 3 })), null);
  assert.equal(jadwalOf(ord({ meja_mulai: "bukan-tanggal", meja_durasi: 3 })), null);
  assert.equal(jadwalOf(ord({ meja_mulai: "2026-12-01", meja_durasi: 0 })), null);
  assert.equal(jadwalOf(ord({ meja_mulai: "2026-12-01", meja_durasi: 91 })), null);
});
test("parseTanggal menolak tanggal yang tidak ada", () => {
  assert.equal(parseTanggal("2026-02-30"), null);
  assert.equal(parseTanggal("26-12-01"), null);
  assert.equal(parseTanggal(""), null);
  assert.equal(tglIso(parseTanggal("2026-12-01T10:00:00Z")!), "2026-12-01");
});
test("validasi durasi: bulat 1..90", () => {
  assert.equal(isDurasiValid(1), true);
  assert.equal(isDurasiValid(90), true);
  assert.equal(isDurasiValid(0), false);
  assert.equal(isDurasiValid(2.5), false);
  assert.equal(isDurasiValid("3"), false);
});

console.log("Penilaian terhadap deadline");
test("selesai tepat di deadline", () => {
  const n = nilaiJadwal(d("2026-12-10"), "2026-12-10");
  assert.equal(n.putusan, "tepat");
  assert.equal(labelPutusan(n), "Tepat deadline");
});
test("mundur 3 hari", () => {
  const n = nilaiJadwal(d("2026-12-13"), "2026-12-10");
  assert.deepEqual(n, { putusan: "mundur", selisihHari: 3 });
  assert.equal(labelPutusan(n), "Mundur 3 hari");
});
test("maju 2 hari", () => {
  const n = nilaiJadwal(d("2026-12-08"), "2026-12-10");
  assert.equal(n.putusan, "maju");
  assert.equal(labelPutusan(n), "Maju 2 hari");
});
test("tanpa deadline", () => {
  assert.equal(nilaiJadwal(d("2026-12-08"), "").putusan, "tanpa_deadline");
});
test("tanggal naik paling akhir agar tepat deadline", () => {
  const m = mulaiPalingAkhir(d("2026-12-10"), 4);
  assert.equal(tglIso(m), "2026-12-07");
  assert.equal(nilaiJadwal(estimasiSelesai(m, 4), "2026-12-10").putusan, "tepat");
});

console.log("Beban meja & antrian");
const approval = { link_approval: { link: "https://x" } };
const stepsM = (done: boolean[]) => ({
  steps_manual: ["Pecah Gambar (PDF)", "Print Film", "Proofing", "Produksi Massal"].map((name, i) => ({
    id: `m${i}`,
    name,
    isCompleted: done[i] ?? false,
  })),
});
const manual = (done: boolean[] = []) => ({ jenis_produksi: "manual", ...stepsM(done) });
const orders = [
  ord({ id: "a", jumlah: 20, meja_mulai: "2026-12-01", meja_durasi: 3, status: "On Process" }),
  ord({ id: "b", jumlah: 30, meja_mulai: "2026-12-03", meja_durasi: 2, status: "On Process" }),
  ord({ id: "c", jumlah: 5, status: "Pesanan Masuk", tanggal_masuk: "2026-12-02", ...manual(), ...approval }),
  ord({ id: "e", jumlah: 8, status: "Pesanan Masuk", tanggal_masuk: "2026-11-30", ...manual(), ...approval }),
  ord({ id: "f", jumlah: 8, status: "Selesai", tanggal_masuk: "2026-11-01", ...manual(), ...approval }),
  ord({ id: "g", jumlah: 8, status: "Pesanan Masuk", tanggal_masuk: "2026-11-29", ...manual() }),
  ord({ id: "h", jumlah: 8, status: "Pesanan Masuk", tanggal_masuk: "2026-11-28", jenis_produksi: "dtf", link_approval: { link: "x" } }),
];
test("hari batas dihitung: 3 Des kena order a dan b", () => {
  assert.deepEqual(bebanHari(orders, d("2026-12-03")), { order: 2, pcs: 50 });
  assert.deepEqual(bebanHari(orders, d("2026-12-04")), { order: 1, pcs: 30 });
  assert.deepEqual(bebanHari(orders, d("2026-12-06")), { order: 0, pcs: 0 });
});
test("menyentuhHari inklusif di kedua ujung", () => {
  const j = jadwalOf(orders[0])!;
  assert.equal(menyentuhHari(j, d("2026-12-01")), true);
  assert.equal(menyentuhHari(j, d("2026-12-03")), true);
  assert.equal(menyentuhHari(j, d("2026-12-04")), false);
  assert.equal(menyentuhHari(j, d("2026-11-30")), false);
});
test("antrian: Manual, Approval terbit, belum dijadwalkan & belum selesai, urut tanggal masuk", () => {
  assert.deepEqual(antrianBelumDijadwalkan(orders).map((o: any) => o.id), ["e", "c"]);
});
test("DTF tidak perlu jadwal; Manual tanpa Approval dihitung menunggu", () => {
  assert.equal(perluJadwalMeja(ord({ jenis_produksi: "dtf" })), false);
  assert.equal(perluJadwalMeja(ord({ jenis_produksi: "manual" })), true);
  assert.equal(jumlahMenungguApproval(orders), 1);
});

console.log("Penggabungan di meja");
const penghuni = [
  ord({ id: "p1", jumlah: 10, meja_mulai: "2026-12-10", meja_durasi: 2, meja_gabung: true }),
  ord({ id: "p2", jumlah: 15, meja_mulai: "2026-12-11", meja_durasi: 1, meja_gabung: false }),
];
test("hari kosong, bisa digabung, dan penuh", () => {
  assert.equal(kondisiHari(penghuni, d("2026-12-09"), true).kondisi, "kosong");
  assert.equal(kondisiHari(penghuni, d("2026-12-10"), true).kondisi, "gabung");
  assert.equal(kondisiHari(penghuni, d("2026-12-10"), false).kondisi, "penuh");
  assert.equal(kondisiHari(penghuni, d("2026-12-11"), true).kondisi, "penuh");
});
test("kondisi hari tidak menghitung order itu sendiri", () => {
  assert.equal(kondisiHari(penghuni, d("2026-12-10"), false, "p1").kondisi, "kosong");
});
test("bentrok: hanya bila ada tumpang tindih dan salah satu tidak bisa digabung", () => {
  assert.deepEqual(bentrokJadwal(penghuni, d("2026-12-10"), 1, true).map((o: any) => o.id), []);
  assert.deepEqual(bentrokJadwal(penghuni, d("2026-12-10"), 2, true).map((o: any) => o.id), ["p2"]);
  assert.deepEqual(bentrokJadwal(penghuni, d("2026-12-10"), 1, false).map((o: any) => o.id), ["p1"]);
  assert.deepEqual(bentrokJadwal(penghuni, d("2026-12-12"), 3, false).map((o: any) => o.id), []);
});

console.log(`\n${passed} tes lulus`);
