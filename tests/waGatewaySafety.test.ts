// Jalankan: npx tsx --test tests/waGatewaySafety.test.ts
// Menguji logika murni gateway (tanpa WhatsApp & database): wa-gateway/src/safety.ts
import test from "node:test";
import assert from "node:assert/strict";
import { CircuitBreaker, NumberCache, SendLimiter, TtlCache, retry } from "../wa-gateway/src/safety";

const HOUR = 3_600_000;

test("TtlCache: kedaluwarsa sesuai TTL", () => {
  let t = 1000;
  const c = new TtlCache<string>(100, () => t);
  c.set("a", "x");
  assert.equal(c.get("a"), "x");
  t += 101;
  assert.equal(c.get("a"), undefined);
});

test("TtlCache: maxSize membuang entri paling lama", () => {
  const c = new TtlCache<number>(10_000, () => 0, 3);
  for (const k of ["a", "b", "c", "d"]) c.set(k, 1);
  assert.equal(c.size, 3);
  assert.equal(c.get("a"), undefined);
  assert.equal(c.get("d"), 1);
});

test("TtlCache: set ulang menjadikan entri itu yang terbaru", () => {
  const c = new TtlCache<number>(10_000, () => 0, 2);
  c.set("a", 1);
  c.set("b", 1);
  c.set("a", 2); // a sekarang paling baru
  c.set("c", 1); // b yang paling lama → dibuang
  assert.equal(c.get("b"), undefined);
  assert.equal(c.get("a"), 2);
});

test("NumberCache: simpan lalu muat kembali", () => {
  let t = 1_000_000;
  const a = new NumberCache(HOUR, () => t);
  a.set("6281234567890", "6281234567890@s.whatsapp.net");
  assert.equal(a.needsSave, true);
  const dump = a.dump();
  assert.equal(a.needsSave, false);

  const b = new NumberCache(HOUR, () => t);
  assert.equal(b.load(JSON.parse(JSON.stringify(dump))), 1);
  assert.equal(b.get("6281234567890"), "6281234567890@s.whatsapp.net");
});

test("NumberCache: entri kedaluwarsa tidak ikut disimpan maupun dimuat", () => {
  let t = 0;
  const a = new NumberCache(HOUR, () => t);
  a.set("6281234567890", "6281234567890@s.whatsapp.net");
  const dump = a.dump();
  t += HOUR + 1;
  assert.deepEqual(a.dump(), {});
  assert.equal(new NumberCache(HOUR, () => t).load(dump), 0);
});

test("NumberCache: file rusak / tidak masuk akal dilewati tanpa error", () => {
  const t = 1000;
  const c = new NumberCache(HOUR, () => t);
  assert.equal(c.load(null), 0);
  assert.equal(c.load("bukan objek"), 0);
  assert.equal(c.load([1, 2]), 0);
  assert.equal(
    c.load({
      "abc": { jid: "x@s.whatsapp.net", exp: t + 10 },                     // kunci bukan nomor
      "6281234567890": { jid: "grup@g.us", exp: t + 10 },                  // bukan JID pribadi
      "6281234567891": { jid: "6281234567891@s.whatsapp.net", exp: "besok" }, // exp bukan angka
      "6281234567892": { jid: "6281234567892@s.whatsapp.net", exp: t + HOUR * 1000 }, // lebih lama dari TTL
    }),
    0,
  );
  assert.equal(c.size, 0);
});

test("retry: berhasil setelah beberapa kali gagal", async () => {
  let n = 0;
  const jeda: number[] = [];
  const ok = await retry(
    async () => { if (++n < 3) throw new Error("gagal"); },
    { tries: 4, baseMs: 100, sleep: async (ms) => { jeda.push(ms); } },
  );
  assert.equal(ok, true);
  assert.equal(n, 3);
  assert.deepEqual(jeda, [100, 200]);
});

test("retry: menyerah setelah batas percobaan, tanpa melempar error", async () => {
  let n = 0;
  const ok = await retry(
    async () => { n++; throw new Error("selalu gagal"); },
    { tries: 3, sleep: async () => {} },
  );
  assert.equal(ok, false);
  assert.equal(n, 3);
});

test("SendLimiter: batas per jam menahan, lalu bebas setelah jam berlalu", () => {
  let t = 0;
  const l = new SendLimiter({ perHour: 2, perDay: 100, perUserPerHour: 10, perGroupPerHour: 10 }, () => t);
  l.record("a");
  l.record("b");
  const hit = l.check("user", "c");
  assert.equal(hit?.scope, "jam");
  t += HOUR + 1;
  assert.equal(l.check("user", "c"), null);
});

test("SendLimiter.nextFree: null saat belum penuh, lalu waktu pesan terlama keluar dari jendela", () => {
  let t = 1000;
  const l = new SendLimiter({ perHour: 2, perDay: 3, perUserPerHour: 10, perGroupPerHour: 10 }, () => t);
  assert.deepEqual(l.nextFree(), { hour: null, day: null });
  l.record("a"); // t=1000
  t += 10;
  l.record("b"); // t=1010 → jam penuh (2)
  assert.deepEqual(l.nextFree(), { hour: 1000 + HOUR, day: null });
  t += HOUR + 20; // pesan "a" & "b" sudah keluar dari jendela jam
  l.record("c");
  assert.equal(l.nextFree().hour, null);
  assert.equal(l.nextFree().day, 1000 + 24 * HOUR); // 3 pesan dalam 24 jam → harian penuh
});

test("CircuitBreaker: jeda setelah gagal beruntun, durasi berlipat bila gagal lagi", () => {
  let t = 0;
  const b = new CircuitBreaker({ threshold: 2, baseMs: 1000, maxMs: 10_000 }, () => t);
  assert.equal(b.failure(), false);
  assert.equal(b.failure(), true);
  assert.equal(b.isPaused(), true);
  t += 1001;
  assert.equal(b.isPaused(), false);
  assert.equal(b.failure(), true); // mode hati-hati: 1 gagal langsung jeda lagi
  t += 1500;
  assert.equal(b.isPaused(), true); // jeda kedua 2000 ms
});
