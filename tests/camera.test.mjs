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

test("Rückkamera-Hinweis wird unmittelbar vor Kameraaktivierung erneut gesetzt", () => {
  assert.match(main, /label\[for="\$\{key\}CameraInput"\]/);
  assert.match(main, /pointerdown/);
  assert.match(main, /capture", "environment"/);
});

test("Hochkantfotos werden vor OCR mit Querformat-Hinweis beendet", () => {
  assert.match(main, /slot\.prepared\.height > slot\.prepared\.width/);
  assert.match(main, /Bitte das Label quer fotografieren/);
  assert.match(main, /slot\.state = "orientation"/);
});
