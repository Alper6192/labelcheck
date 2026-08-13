import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("Exportstapel wird eingefroren und nur nach Bestätigung archiviert", () => {
  assert.match(main, /ensurePendingExport/);
  assert.match(main, /getPendingExportRecords/);
  assert.match(main, /markRecordsExported\(pendingExport\.recordIds/);
  assert.match(main, /wirklich in OneDrive gespeichert/);
});

test("Export-Oberfläche besitzt nur einen Exportbutton", () => {
  assert.match(html, /id="excelButton"/);
  assert.doesNotMatch(html, /excelDownloadButton/);
  assert.doesNotMatch(html, /confirmExportButton/);
  assert.doesNotMatch(html, /resetExportButton/);
  assert.doesNotMatch(html, /pendingExportPanel/);
});

test("Neue Scans werden nicht automatisch in einen ausstehenden Export hineingemischt", () => {
  assert.match(main, /new Set\(pendingExport\.recordIds/);
  assert.match(main, /records\.filter\(\(record\) => ids\.has\(record\.id\)\)/);
});

test("Nach erfolgreicher Übergabe fragt die App direkt nach OneDrive-Bestätigung", () => {
  assert.match(main, /result\?\.method === "share-csv"/);
  assert.match(main, /await confirmProtocolExport\(\)/);
});
