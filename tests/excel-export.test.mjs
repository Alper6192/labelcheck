import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/excel-export.js", import.meta.url), "utf8");
const mainSource = await readFile(new URL("../src/main.js", import.meta.url), "utf8");
const htmlSource = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("CSV enthält Produkt- und Lieferscheinwerte in derselben Zeile", () => {
  for (const header of ["Batch Produkt", "Batch Lieferschein", "IDH Produkt", "IDH Lieferschein", "Gewicht Produkt", "Gewicht Lieferschein", "Lieferscheinnummer", "Zeit", "Ergebnis"]) {
    assert.match(source, new RegExp(header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("Export-Dateiname ist ausschließlich CSV und enthält Datum/Uhrzeit", () => {
  assert.match(source, /Labelcheck_\$\{timestampPart\(date\)\}\.csv/);
  assert.match(source, /getSeconds\(\)/);
  assert.doesNotMatch(source, /\.xlsx/);
  assert.doesNotMatch(source, /XLSX_MIME/);
});

test("CSV ist UTF-8-BOM, Semikolon und Web-Share-kompatibel", () => {
  assert.match(source, /CSV_MIME = "text\/csv"/);
  assert.match(source, /sheet_to_csv/);
  assert.match(source, /FS: ";"/);
  assert.match(source, /"\\uFEFF"/);
});

test("Share-Pfad versucht CSV direkt über navigator.share", () => {
  assert.match(source, /navigatorLike\.share\(\{ files: \[file\] \}\)/);
  assert.match(source, /error\?\.name === "AbortError"/);
  assert.doesNotMatch(source, /canShareFileWithCanShare/);
  assert.doesNotMatch(source, /share-xlsx/);
});

test("Fallback und manueller Download sind ebenfalls CSV", () => {
  assert.match(source, /downloadFile\(file\)/);
  assert.match(source, /method: "download-csv"/);
  assert.match(mainSource, /downloadCsvRecords/);
  assert.doesNotMatch(mainSource, /downloadExcelRecords/);
});

test("UI nennt nur noch CSV", () => {
  assert.match(htmlSource, /CSV teilen \/ Senden an/);
  assert.match(htmlSource, /CSV herunterladen/);
  assert.doesNotMatch(htmlSource, /Excel \(\.xlsx\) herunterladen/);
});
