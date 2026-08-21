import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const camera = fs.readFileSync(new URL("../src/camera.js", import.meta.url), "utf8");

test("Geführter Kameramodus startet Produkt und VDA/TA nacheinander", () => {
  assert.match(html, /id="startCaptureFlowButton"[^>]*>[^<]*Labelprüfung starten/);
  assert.match(html, /id="cameraOverlay"/);
  assert.match(html, /id="cameraInstruction"[^>]*>Produktlabel fotografieren/);
  assert.match(main, /cameraSession\.step = "vda"/);
  assert.match(main, /await loadFile\("product", productFile\)/);
  assert.match(main, /await loadFile\("vda", vdaFile\)/);
});

test("Browserkamera fordert ausdrücklich die Rückkamera an und merkt sie sich", () => {
  assert.match(camera, /facingMode:\s*\{ exact: "environment" \}/);
  assert.match(camera, /SAVED_REAR_CAMERA_KEY/);
  assert.match(camera, /settings\.facingMode === "user"/);
  assert.match(camera, /Keine Rückkamera verfügbar/);
});

test("Kameramodus verlangt Querformat vor dem Auslösen", () => {
  assert.match(main, /isLandscapeViewport\(\)/);
  assert.match(main, /cameraLandscapeHint/);
  assert.match(main, /shutter\.disabled = !landscape/);
  assert.match(html, /Bitte Gerät quer halten/);
});

test("Einzelne Neuaufnahmen bleiben bis zum abgeschlossenen Fotovorgang gesperrt", () => {
  assert.match(html, /id="productRetakeButton"[^>]*disabled/);
  assert.match(html, /id="vdaRetakeButton"[^>]*disabled/);
  assert.match(main, /const retakeDisabled = !photoFlowCompleted \|\| cameraSession\.active/);
  assert.match(main, /photoFlowCompleted = true/);
  assert.match(main, /photoFlowCompleted = false/);
});
