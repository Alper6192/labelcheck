import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("Exportoberfläche hat nur neue Teile und gesamtes Protokoll", () => {
  assert.match(html, /id="newCsvButton"/);
  assert.match(html, /id="allCsvButton"/);
  assert.match(html, /Neue Teile senden/);
  assert.match(html, /Gesamtes Protokoll senden/);
  assert.doesNotMatch(html, /clearButton/);
  assert.doesNotMatch(html, /Ungesendete löschen/);
  assert.doesNotMatch(html, /CSV erneut senden/);
});

test("Neue Teile werden als eingefrorener Exportstapel gespeichert", () => {
  assert.match(main, /loadPendingExport\(\)/);
  assert.match(main, /savePendingExport\(/);
  assert.match(main, /recordIds:\s*stackRows\.map/);
  assert.match(main, /getPendingRows\(\)/);
  assert.match(main, /Später gescannte Teile warten auf den nächsten Stapel/);
});

test("Gesamtes Protokoll bleibt als eigener Export möglich", () => {
  assert.match(main, /mode === "all"/);
  assert.match(main, /exportRows = \[\.\.\.records\]/);
});

test("Bestätigte Einträge bleiben lokal und werden als gesendet dargestellt", () => {
  assert.match(main, /record\.exportedAt \? "✓ gesendet" : "neu"/);
  assert.match(main, /log-row-sent/);
});

test("OneDrive-Bestätigung markiert nur im Export enthaltene neue Datensätze", () => {
  assert.match(main, /Wurde die CSV in OneDrive gespeichert/);
  assert.match(main, /unsentIds/);
  assert.match(main, /markRecordsExported\(unsentIds/);
});
