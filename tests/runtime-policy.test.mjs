import test from "node:test";
import assert from "node:assert/strict";
import { detectRuntimePolicy } from "../src/runtime-policy.js";

test("Normalmodus bleibt für alle Geräte AUTO", () => {
  const normal = detectRuntimePolicy({ compatibilityMode: false });
  assert.equal(normal.backend, "auto");
  assert.equal(normal.numThreads, 0);
  assert.equal(normal.textRecognitionBatchSize, 8);
  assert.equal(normal.compatibilityMode, false);
});

test("Kompatibilitätsmodus deaktiviert WebGPU und reduziert Speicherlast", () => {
  const safe = detectRuntimePolicy({ compatibilityMode: true });
  assert.equal(safe.backend, "wasm");
  assert.equal(safe.numThreads, 1);
  assert.equal(safe.textRecognitionBatchSize, 1);
  assert.equal(safe.scannerMaxImageSide, 1200);
  assert.equal(safe.scannerDetLimitSideLen, 640);
  assert.equal(safe.resizeDuringDecode, true);
});
