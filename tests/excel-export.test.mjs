import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/excel-export.js", import.meta.url), "utf8");

test("Excel enthält Produkt- und Lieferscheinwerte in derselben Zeile", () => {
  for (const header of ["Batch Produkt", "Batch Lieferschein", "IDH Produkt", "IDH Lieferschein", "Gewicht Produkt", "Gewicht Lieferschein", "Lieferscheinnummer", "Zeit", "Ergebnis"]) {
    assert.match(source, new RegExp(header.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")));
  }
});

test("Excel-Dateiname enthält Datum und Uhrzeit bis zur Sekunde", () => {
  assert.match(source, /Labelcheck_\$\{date\.getFullYear\(\)\}/);
  assert.match(source, /getSeconds\(\)/);
});
