import test from "node:test";
import assert from "node:assert/strict";
import { APP_VERSION, MODEL_OPTIONS } from "../src/config.js";

test("Browsermodell nutzt explizite PP-OCRv5-Modellnamen", () => {
  const model = MODEL_OPTIONS.standard;
  assert.equal(APP_VERSION, "0.6.2");
  assert.equal(model.textDetectionModelName, "PP-OCRv5_mobile_det");
  assert.equal(model.textRecognitionModelName, "PP-OCRv5_mobile_rec");
  assert.equal(model.textDetectionModelFile, "PP-OCRv5_mobile_det_onnx_infer.tar");
  assert.equal(model.textRecognitionModelFile, "PP-OCRv5_mobile_rec_onnx_infer.tar");
  assert.equal("lang" in model, false);
  assert.equal("ocrVersion" in model, false);
});
