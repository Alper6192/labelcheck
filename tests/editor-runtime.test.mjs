import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const editorSource = await readFile(new URL("../src/editor.js", import.meta.url), "utf8");
const engineSource = await readFile(new URL("../src/editor-ocr-engine.js", import.meta.url), "utf8");

test("Profileditor verwendet keinen Worker-Fallback mehr", () => {
  assert.match(editorSource, /EditorPaddleOcrEngine/);
  assert.doesNotMatch(editorSource, /initializeVerified|predictMasterImageWithFallback|abortCurrent/);
  assert.match(engineSource, /worker:\s*false/);
  assert.doesNotMatch(engineSource, /Promise\.race|setTimeout/);
});

test("Profileditor übergibt das vorbereitete Bild als Blob", () => {
  assert.match(engineSource, /canvas\.toBlob/);
  assert.match(engineSource, /this\.#ocr\.predict\(blob, params\)/);
});
