import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("neues Foto setzt das Layoutprofil auf Automatisch", () => {
  assert.match(source, /selectedProfileId:\s*""/);
  assert.match(source, /el\(`\$\{key\}Profile`\)\.value\s*=\s*""/);
});

test("automatisch erkanntes Profil überschreibt den Select nicht", () => {
  assert.match(source, /el\(`\$\{key\}Profile`\)\.value\s*=\s*slot\.selectedProfileId\s*\|\|\s*""/);
});


test("Scanner markiert eine laufende OCR für Crash-Recovery", () => {
  assert.match(source, /markOcrInFlight\("predict"/);
  assert.match(source, /clearOcrInFlight\(\)/);
  assert.match(source, /recoverCompatibilityMode\(\)/);
});

test("Scanner bietet einen manuellen Kompatibilitätsmodus", () => {
  assert.match(source, /compatibilityToggle/);
  assert.match(source, /setCompatibilityMode/);
  assert.match(source, /resizeDuringDecode/);
});


test("Scanner prüft QR-Profile vor PaddleOCR", () => {
  assert.match(source, /detectQrProfile/);
  assert.match(source, /extractQrProfileFields/);
  assert.match(source, /QR-Code/);
});

test("Manuelle QR-Profilauswahl verwendet erneut detectQrProfile", () => {
  assert.match(source, /detectQrProfile\(slot\.prepared\.canvas, \[slot\.profile\], key\)/);
  assert.match(source, /QR-Code für dieses Profil wurde nicht erkannt/);
});

test("Bildqualität wird nur als Hinweis dargestellt", () => {
  assert.match(source, /Hinweis: Bild/);
  assert.match(source, /slot\.prepared\?\.quality\?\.rating/);
});

test("Nach einer erfolgreichen Übernahme startet ein neuer Scanzyklus", () => {
  assert.match(source, /function resetScanCycleAfterSave\(\)/);
  assert.match(source, /releasePreparedImage\(slot\.prepared\)/);
  assert.match(source, /Object\.assign\(slot, createSlot\(key\)\)/);
  assert.match(source, /records = await saveRecord\(record\);\s*resetScanCycleAfterSave\(\);/s);
  assert.match(source, /saveButton\.disabled\s*=\s*!comparison \|\| manualInputRequired \|\| \(reviewRequired && !reviewConfirmed\) \|\| currentSaved \|\| saveInProgress/);
});


test("Felder unter 80 Prozent oder ohne Erkennung müssen manuell ausgefüllt werden", () => {
  assert.match(source, /manualInputRequiredFields/);
  assert.match(source, /Orange Felder ausfüllen/);
  assert.match(source, /manualInputRequired/);
});

test("Produktfoto wird ausschließlich über die Profilvalidierung aus JSON geprüft", () => {
  assert.match(source, /isVerifiedConfiguredLabel/);
  assert.match(source, /profile\.validation/);
  assert.match(source, /validation\.requiredValidFields/);
  assert.match(source, /validation\.minAnchorScore/);
  assert.match(source, /field\.requiresManualInput/);
  assert.doesNotMatch(source, /HENKEL|isVerifiedProductLabel/);
});


test("Prüffälle müssen vom Bediener bestätigt werden, bevor gespeichert werden kann", () => {
  assert.match(html, /id="reviewButton"[^>]*>Überprüft<\/button>/);
  assert.match(source, /comparison\?\.status === "review"/);
  assert.match(source, /confirmOperatorReview/);
  assert.match(source, /reviewConfirmed = true/);
  assert.match(source, /reviewRequired && !reviewConfirmed/);
});

test("Bedienerprüfung lässt Batch-Abweichung rot und nicht freigegeben", () => {
  assert.match(source, /comparison\.batchMismatch/);
  assert.match(source, /status:\s*"rejected"/);
  assert.match(source, /NICHT FREIGEGEBEN – Batchnummern weichen ab\. · ✓ Vom Bediener überprüft\./);
  assert.match(source, /status:\s*finalComparison\?\.status \|\| comparison\.status/);
});


test("nach Bedienerprüfung wird bei gleicher Batch endgültig freigegeben", () => {
  assert.match(source, /batchRow\?\.status === "match"/);
  assert.match(source, /status:\s*"released"/);
  assert.match(source, /FREIGEGEBEN – Batchnummer stimmt überein\. · ✓ Vom Bediener überprüft\./);
});
