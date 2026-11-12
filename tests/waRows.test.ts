// Jalankan: npx tsx --test tests/waRows.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { seragamkanBaris } from "../lib/waRows";

test("seragamkanBaris: semua baris punya kolom mentions yang sama", () => {
  const baris = seragamkanBaris([
    { target_type: "group", target: "1@g.us", mentions: ["62811"] },
    { target_type: "user", target: "62822" },
  ]);
  assert.deepEqual(baris[0].mentions, ["62811"]);
  assert.deepEqual(baris[1].mentions, []);
  // kumpulan kunci identik di semua baris → PostgREST tidak mengisi NULL
  assert.deepEqual(Object.keys(baris[0]).sort(), Object.keys(baris[1]).sort());
});

test("seragamkanBaris: tidak mengubah data asli", () => {
  const asli = [{ target: "x" }];
  seragamkanBaris(asli);
  assert.equal("mentions" in asli[0], false);
});
