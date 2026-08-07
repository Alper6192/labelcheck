import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");

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


test("Scanner verwirft veraltete asynchrone Scan-Ergebnisse per Generation", () => {
  assert.match(source, /generation:\s*0/);
  assert.match(source, /isCurrentSlotRequest/);
  assert.match(source, /expectedGeneration/);
});

test("Manuell gewähltes QR-Profil wird erneut mit detectQrProfile ausgewertet", () => {
  assert.match(source, /slot\.profile\?\.source\?\.type === "qr"/);
  assert.match(source, /detectQrProfile\(slot\.prepared\.canvas, \[slot\.profile\], key\)/);
});

test("Speichern desselben Vergleichs wird bis zur nächsten Änderung gesperrt", () => {
  assert.match(source, /dataRevision === lastSavedRevision/);
  assert.match(source, /lastSavedRevision = dataRevision/);
});

test("Bildqualität wird nur als Hinweis angezeigt", () => {
  assert.match(source, /Hinweis: Bild/);
  assert.match(source, /imageQualityHint/);
});
