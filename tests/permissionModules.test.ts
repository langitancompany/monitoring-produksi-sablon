// Jalankan: npx tsx tests/permissionModules.test.ts
import assert from "node:assert/strict";
import { DEFAULT_PERMISSIONS, type UserPermissions } from "../types";
import {
  MODULE_DEFS,
  getField,
  grantModules,
  grantedModules,
  moduleHasAccess,
  normalizePermissions,
  permissionsEqual,
  revokeModule,
  setField,
  summarizeAccess,
} from "../lib/permissionModules";
import { resolveFinanceCaps } from "../lib/finance/caps";
import { sanitizePermissions } from "../lib/userAdmin";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const NONE = { create: false, edit: false, delete: false, maker: false, approver: false };
const ALL3 = { ...NONE, create: true, edit: true, delete: true };
const empty = (): UserPermissions => {
  let p = DEFAULT_PERMISSIONS;
  for (const d of MODULE_DEFS) p = revokeModule(p, d.key);
  return p;
};

console.log("Daftar modul");
test("MODULE_DEFS mencakup semua modul di UserPermissions (tidak ada yang terlewat)", () => {
  const defKeys = MODULE_DEFS.map((d) => d.key).sort();
  assert.deepEqual(defKeys, Object.keys(DEFAULT_PERMISSIONS).sort());
});

console.log("Grant / revoke");
test("grantModules: view menyala + izin awal sesuai kolom modul", () => {
  const p = grantModules(empty(), ["orders", "trash", "config_harga"], ALL3);
  assert.equal(getField(p, "orders", "create") && getField(p, "orders", "edit") && getField(p, "orders", "delete"), true);
  assert.equal(getField(p, "trash", "delete"), true);
  assert.equal(getField(p, "trash", "edit"), false);
  assert.equal(getField(p, "config_harga", "create"), false);
  assert.equal(getField(p, "config_harga", "edit"), true);
});
test("Keuangan: Buat/Ubah awal TIDAK menyalakan maker/approver; keduanya dipilih terpisah", () => {
  const a = grantModules(empty(), ["keuangan"], ALL3);
  assert.deepEqual([getField(a, "keuangan", "maker"), getField(a, "keuangan", "approver"), getField(a, "keuangan", "delete")], [false, false, true]);
  const b = grantModules(empty(), ["keuangan"], { ...NONE, maker: true });
  assert.deepEqual([getField(b, "keuangan", "maker"), getField(b, "keuangan", "approver")], [true, false]);
  const c = grantModules(empty(), ["keuangan"], { ...NONE, approver: true });
  assert.deepEqual([getField(c, "keuangan", "maker"), getField(c, "keuangan", "approver")], [false, true]);
});
test("menyalakan Maker otomatis menyalakan Lihat; mematikannya tidak menghilangkan baris", () => {
  let p = setField(empty(), "keuangan", "maker", true);
  assert.equal(getField(p, "keuangan", "view"), true);
  p = setField(p, "keuangan", "maker", false);
  assert.equal(grantedModules(p).some((d) => d.key === "keuangan"), true);
});
test("revokeModule menyetel semua izin false, bentuk objek tetap", () => {
  const p = revokeModule(grantModules(empty(), ["keuangan"], { ...ALL3, maker: true, approver: true }), "keuangan");
  assert.equal(moduleHasAccess(p, "keuangan"), false);
  assert.deepEqual(Object.keys(p.keuangan).sort(), Object.keys(DEFAULT_PERMISSIONS.keuangan).sort());
});
test("ringkasan: Keuangan · Maker / Approver", () => {
  const p = grantModules(empty(), ["keuangan"], { ...NONE, maker: true, approver: true });
  assert.deepEqual(summarizeAccess(p).map((c) => c.label), ["Keuangan", "Keuangan · Maker", "Keuangan · Approver"]);
});

console.log("Data lama (Sablon)");
test("normalizePermissions: modul yang belum ada di data user lama = semua false (tidak jadi terbuka)", () => {
  const p = normalizePermissions({ orders: { view: true, create: true } });
  assert.equal(getField(p, "kalkulator", "view"), false);
  assert.equal(getField(p, "dashboard", "view"), false);
  assert.equal(getField(p, "po_management", "view"), false);
});
test("normalizePermissions: merchandise diwarisi dari orders bila belum ada", () => {
  const p = normalizePermissions({ orders: { view: true, create: true, edit: false, delete: true } });
  assert.deepEqual(
    [getField(p, "merchandise", "view"), getField(p, "merchandise", "create"), getField(p, "merchandise", "edit"), getField(p, "merchandise", "delete")],
    [true, true, false, true],
  );
  const q = normalizePermissions({ orders: { view: true }, merchandise: { view: false } });
  assert.equal(getField(q, "merchandise", "view"), false);
});
test("Keuangan lama: create → maker, edit → approver, kunci lama dibuang", () => {
  const p = normalizePermissions({ keuangan: { view: true, create: true, edit: false, delete: true } });
  assert.deepEqual(p.keuangan, { view: true, maker: true, approver: false, delete: true });
  const q = normalizePermissions({ keuangan: { view: true, create: false, edit: true } });
  assert.deepEqual([getField(q, "keuangan", "maker"), getField(q, "keuangan", "approver")], [false, true]);
});
test("maker/approver yang sudah tertulis menang atas create/edit lama", () => {
  const p = normalizePermissions({ keuangan: { view: true, maker: false, approver: true, create: true, edit: false } });
  assert.deepEqual([getField(p, "keuangan", "maker"), getField(p, "keuangan", "approver")], [false, true]);
});
test("sanitizePermissions (server) membaca data lama sama seperti normalizePermissions (UI)", () => {
  const raw = { keuangan: { view: true, create: true, edit: false, delete: true } };
  const s = sanitizePermissions(raw).keuangan as unknown as Record<string, boolean>;
  assert.deepEqual([s.maker, s.approver, s.delete], [true, false, true]);
  const t = sanitizePermissions({ keuangan: { view: true, maker: false, approver: true, create: true } }).keuangan as unknown as Record<string, boolean>;
  assert.deepEqual([t.maker, t.approver], [false, true]);
  assert.equal("create" in t, false);
});
test("permissionsEqual: izin yang tidak ada dianggap false", () => {
  assert.equal(permissionsEqual({ a: { x: true } }, { a: { x: true, y: false } }), true);
  assert.equal(permissionsEqual({ a: { x: true } }, { a: { x: false } }), false);
});

console.log("Hak keuangan (caps)");
test("Lihat saja tidak memberi Maker/Approver; keduanya terpisah", () => {
  const v = resolveFinanceCaps({ role: "admin" }, { view: true });
  assert.deepEqual([v.view, v.maker, v.approver, v.delete], [true, false, false, false]);
  const m = resolveFinanceCaps({ role: "admin" }, { maker: true });
  assert.deepEqual([m.view, m.maker, m.approver], [true, true, false]);
  const a = resolveFinanceCaps({ role: "admin" }, { approver: true });
  assert.deepEqual([a.view, a.maker, a.approver], [true, false, true]);
});
test("Super Admin selalu punya semua hak, walau toggle mati", () => {
  const c = resolveFinanceCaps({ role: "super_admin" }, { view: false, maker: false, approver: false });
  assert.deepEqual([c.maker, c.approver, c.delete, c.isSuperAdmin], [true, true, true, true]);
  const d = resolveFinanceCaps({ role: "admin", roles: ["admin", "super_admin"] }, {});
  assert.equal(d.approver, true);
});
test("user lama tanpa maker/approver memakai create/edit; kunci baru yang false menang", () => {
  const c = resolveFinanceCaps({ role: "admin" }, { view: true, create: true, edit: false });
  assert.deepEqual([c.maker, c.approver], [true, false]);
  const d = resolveFinanceCaps({ role: "admin" }, { view: true, maker: false, approver: false, create: true, edit: true });
  assert.deepEqual([d.maker, d.approver], [false, false]);
});
test("nilai bukan boolean true tidak dianggap hak", () => {
  const c = resolveFinanceCaps({ role: "admin" }, { maker: "true" as unknown as boolean, approver: 1 as unknown as boolean });
  assert.deepEqual([c.maker, c.approver], [false, false]);
});

console.log(`\n${passed} test lulus`);
