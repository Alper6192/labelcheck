import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");

test("Produkt und VDA fordern native Rückkamera an", () => {
  assert.match(html, /id="productCameraInput"[^>]*capture="environment"/);
  assert.match(html, /id="vdaCameraInput"[^>]*capture="environment"/);
  assert.match(main, /cameraInput\?\.setAttribute\("capture", "environment"\)/);
});

test("Native Kamera darf auch bei hochkant gehaltenem Smartphone öffnen", () => {
  assert.doesNotMatch(main, /isViewportPortrait\(\)/);
  assert.doesNotMatch(main, /event\.preventDefault\(\)/);
  assert.match(main, /cameraInput\.value = ""/);
});

test("Hochkantfotos werden EXIF-aware vor OCR mit Querformat-Hinweis beendet", () => {
  assert.match(main, /readImageOrientationInfo\(file\)/);
  assert.match(main, /isPortraitPhoto\(orientationInfo, slot\.prepared\)/);
  assert.match(main, /Bitte das Label quer fotografieren/);
  assert.match(main, /slot\.state = "orientation"/);
});
