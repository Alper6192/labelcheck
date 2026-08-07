import test from "node:test";
import assert from "node:assert/strict";
import { detectRuntimePolicy } from "../src/runtime-policy.js";

test("iPhone und Android verwenden denselben AUTO-Pfad", () => {
  const iphone = detectRuntimePolicy({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
    platform: "iPhone",
    maxTouchPoints: 5
  });
  const android = detectRuntimePolicy({
    userAgent: "Mozilla/5.0 (Linux; Android 16; SM-S938B) AppleWebKit/537.36 Chrome/151 Mobile Safari/537.36",
    platform: "Linux armv8l",
    maxTouchPoints: 5
  });

  assert.equal(iphone.backend, "auto");
  assert.equal(android.backend, "auto");
  assert.equal(iphone.textRecognitionBatchSize, 8);
  assert.equal(android.textRecognitionBatchSize, 8);
  assert.deepEqual(iphone, android);
});
