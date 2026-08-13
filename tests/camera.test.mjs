import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");

test("Produkt und VDA besitzen dauerhafte native Rückkamera-Inputs", () => {
  assert.match(html, /id="productCameraInput"[^>]*capture="environment"/);
  assert.match(html, /id="vdaCameraInput"[^>]*capture="environment"/);
  assert.match(html, /for="productCameraInput"/);
  assert.match(html, /for="vdaCameraInput"/);
});

test("Kamera-Input wird nicht bei jedem Klick neu erzeugt", () => {
  assert.match(main, /const cameraInput = el\(`\$\{key\}CameraInput`\)/);
  assert.match(main, /cameraInput\?\.setAttribute\("capture", "environment"\)/);
  assert.doesNotMatch(main, /createNativeRearCameraInput/);
  assert.doesNotMatch(main, /openNativeRearCamera/);
});
