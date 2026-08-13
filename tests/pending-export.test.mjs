import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("Exportoberfläche bleibt kompakt mit zwei wechselnden Exportaktionen und separater Bereinigung", () => {
  assert.match(html, /id="newCsvButton"/);
  assert.match(html, /id="allCsvButton"/);
  assert.match(html, /id="clearSentButton"/);
  assert.match(html, /Neue Teile senden/);
  assert.match(html, /Gesamtes Protokoll senden/);
  assert.match(html, /Gesendete leeren/);
  assert.doesNotMatch(html, /Ungesendete löschen/);
});

test("Offener Export wird benutzerfreundlich ohne Stapel-Begriff dargestellt", () => {
  assert.doesNotMatch(main, /Offenen Stapel senden/);
  assert.doesNotMatch(main, /Offener Stapel:/);
  assert.match(main, /In OneDrive gespeichert/);
  assert.match(main, /CSV erneut senden/);
  assert.match(main, /warten auf Bestätigung/);
});

test("Exportzustand wird vor dem Android-Share-Sheet persistent gespeichert", () => {
  const saveIndex = main.indexOf("pendingExport = savePendingExport({");
  const shareIndex = main.indexOf("const result = await exportRecords(exportRows, navigator");
  assert.ok(saveIndex >= 0);
  assert.ok(shareIndex > saveIndex);
  assert.match(main, /VOR dem Öffnen des nativen Share-Sheets/);
});

test("Neue Teile und Gesamtexport speichern die konkreten Datensatz-IDs", () => {
  assert.match(main, /recordIds: exportRows\.map/);
  assert.match(main, /confirmRecordIds/);
  assert.match(main, /mode === "all"/);
  assert.match(main, /exportRows = mode === "all"/);
});

test("Bestätigung ist ein separater synchroner Button-Schritt", () => {
  assert.match(main, /async function confirmPendingExport\(\)/);
  assert.match(main, /Wurde die CSV erfolgreich in OneDrive gespeichert/);
  assert.match(main, /await markRecordsExported\(ids/);
  assert.match(main, /pendingExport = clearPendingExport\(\)/);
  assert.match(main, /records = await loadRecords\(\)/);
});

test("Nicht bestätigte Exporte können mit identischem Snapshot erneut gesendet werden", () => {
  assert.match(main, /async function resendPendingExport\(\)/);
  assert.match(main, /const exportRows = getPendingRows\(\)/);
  assert.match(main, /new Date\(pendingExport\.createdAt/);
});

test("Gesendete Teile können separat geleert werden, ungesendete nicht", () => {
  assert.match(main, /clearSentProtocolRows/);
  assert.match(main, /clearExportedRecords\(\)/);
  assert.match(main, /Neue bzw\. noch nicht bestätigte Teile bleiben vollständig erhalten/);
});
