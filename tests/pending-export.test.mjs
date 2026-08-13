import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("Exportoberfläche trennt neue Einträge und gesamtes Protokoll", () => {
  assert.match(html, /id="newCsvButton"/);
  assert.match(html, /id="allCsvButton"/);
  assert.match(html, /Neue Einträge senden/);
  assert.match(html, /Gesamtes Protokoll senden/);
  assert.doesNotMatch(html, /CSV erneut senden/);
});

test("Neue Einträge sind ausschließlich noch nicht bestätigte Datensätze", () => {
  assert.match(main, /records\.filter\(\(record\) => !record\.exportedAt\)/);
  assert.match(main, /mode === "all"/);
  assert.match(main, /markRecordsExported\(unsentIds/);
});

test("Bestätigte Einträge bleiben lokal und werden als gesendet dargestellt", () => {
  assert.match(main, /record\.exportedAt \? "✓ gesendet" : "neu"/);
  assert.match(main, /log-row-sent/);
});

test("OneDrive-Bestätigung markiert nur im Export enthaltene neue Datensätze", () => {
  assert.match(main, /Wurde die CSV in OneDrive gespeichert/);
  assert.match(main, /unsentIds/);
});
