// Jalankan: npx tsx tests/stepAccess.test.ts
import assert from "node:assert/strict";
import {
  getFinishingDeleteBlock,
  getMulaiBlock,
  getPackingBlock,
  getQcBlock,
  getQcResetBlock,
  getShippingBlock,
  getUploadBlock,
  getStepBlock,
  getStepSequenceBlock,
  hasLaterStepStarted,
  hasProductionStarted,
  isOrderTeamMember,
} from "../lib/stepAccess";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

const step = (id: string, name: string, over: any = {}) => ({
  id, name, type: "upload_image", isCompleted: false, ...over,
});

const order = (over: any = {}): any => ({
  id: "o1",
  jenis_produksi: "Manual",
  assigned_to: "pj1",
  helper_id: "hp1",
  link_approval: { link: "https://x/mockup.jpg", by: "a", timestamp: "t" },
  finishing_qc: { isPassed: false, notes: "" },
  finishing_packing: { isPacked: false },
  shipping: {},
  steps_manual: [
    step("m1", "Pecah Gambar (PDF)"),
    step("m2", "Print Film"),
    step("m3", "Proofing"),
    step("m4", "Produksi Massal"),
  ],
  ...over,
});

const pj = { id: "pj1", role: "produksi" as const };
const helper = { id: "hp1", role: "produksi" as const };
const orang = { id: "x9", role: "produksi" as const };
const qcUser = { id: "qc1", role: "qc" as const, roles: ["qc"] };
const admin = { id: "ad1", role: "admin" as const };
const superAdmin = { id: "sa1", role: "super_admin" as const };

test("step pertama boleh bila approval ada", () => {
  assert.equal(getStepSequenceBlock(order(), "m1"), null);
});

test("step pertama diblok bila approval belum ada", () => {
  const o = order({ link_approval: null });
  assert.match(getStepSequenceBlock(o, "m1")!, /approval/i);
});

test("step kedua diblok sampai step pertama selesai", () => {
  assert.match(getStepSequenceBlock(order(), "m2")!, /Pecah Gambar/);
});

test("step melompat diblok (step 4 saat step 1-3 belum)", () => {
  assert.match(getStepSequenceBlock(order(), "m4")!, /Pecah Gambar/);
});

test("step berikutnya terbuka setelah sebelumnya selesai", () => {
  const o = order();
  o.steps_manual[0].isCompleted = true;
  assert.equal(getStepSequenceBlock(o, "m2"), null);
  assert.match(getStepSequenceBlock(o, "m3")!, /Print Film/);
});

test("proofing yang baru diupload (belum disetujui) tetap menahan step sesudahnya", () => {
  const o = order();
  o.steps_manual[0].isCompleted = true;
  o.steps_manual[1].isCompleted = true;
  o.steps_manual[2].fileUrl = "https://x/proof.jpg";
  assert.match(getStepSequenceBlock(o, "m4")!, /Proofing/);
});

test("super admin juga terikat urutan", () => {
  assert.match(getStepBlock(order(), superAdmin, "m3")!, /Pecah Gambar/);
});

test("PJ dan Helper boleh, orang lain tidak (Manual)", () => {
  assert.equal(getStepBlock(order(), pj, "m1"), null);
  assert.equal(getStepBlock(order(), helper, "m1"), null);
  assert.match(getStepBlock(order(), orang, "m1")!, /PJ atau Helper/);
});

test("admin dan super admin lolos kepemilikan", () => {
  assert.equal(isOrderTeamMember(order(), admin), true);
  assert.equal(isOrderTeamMember(order(), superAdmin), true);
});

test("pesanan tanpa PJ/Helper (DTF) tidak dibatasi kepemilikan", () => {
  const o = order({ assigned_to: null, helper_id: null });
  assert.equal(isOrderTeamMember(o, orang), true);
});

test("undo ditolak bila step sesudahnya sudah selesai atau punya file", () => {
  const o = order();
  o.steps_manual[0].isCompleted = true;
  o.steps_manual[1].isCompleted = true;
  assert.equal(hasLaterStepStarted(o, "m1"), true);
  assert.equal(hasLaterStepStarted(o, "m2"), false);
  o.steps_manual[2].fileUrl = "https://x/proof.jpg";
  assert.equal(hasLaterStepStarted(o, "m2"), true);
});

test("hasProductionStarted", () => {
  assert.equal(hasProductionStarted(order()), false);
  const o = order();
  o.steps_manual[0].isCompleted = true;
  assert.equal(hasProductionStarted(o), true);
});

test("merchandise & DTF ikut aturan urutan yang sama", () => {
  const dtf: any = order({
    jenis_produksi: "DTF", assigned_to: null, helper_id: null,
    steps_dtf: [step("d1", "Cetak DTF", { type: "status_update" }), step("d2", "Press Kaos")],
  });
  assert.match(getStepSequenceBlock(dtf, "d2")!, /Cetak DTF/);
  const mer: any = order({
    jenis_produksi: "merchandise",
    steps_merchandise: [step("l1", "Cetak Kertas Sublim"), step("l2", "Produksi Sublim")],
  });
  assert.match(getStepSequenceBlock(mer, "l2")!, /Cetak Kertas Sublim/);
});

const selesaiProduksi = (o: any) => {
  o.steps_manual.forEach((x: any) => (x.isCompleted = true));
  return o;
};

test("QC diblok sampai semua step produksi selesai", () => {
  assert.match(getQcBlock(order(), qcUser)!, /step produksi/i);
  assert.equal(getQcBlock(selesaiProduksi(order()), qcUser), null);
});

test("QC hanya untuk tim QC (dan management), bukan user produksi", () => {
  const o = selesaiProduksi(order());
  assert.match(getQcBlock(o, pj)!, /tim QC/);
  assert.equal(getQcBlock(o, admin), null);
  assert.equal(getQcBlock(o, superAdmin), null);
});

test("super admin tetap terikat urutan QC", () => {
  assert.match(getQcBlock(order(), superAdmin)!, /step produksi/i);
});

test("packing menunggu QC lolos; merchandise tidak punya packing", () => {
  const o = selesaiProduksi(order());
  assert.match(getPackingBlock(o, qcUser)!, /QC lolos/);
  o.finishing_qc.isPassed = true;
  assert.equal(getPackingBlock(o, qcUser), null);
  assert.match(getPackingBlock(o, pj)!, /tim QC/);
  const mer: any = selesaiProduksi(order({ jenis_produksi: "merchandise", steps_merchandise: [step("l1", "Cetak", { isCompleted: true })] }));
  mer.finishing_qc.isPassed = true;
  assert.match(getPackingBlock(mer, qcUser)!, /tidak memiliki/);
});

test("resi menunggu QC + packing; bukti terima menunggu resi", () => {
  const o = selesaiProduksi(order());
  assert.match(getShippingBlock(o, qcUser, "kirim")!, /QC lolos/);
  o.finishing_qc.isPassed = true;
  assert.match(getShippingBlock(o, qcUser, "kirim")!, /packing/);
  o.finishing_packing.isPacked = true;
  assert.equal(getShippingBlock(o, qcUser, "kirim"), null);
  assert.match(getShippingBlock(o, qcUser, "terima")!, /resi/);
  o.shipping.bukti_kirim = "https://x/resi.jpg";
  assert.equal(getShippingBlock(o, qcUser, "terima"), null);
});

test("merchandise: resi langsung setelah QC lolos (tanpa packing)", () => {
  const mer: any = order({
    jenis_produksi: "merchandise",
    steps_merchandise: [step("l1", "Cetak", { isCompleted: true })],
  });
  mer.finishing_qc.isPassed = true;
  assert.equal(getShippingBlock(mer, qcUser, "kirim"), null);
});

test("hapus/reset diblok bila tahap sesudahnya sudah ada", () => {
  const o = selesaiProduksi(order());
  o.finishing_qc.isPassed = true;
  assert.equal(getQcResetBlock(o), null);
  o.finishing_packing.isPacked = true;
  assert.match(getQcResetBlock(o)!, /packing/);
  assert.equal(getFinishingDeleteBlock(o, "packing"), null);
  o.shipping.bukti_kirim = "https://x/resi.jpg";
  assert.match(getFinishingDeleteBlock(o, "packing")!, /pengiriman/);
  assert.equal(getFinishingDeleteBlock(o, "shipping_kirim"), null);
  o.shipping.bukti_terima = "https://x/terima.jpg";
  assert.match(getFinishingDeleteBlock(o, "shipping_kirim")!, /terima/);
});

test("step produksi tidak bisa di-undo setelah QC lolos", () => {
  const o = selesaiProduksi(order());
  assert.equal(hasLaterStepStarted(o, "m4"), false);
  o.finishing_qc.isPassed = true;
  assert.equal(hasLaterStepStarted(o, "m4"), true);
});

test("getUploadBlock meneruskan ke aturan yang tepat", () => {
  const o = selesaiProduksi(order());
  assert.match(getUploadBlock(o, qcUser, "packing")!, /QC lolos/);
  assert.match(getUploadBlock(o, qcUser, "shipping_kirim")!, /QC lolos/);
  assert.match(getUploadBlock(o, orang, "step", "m1")!, /PJ atau Helper/);
  assert.equal(getUploadBlock(o, orang, "approval"), null);
});

const siapProduksiMassal = () => {
  const o = order();
  for (const i of [0, 1, 2]) o.steps_manual[i].isCompleted = true;
  return o;
};

test("Mulai: hanya Produksi Massal, setelah step sebelumnya selesai, oleh PJ/Helper", () => {
  assert.match(getMulaiBlock(order(), pj, "m1")!, /tidak memakai/);
  assert.match(getMulaiBlock(order(), pj, "m4")!, /Pecah Gambar/);
  const o = siapProduksiMassal();
  assert.equal(getMulaiBlock(o, pj, "m4"), null);
  assert.equal(getMulaiBlock(o, helper, "m4"), null);
  assert.match(getMulaiBlock(o, orang, "m4")!, /PJ atau Helper/);
});

test("Mulai tidak bisa dua kali dan tidak bisa setelah selesai", () => {
  const o = siapProduksiMassal();
  o.steps_manual[3].mulaiAt = "2026-12-01T01:00:00Z";
  assert.match(getMulaiBlock(o, pj, "m4")!, /sudah dimulai/);
  o.steps_manual[3].isCompleted = true;
  assert.match(getMulaiBlock(o, pj, "m4")!, /sudah selesai/);
});

test("upload foto Produksi Massal diblok sebelum Mulai, boleh sesudahnya", () => {
  const o = siapProduksiMassal();
  assert.match(getUploadBlock(o, pj, "step", "m4")!, /Mulai/);
  o.steps_manual[3].mulaiAt = "2026-12-01T01:00:00Z";
  assert.equal(getUploadBlock(o, pj, "step", "m4"), null);
});

test("step lain tidak butuh Mulai untuk upload", () => {
  const o = order();
  assert.equal(getUploadBlock(o, pj, "step", "m1"), null);
});

test("Produksi Massal yang sedang berjalan mengunci pembatalan step sebelumnya dan approval", () => {
  const o = siapProduksiMassal();
  assert.equal(hasLaterStepStarted(o, "m3"), false);
  o.steps_manual[3].mulaiAt = "2026-12-01T01:00:00Z";
  assert.equal(hasLaterStepStarted(o, "m3"), true);
  assert.equal(hasProductionStarted(order()), false);
  assert.equal(hasProductionStarted(o), true);
});

console.log(`\n${passed} test lolos`);
