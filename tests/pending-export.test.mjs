import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("Exportstapel wird eingefroren und nur nach expliziter Bestätigung archiviert", () => {
  assert.match(main, /ensurePendingExport/);
  assert.match(main, /getPendingExportRecords/);
  assert.match(main, /markRecordsExported\(pendingExport\.recordIds/);
  assert.match(main, /In OneDrive gespeichert/);
  assert.match(html, /confirmExportButton/);
  assert.match(html, /resetExportButton/);
});

test("Neue Scans werden nicht automatisch in einen ausstehenden Export hineingemischt", () => {
  assert.match(main, /new Set\(pendingExport\.recordIds/);
  assert.match(main, /records\.filter\(\(record\) => ids\.has\(record\.id\)\)/);
});
