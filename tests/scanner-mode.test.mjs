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
