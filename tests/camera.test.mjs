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

test("Kamera wird im Hochkantmodus vor dem nativen Aufruf blockiert", () => {
  assert.match(main, /isViewportPortrait\(\)/);
  assert.match(main, /Bitte das Smartphone quer halten/);
  assert.match(main, /event\.preventDefault\(\)/);
});

test("Hochkantfotos werden EXIF-aware vor OCR mit Querformat-Hinweis beendet", () => {
  assert.match(main, /readImageOrientationInfo\(file\)/);
  assert.match(main, /isPortraitPhoto\(orientationInfo, slot\.prepared\)/);
  assert.match(main, /Bitte das Label quer fotografieren/);
  assert.match(main, /slot\.state = "orientation"/);
});
