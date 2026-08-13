import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const render = fs.readFileSync(new URL("../src/render.js", import.meta.url), "utf8");

test("Analysebereich ist automatisch und ohne Analyse-starten-Button", () => {
  assert.match(html, /Hier erscheint das Ergebnis des Labelchecks\./);
  assert.doesNotMatch(html, /Analyse starten/);
  assert.doesNotMatch(html, /analyzeAllButton/);
});

test("Felder zeigen Erkennungsquote statt OCR-Prozent", () => {
  assert.match(render, /Erkennungsquote:/);
  assert.doesNotMatch(render, /`OCR \$/);
});
