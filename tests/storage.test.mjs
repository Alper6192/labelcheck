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
  assert.match(source, /allRecords\.slice\(MAX_RECORDS\)/);
});

test("Exportierte Datensätze werden markiert und bleiben im lokalen Verlauf", () => {
  assert.match(source, /markRecordsExported/);
  assert.match(source, /exportedAt/);
  assert.match(source, /readAllRecords\(db, true, false\)/);
});

test("Ungesendete Datensätze besitzen keine separate Löschfunktion", () => {
  assert.doesNotMatch(source, /clearUnsentRecords/);
});

test("Offener Exportstapel wird persistent gespeichert", () => {
  assert.match(source, /loadPendingExport/);
  assert.match(source, /savePendingExport/);
  assert.match(source, /clearPendingExport/);
});
