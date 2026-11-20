// Jalankan: npx tsx --test tests/waSenders.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  SENDER_ID_RE,
  WA_TUGAS,
  buatSenderId,
  cariBentrok,
  eventsDariTugas,
  tugasDariEvents,
  pemilikEvent,
} from "../lib/waSenders";

test("eventsDariTugas: proofing membawa balasannya; kunci tak dikenal diabaikan", () => {
  assert.deepEqual(eventsDariTugas(["proofing", "ngawur"]), ["proofing", "proofing_balasan"]);
  assert.deepEqual(eventsDariTugas([]), []);
});

test("tugasDariEvents: bolak-balik konsisten; tugas setengah jadi tidak dianggap terpilih", () => {
  const semua = WA_TUGAS.map((t) => t.key);
  assert.deepEqual(tugasDariEvents(eventsDariTugas(semua)), semua);
  assert.deepEqual(tugasDariEvents(["proofing"]), []); // tanpa proofing_balasan
});

test("cariBentrok: tugas yang sudah dipegang nomor lain ditolak dengan nama nomornya", () => {
  const lain = [{ id: "n1", label: "Admin 2", tasks: ["kendala"] }];
  assert.match(cariBentrok(lain, ["kendala"])!, /Admin 2/);
  assert.equal(cariBentrok(lain, ["deadline"]), null);
  assert.equal(cariBentrok([], ["kendala"]), null);
});

test("buatSenderId: lolos pola ID yang dipakai gateway & database", () => {
  for (let i = 0; i < 200; i++) assert.match(buatSenderId(), SENDER_ID_RE);
  assert.equal(SENDER_ID_RE.test("../etc"), false);
  assert.equal(SENDER_ID_RE.test("UTAMA"), false);
});

test("pemilikEvent: nomor utama bebas mengambil semua yang tidak dipegang nomor tambahan", () => {
  const nomor = [
    { id: "utama", utama: true, enabled: true, siap: true, events: [] },
    { id: "n1", utama: false, enabled: true, siap: true, events: ["kendala"] },
  ];
  assert.equal(pemilikEvent("kendala", nomor), "n1");
  assert.equal(pemilikEvent("tahap", nomor), "utama");
  assert.equal(pemilikEvent("", nomor), "utama");
  assert.equal(pemilikEvent("proofing_acc", nomor), "utama");
});

test("pemilikEvent: nomor tambahan belum siap atau dimatikan → tugasnya jatuh ke nomor utama", () => {
  const dasar = { id: "n1", utama: false, enabled: true, siap: true, events: ["kendala"] };
  const utama = { id: "utama", utama: true, enabled: true, siap: true, events: [] as string[] };
  assert.equal(pemilikEvent("kendala", [utama, { ...dasar, siap: false }]), "utama");
  assert.equal(pemilikEvent("kendala", [utama, { ...dasar, enabled: false }]), "utama");
});

test("pemilikEvent: nomor utama dibatasi → hanya pilihannya + tugas nomor tambahan yang tidak siap; sisanya tanpa pemegang", () => {
  const utama = { id: "utama", utama: true, enabled: true, siap: true, events: ["order_baru"] };
  const n1 = { id: "n1", utama: false, enabled: true, siap: true, events: ["kendala"] };
  assert.equal(pemilikEvent("order_baru", [utama, n1]), "utama");
  assert.equal(pemilikEvent("kendala", [utama, n1]), "n1");
  assert.equal(pemilikEvent("tahap", [utama, n1]), null);
  assert.equal(pemilikEvent("", [utama, n1]), null);
  // n1 mati → tugasnya diambil alih nomor utama
  assert.equal(pemilikEvent("kendala", [utama, { ...n1, enabled: false }]), "utama");
});
