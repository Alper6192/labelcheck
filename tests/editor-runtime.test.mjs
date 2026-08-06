import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const editorSource = await readFile(new URL("../src/editor.js", import.meta.url), "utf8");
const engineSource = await readFile(new URL("../src/editor-ocr-engine.js", import.meta.url), "utf8");
const editorHtml = await readFile(new URL("../editor.html", import.meta.url), "utf8");

test("Profileditor verwendet genau einen Web-Worker ohne Timeout-Fallback", () => {
  assert.match(editorSource, /EditorPaddleOcrEngine/);
  assert.match(engineSource, /worker:\s*true/);
  assert.doesNotMatch(engineSource, /worker:\s*false/);
  assert.doesNotMatch(engineSource, /Promise\.race|setTimeout/);
});

test("Profileditor übergibt wie der Scanner das Canvas direkt", () => {
  assert.doesNotMatch(engineSource, /canvas\.toBlob/);
  assert.match(engineSource, /this\.#ocr\.predict\(canvas, params\)/);
  assert.match(engineSource, /textRecognitionBatchSize:\s*2/);
});

test("Profileditor zeigt die laufende Worker-Zeit an", () => {
  assert.match(editorSource, /startElapsedDisplay/);
  assert.match(editorSource, /Web Worker läuft seit/);
});


test("Profileditor unterstützt schnelle OCR-JSON-Übernahme und kombinierte Batch/Fass-Zuordnung", () => {
  assert.match(editorHtml, /OCR-JSON importieren/);
  assert.match(editorHtml, /assignBatchDrumButton/);
  assert.match(editorSource, /function importOcrJson/);
  assert.match(editorSource, /function assignBatchAndDrum/);
  assert.match(editorSource, /createOcrInputCanvas\(session\.prepared\.canvas, 1200\)/);
});
