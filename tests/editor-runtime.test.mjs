import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const editorSource = await readFile(new URL("../src/editor.js", import.meta.url), "utf8");
const scannerSource = await readFile(new URL("../src/main.js", import.meta.url), "utf8");
const engineSource = await readFile(new URL("../src/ocr-engine.js", import.meta.url), "utf8");
const editorHtml = await readFile(new URL("../editor.html", import.meta.url), "utf8");
const policySource = await readFile(new URL("../src/runtime-policy.js", import.meta.url), "utf8");
const editorI18n = await readFile(new URL("../src/editor-i18n.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

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

test("Profileditor blendet technische Alt-Funktionen aus und verwendet festen 10-Prozent-Zonenrand", () => {
  assert.doesNotMatch(editorHtml, /Repository-Konfiguration neu laden/);
  assert.doesNotMatch(editorHtml, /OCR-JSON importieren/);
  assert.doesNotMatch(editorHtml, /Modell neu laden/);
  assert.doesNotMatch(editorHtml, /assignBatchDrumButton/);
  assert.doesNotMatch(editorHtml, /paddingInput/);
  assert.match(editorSource, /FIELD_ZONE_PADDING = 0\.10/);
});


test("OCR-Modelle werden same-origin von GitHub Pages geladen", () => {
  assert.match(engineSource, /new URL\("\.\/models\/", window\.location\.href\)/);
  assert.match(engineSource, /textDetectionModelAsset/);
  assert.match(engineSource, /textRecognitionModelAsset/);
  assert.doesNotMatch(engineSource, /paddle-model-ecology\.bj\.bcebos\.com/);
});

test("Profileditor bewahrt Netto- und VW-Kombizeilen-Normalizer", () => {
  assert.match(editorSource, /"net_weight"/);
  assert.match(editorSource, /"leading_delivery_digits"/);
});

test("Erweiterter Editor kann alle profilabhängigen Erkennungsparameter konfigurieren", () => {
  for (const id of [
    "profileSourceType", "anchorLocalizeAlias", "anchorScaleFrom", "anchorAlignFrom",
    "detectionEvidenceAliases", "detectionMinEvidenceMatches", "detectionExcludeAliases", "detectionMinScore",
    "validationMinAnchorScore", "fieldStrategy", "fieldSearchRadius", "fieldMinOverlap",
    "fieldStrategyUnits", "fieldFallbackStrategy", "fieldPairLeftMinDigits", "fieldPairLeftMaxDigits",
    "fieldTailDigits", "fieldCombinedMinDigits", "fieldLocatorAliases", "fieldLocatorDirection",
    "fieldLocatorMaxDistance", "fieldLocatorMinAliasScore", "fieldNeighborEnabled", "fieldNeighborTarget",
    "fieldNeighborLeft", "fieldNeighborRight", "fieldNeighborAbove", "fieldNeighborBelow"
  ]) {
    assert.match(editorHtml, new RegExp(`id=["']${id}["']`), `${id} fehlt im Editor`);
  }
  assert.match(editorSource, /unit_required_weight/);
  assert.match(editorSource, /net_pair_weight/);
  assert.match(editorSource, /numeric_pair/);
  assert.match(editorSource, /quantity_weight/);
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


test("Editor besitzt DE/EN-Schalter, Hilfetexte und feldspezifische Auswahlmenüs", () => {
  assert.match(editorHtml, /id="languageToggle"/);
  assert.match(editorHtml, /data-help-key=/);
  assert.match(editorSource, /FIELD_NORMALIZER_OPTIONS/);
  assert.match(editorSource, /FIELD_STRATEGY_OPTIONS/);
  assert.match(editorSource, /populateFieldNormalizerOptions/);
  assert.match(editorSource, /populateFieldStrategyOptions/);
  assert.match(editorSource, /renderRegexStatus/);
});

test("Ausgewählte Bearbeitungsart und Feldzuordnung werden visuell markiert", () => {
  assert.match(editorHtml, /data-assignment-button="anchor"/);
  assert.match(editorSource, /renderAssignmentToolbar/);
  assert.match(editorSource, /active-assignment/);
});


test("Editor zeigt keine technischen Engine-Begriffe und kein editierbares Bezeichnungsfeld", () => {
  assert.doesNotMatch(editorHtml, /Paddle|OCR|Bezeichnung/);
  assert.doesNotMatch(editorI18n, /Paddle|OCR/);
  assert.doesNotMatch(editorHtml, /id=["']fieldLabel["']/);
  assert.doesNotMatch(editorSource, /el\(["']fieldLabel["']\)/);
  assert.doesNotMatch(editorHtml, /class=["'][^"']*engine-badge/);
});

test("Editor-Hilfetexte dürfen Karten verlassen und Aktionsleisten sind gemeinsam angeordnet", () => {
  assert.match(styles, /\.editor-page \.card\s*\{\s*overflow:\s*visible;/);
  assert.match(editorHtml, /editor-action-line/);
  assert.match(editorHtml, /Masterbild analysieren/);
  assert.match(editorHtml, /Erkannten Bereich auswählen/);
});
