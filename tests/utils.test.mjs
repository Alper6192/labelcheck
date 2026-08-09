import test from "node:test";
import assert from "node:assert/strict";
import { boundsFromPoly, normalizePoly, sortOcrItems, serializableResult } from "../src/utils.js";

test("normalizePoly verarbeitet verschachtelte und flache Koordinaten", () => {
  assert.deepEqual(normalizePoly([[1, 2], [3, 4]]), [[1, 2], [3, 4]]);
  assert.deepEqual(normalizePoly([1, 2, 3, 4]), [[1, 2], [3, 4]]);
});

test("boundsFromPoly berechnet die Begrenzung", () => {
  assert.deepEqual(boundsFromPoly([[4, 8], [14, 8], [14, 18], [4, 18]]), {
    x: 4,
    y: 8,
    width: 10,
    height: 10
  });
});

test("sortOcrItems sortiert zeilenweise", () => {
  const result = sortOcrItems([
    { text: "B", poly: [[100, 10], [110, 10], [110, 20], [100, 20]] },
    { text: "C", poly: [[5, 50], [15, 50], [15, 60], [5, 60]] },
    { text: "A", poly: [[5, 11], [15, 11], [15, 21], [5, 21]] }
  ]);
  assert.deepEqual(result.map((item) => item.text), ["A", "B", "C"]);
});

test("serializableResult entfernt nicht benötigte Objektteile", () => {
  const result = serializableResult({
    image: { width: 100, height: 50 },
    items: [{ text: "D123", score: 0.9, poly: [1, 2, 3, 4] }],
    metrics: { totalMs: 10 },
    runtime: { backend: "wasm" }
  });
  assert.equal(result.items[0].text, "D123");
  assert.deepEqual(result.items[0].poly, [[1, 2], [3, 4]]);
});
