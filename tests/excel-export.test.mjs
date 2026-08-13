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
  assert.match(source, /text:\s*file\.name/);
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

test("Wiederholter Export kann denselben Zeitstempel und damit denselben Dateinamen verwenden", () => {
  assert.match(source, /options\s*=\s*\{\}/);
  assert.match(source, /options\?\.date/);
});


test("CSV nennt konkret die manuell korrigierten Felder", () => {
  assert.match(source, /"Manuell korrigiert": manualCorrectionLabel\(record\)/);
  assert.match(source, /corrections\.join\(", "\)/);
  assert.match(source, /record\?\.manual \? "Ja" : ""/);
  assert.doesNotMatch(source, /record\.manual \? "Ja" : "Nein"/);
});

test("Datensatz speichert manuelle Korrekturen getrennt nach Produkt und VDA", async () => {
  const mainSource = await readFile(new URL("../src/main.js", import.meta.url), "utf8");
  assert.match(mainSource, /manualCorrections\(slots\.product\.extraction, "Produkt"\)/);
  assert.match(mainSource, /manualCorrections\(slots\.vda\.extraction, "VDA"\)/);
  assert.match(mainSource, /field\?\.source === "manual"/);
});
