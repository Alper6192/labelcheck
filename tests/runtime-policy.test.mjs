import test from "node:test";
import assert from "node:assert/strict";
import { detectRuntimePolicy, isMobileLike } from "../src/runtime-policy.js";

test("Schnellmodus bleibt AUTO", () => {
  const normal = detectRuntimePolicy({ compatibilityMode: false });
  assert.equal(normal.backend, "auto");
  assert.equal(normal.numThreads, 0);
  assert.equal(normal.textRecognitionBatchSize, 8);
  assert.equal(normal.compatibilityMode, false);
});

test("Stabilmodus deaktiviert WebGPU und reduziert Speicherlast", () => {
  const safe = detectRuntimePolicy({ compatibilityMode: true });
  assert.equal(safe.backend, "wasm");
  assert.equal(safe.numThreads, 1);
  assert.equal(safe.textRecognitionBatchSize, 1);
  assert.equal(safe.scannerMaxImageSide, 1200);
  assert.equal(safe.scannerDetLimitSideLen, 640);
  assert.equal(safe.resizeDuringDecode, true);
});

test("Android, iPhone und iPadOS werden als Mobilgerät erkannt", () => {
  assert.equal(isMobileLike({ userAgent: "Mozilla/5.0 (Linux; Android 14) Mobile", maxTouchPoints: 5 }), true);
  assert.equal(isMobileLike({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)", maxTouchPoints: 5 }), true);
  assert.equal(isMobileLike({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", maxTouchPoints: 5 }), true);
  assert.equal(isMobileLike({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", maxTouchPoints: 0 }), false);
});
