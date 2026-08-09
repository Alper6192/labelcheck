import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const script = await readFile(new URL("../scripts/copy-model-assets.mjs", import.meta.url), "utf8");

test("Build kopiert PaddleOCR-Modelle in die eigene Pages-Site", () => {
  assert.match(pkg.scripts["prepare:runtime"], /copy-model-assets\.mjs/);
  assert.match(script, /PP-OCRv5_mobile_det_onnx_infer\.tar/);
  assert.match(script, /PP-OCRv5_mobile_rec_onnx_infer\.tar/);
  assert.match(script, /public.*models|targetDir/);
});
