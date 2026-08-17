import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const editorSource = await readFile(new URL("../src/editor.js", import.meta.url), "utf8");
const engineSource = await readFile(new URL("../src/ocr-engine.js", import.meta.url), "utf8");

test("Profileditor verwendet einen eigenen stabilen WASM-Modus ohne Scanner-Policy zu verändern", () => {
  assert.match(editorSource, /detectRuntimePolicy\(\{ compatibilityMode: true \}\)/);
  assert.match(editorSource, /new PaddleOcrEngine\(\{ policyProvider: \(\) => editorRuntimePolicy \}\)/);
  assert.match(engineSource, /constructor\(\{ policyProvider = getRuntimePolicy \} = \{\}\)/);
  assert.match(engineSource, /createCommonOptions\(model, policy\)/);
});

test("Editor begrenzt nur das OCR-Arbeitsbild und lässt das Masterbild unverändert", () => {
  assert.match(editorSource, /EDITOR_OCR_MAX_SIDE = 1000/);
  assert.match(editorSource, /createOcrInputCanvas\(session\.prepared\.canvas, EDITOR_OCR_MAX_SIDE\)/);
  assert.match(editorSource, /textDetMaxSideLimit: EDITOR_OCR_MAX_SIDE/);
  assert.match(editorSource, /targetSession\.prepared\.width/);
  assert.match(editorSource, /targetSession\.prepared\.height/);
});

test("Editor merkt sich das zuletzt ausgewählte Profil für Masterbild-Wiederherstellung", () => {
  assert.match(editorSource, /EDITOR_SELECTED_PROFILE_KEY/);
  assert.match(editorSource, /storeSelectedProfileId\(id\)/);
  assert.match(editorSource, /storedSelectedProfileId\(\)/);
  assert.match(editorSource, /restorePersistedMaster\(id\)/);
});

test("Editor gibt dem Browser vor der OCR Zeit zum Rendern", () => {
  assert.match(editorSource, /await nextEditorPaint\(\)/);
  assert.match(editorSource, /requestAnimationFrame\(\(\) => requestAnimationFrame\(resolve\)\)/);
});
