import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("Scanprotokoll verwendet die gewünschte Spaltenreihenfolge", () => {
  const headers = [
    "Zeit", "Ergebnis", "Manuell korrigiert", "Lieferscheinnummer / TA-Nummer",
    "Fassnummer", "Batch Produkt", "Batch VDA / TA", "IDH Produkt",
    "IDH VDA / TA", "Gewicht Produkt", "Gewicht VDA / TA", "Labelprofil - VDA / TA"
  ];
  let previous = -1;
  for (const header of headers) {
    const index = html.indexOf(`<th>${header}</th>`);
    assert.ok(index > previous, `${header} fehlt oder ist falsch einsortiert.`);
    previous = index;
  }
  assert.doesNotMatch(html, /<th>Export<\/th>/);
});

test("Exportblock zeigt Zähler und Bereinigung unter den beiden Sendeaktionen", () => {
  const newIndex = html.indexOf('id="newCsvButton"');
  const allIndex = html.indexOf('id="allCsvButton"');
  const countIndex = html.indexOf('id="logCount"');
  const clearIndex = html.indexOf('id="clearSentButton"');
  assert.ok(newIndex < allIndex && allIndex < countIndex && countIndex < clearIndex);
  assert.match(styles, /grid-template-columns:\s*minmax\(260px, 380px\)/);
  assert.match(styles, /\.log-actions > button[^{]*\{[^}]*width:\s*100%/s);
});

test("Redundanter Hinweis auf noch nicht gesendete neue Teile ist entfernt", () => {
  assert.doesNotMatch(main, /neue Teile sind noch nicht gesendet/);
});

test("Nach erfolgreichem Speichern werden beide Foto-Slots zurückgesetzt", () => {
  assert.match(main, /function resetScanCycleAfterSave\(\)/);
  assert.match(main, /releasePreparedImage\(slot\.prepared\)/);
  assert.match(main, /Object\.assign\(slot, createSlot\(key\)\)/);
  assert.match(main, /records = await saveRecord\(record\);\s*resetScanCycleAfterSave\(\);/s);
});
