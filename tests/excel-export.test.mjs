import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/excel-export.js", import.meta.url), "utf8");

test("CSV enthält die gewünschten Protokollspalten", () => {
  for (const header of ["Batch Produkt", "Batch Lieferschein", "IDH Produkt", "IDH Lieferschein", "Gewicht Produkt", "Gewicht Lieferschein", "Lieferscheinnummer", "Zeit", "Ergebnis", "Lieferscheinprofil"]) {
    assert.equal(source.includes(header), true, `${header} fehlt im CSV-Export.`);
  }
});

test("CSV enthält weder Nr. noch Produktprofil", () => {
  assert.doesNotMatch(source, /Nr:\s*index/);
  assert.doesNotMatch(source, /Produktprofil:\s*safe/);
});

test("CSV-Dateiname ist exakt Labelcheck_YYYY-MM-DD_HH-MM-SS.csv", () => {
  assert.match(source, /Labelcheck_\$\{date\.getFullYear\(\)\}/);
  assert.match(source, /getSeconds\(\)/);
  assert.match(source, /\.csv`/);
  assert.match(source, /title:\s*file\.name/);
});

test("Export verwendet nur CSV und keine XLSX-Datei", () => {
  assert.doesNotMatch(source, /writeFile\(/);
  assert.doesNotMatch(source, /\.xlsx/);
  assert.match(source, /text\/csv/);
});


test("App erzeugt keinen share-Zufallsnamen", () => {
  assert.doesNotMatch(source, /`share\$\{/);
  assert.match(source, /return `Labelcheck_/);
});
