import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("Exportoberfläche hat zwei Exportaktionen und separate Bereinigung gesendeter Teile", () => {
  assert.match(html, /id="newCsvButton"/);
  assert.match(html, /id="allCsvButton"/);
  assert.match(html, /id="clearSentButton"/);
  assert.match(html, /Neue Teile senden/);
  assert.match(html, /Gesamtes Protokoll senden/);
  assert.match(html, /Gesendete leeren/);
  assert.doesNotMatch(html, /Ungesendete löschen/);
  assert.doesNotMatch(html, /CSV erneut senden/);
});

test("Neue Teile werden als eingefrorener Exportstapel gespeichert", () => {
  assert.match(main, /loadPendingExport\(\)/);
  assert.match(main, /savePendingExport\(/);
  assert.match(main, /recordIds:\s*stackRows\.map/);
  assert.match(main, /getPendingRows\(\)/);
  assert.match(main, /Später gescannte Teile warten auf den nächsten Stapel/);
  assert.match(main, /Offenen Stapel senden/);
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


test("Nach Upload-Bestätigung wird der persistente Stand neu geladen", () => {
  assert.match(main, /await markRecordsExported\(unsentIds/);
  assert.match(main, /records = await loadRecords\(\)/);
  assert.match(main, /keine neuen Teile offen/);
});

test("Gesendete Teile können separat geleert werden, ungesendete nicht", () => {
  assert.match(main, /clearSentProtocolRows/);
  assert.match(main, /clearExportedRecords\(\)/);
  assert.match(main, /Neue bzw\. noch nicht bestätigte Teile bleiben vollständig erhalten/);
});
