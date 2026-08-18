import test from "node:test";
import assert from "node:assert/strict";
import { applyRectDrag, hitTestRect, rectFromPoints } from "../src/editor-geometry.js";
import { createField, expandPoly, polyToRect, rectToPoly, validateRegex } from "../src/profile-schema.js";

test("freie Editorzone wird aus zwei Punkten normalisiert", () => {
  const rect = rectFromPoints({ x: .8, y: .7 }, { x: .2, y: .1 });
  assert.equal(rect.x, .2);
  assert.equal(rect.y, .1);
  assert.ok(Math.abs(rect.width - .6) < 1e-9);
  assert.ok(Math.abs(rect.height - .6) < 1e-9);
});

test("Editorzone lässt sich verschieben und an der Ecke vergrößern", () => {
  const rect = { x: .2, y: .2, width: .2, height: .1 };
  const moved = applyRectDrag(rect, { x: .25, y: .25 }, { x: .35, y: .30 }, { type: "move" });
  assert.ok(Math.abs(moved.x - .3) < 1e-9);
  assert.ok(Math.abs(moved.y - .25) < 1e-9);
  const resized = applyRectDrag(rect, { x: .4, y: .3 }, { x: .5, y: .4 }, { type: "resize", handle: "se" });
  assert.ok(Math.abs(resized.width - .3) < 1e-9);
  assert.ok(Math.abs(resized.height - .2) < 1e-9);
});

test("Eckpunkte werden als Resize-Handle erkannt", () => {
  assert.deepEqual(hitTestRect({ x: .2, y: .2 }, { x: .2, y: .2, width: .2, height: .1 }), { type: "resize", handle: "nw" });
});

test("Fassnummer-Preset enthält robuste OCR-Bereinigung", () => {
  const field = createField("drum_number", rectToPoly({ x: .1, y: .1, width: .2, height: .1 }));
  assert.equal(field.normalizer, "last_digits");
  assert.equal(field.digits, 4);
  assert.equal(field.neighbor.field, "batch");
  assert.deepEqual(field.neighbor.directions, ["right"]);
  assert.equal(validateRegex(field.sourceRegex).valid, true);
  const expanded = polyToRect(expandPoly(field.poly, .2));
  assert.ok(expanded.width > .2);
});
