import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const editorSource = await readFile(new URL("../src/editor.js", import.meta.url), "utf8");
const scannerSource = await readFile(new URL("../src/main.js", import.meta.url), "utf8");
const engineSource = await readFile(new URL("../src/ocr-engine.js", import.meta.url), "utf8");
const editorHtml = await readFile(new URL("../editor.html", import.meta.url), "utf8");

test("Scanner und Profileditor verwenden dieselbe OCR-Engine", () => {
  assert.match(scannerSource, /PaddleOcrEngine/);
  assert.match(editorSource, /PaddleOcrEngine/);
  assert.match(scannerSource, /from "\.\/ocr-engine\.js"/);
  assert.match(editorSource, /from "\.\/ocr-engine\.js"/);
});

test("Gemeinsame Engine nutzt automatisches Backend und automatische Threadzahl", () => {
  assert.match(engineSource, /worker:\s*true/);
  assert.match(engineSource, /backend:\s*"auto"/);
  assert.match(engineSource, /numThreads:\s*0/);
  assert.match(engineSource, /textRecognitionBatchSize:\s*8/);
  assert.doesNotMatch(engineSource, /worker:\s*false/);
});

test("Keine künstliche predict-Zeitüberschreitung startet konkurrierende Instanzen", () => {
  assert.doesNotMatch(engineSource, /DEFAULT_PREDICT_TIMEOUT_MS|createTimeoutError/);
  assert.match(engineSource, /await ocr\.predict\(image, params\)/);
});

test("Profileditor zeigt Laufzeit und echte Providerdaten an", () => {
  assert.match(editorSource, /startElapsedDisplay/);
  assert.match(editorSource, /formatRuntimeDetails/);
  assert.match(editorSource, /metrics\.detMs/);
  assert.match(editorSource, /metrics\.recMs/);
});

test("Profileditor unterstützt OCR-JSON und kombinierte Batch-Fass-Zuordnung", () => {
  assert.match(editorHtml, /OCR-JSON importieren/);
  assert.match(editorHtml, /assignBatchDrumButton/);
  assert.match(editorSource, /function importOcrJson/);
  assert.match(editorSource, /function assignBatchAndDrum/);
});
