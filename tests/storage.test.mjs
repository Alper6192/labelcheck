import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/storage.js", import.meta.url), "utf8");

test("Scanprotokoll verwendet IndexedDB und migriert den bisherigen localStorage-Key", () => {
  assert.match(source, /indexedDB\.open/);
  assert.match(source, /scan-records/);
  assert.match(source, /labelcheck-paddle-records-v1/);
  assert.match(source, /migrateLegacyRecords/);
});

test("Scanprotokoll bleibt auf 500 Datensätze begrenzt", () => {
  assert.match(source, /MAX_RECORDS\s*=\s*500/);
  assert.match(source, /records\.slice\(MAX_RECORDS\)/);
});
