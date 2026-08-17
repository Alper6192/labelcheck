import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const editorSource = await readFile(new URL("../src/editor.js", import.meta.url), "utf8");
const scannerSource = await readFile(new URL("../src/main.js", import.meta.url), "utf8");
const engineSource = await readFile(new URL("../src/ocr-engine.js", import.meta.url), "utf8");
const editorHtml = await readFile(new URL("../editor.html", import.meta.url), "utf8");
const policySource = await readFile(new URL("../src/runtime-policy.js", import.meta.url), "utf8");

test("Scanner und Profileditor verwenden dieselbe OCR-Engine", () => {
  assert.match(scannerSource, /PaddleOcrEngine/);
  assert.match(editorSource, /PaddleOcrEngine/);
  assert.match(scannerSource, /from "\.\/ocr-engine\.js"/);
  assert.match(editorSource, /from "\.\/ocr-engine\.js"/);
});

test("Gemeinsame Engine nutzt dynamische Runtime-Policy und weiterhin genau einen Worker", () => {
  assert.match(engineSource, /worker:\s*true/);
  assert.match(engineSource, /backend:\s*policy\.backend/);
  assert.match(engineSource, /numThreads:\s*policy\.numThreads/);
  assert.match(engineSource, /textRecognitionBatchSize:\s*policy\.textRecognitionBatchSize/);
  assert.match(policySource, /backend:\s*"auto"/);
  assert.match(policySource, /backend:\s*"wasm"/);
  assert.match(policySource, /ocr-crash-recovery/);
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


test("OCR-Modelle werden same-origin von GitHub Pages geladen", () => {
  assert.match(engineSource, /new URL\("\.\/models\/", window\.location\.href\)/);
  assert.match(engineSource, /textDetectionModelAsset/);
  assert.match(engineSource, /textRecognitionModelAsset/);
  assert.doesNotMatch(engineSource, /paddle-model-ecology\.bj\.bcebos\.com/);
});

test("Profileditor bewahrt Netto- und VW-Kombizeilen-Normalizer", () => {
  assert.match(editorHtml, /option value="net_weight"/);
  assert.match(editorHtml, /option value="leading_delivery_digits"/);
});

test("Erweiterter Editor kann alle profilabhängigen Erkennungsparameter konfigurieren", () => {
  for (const id of [
    "profileSourceType", "anchorLocalizeAlias", "anchorScaleFrom", "anchorAlignFrom",
    "detectionEvidenceAliases", "detectionMinEvidenceMatches", "detectionExcludeAliases", "detectionMinScore",
    "validationMinAnchorScore", "fieldStrategy", "fieldSearchRadius", "fieldMinOverlap",
    "fieldStrategyUnits", "fieldFallbackStrategy", "fieldPairLeftMinDigits", "fieldPairLeftMaxDigits",
    "fieldTailDigits", "fieldCombinedMinDigits", "fieldLocatorAliases", "fieldLocatorDirection",
    "fieldLocatorMaxDistance", "fieldLocatorMinAliasScore"
  ]) {
    assert.match(editorHtml, new RegExp(`id=["']${id}["']`), `${id} fehlt im Editor`);
  }
  assert.match(editorHtml, /unit_required_weight/);
  assert.match(editorHtml, /net_pair_weight/);
  assert.match(editorHtml, /numeric_pair/);
  assert.match(editorHtml, /quantity_weight/);
});

test("QR-Profile werden vollständig im Editor konfiguriert und am Masterbild getestet", () => {
  assert.match(editorHtml, /id="qrProfileSettings"/);
  assert.match(editorHtml, /id="qrRegionInputs"/);
  assert.match(editorHtml, /id="qrRules"/);
  assert.match(editorHtml, /id="testQrButton"/);
  assert.match(editorSource, /function updateQrRulesFromDom/);
  assert.match(editorSource, /function updateQrRegionsFromDom/);
  assert.match(editorSource, /detectQrProfile\(session\.prepared\.canvas, \[profile\], profile\.role\)/);
  assert.match(editorSource, /schemaVersion:\s*PROFILE_SCHEMA_VERSION/);
});

test("Labelvalidierung bleibt auch bei QR-Profilen im gemeinsamen Editorbereich sichtbar", () => {
  assert.match(editorHtml, /id="profileValidationSettings"/);
  assert.match(editorHtml, /data-required-valid-field="batch"/);
  assert.match(editorHtml, /id="validationErrorMessage"/);
});
