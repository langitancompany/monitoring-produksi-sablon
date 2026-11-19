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
