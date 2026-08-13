import test from "node:test";
import assert from "node:assert/strict";
import { createNativeRearCameraInput } from "../src/camera.js";

function fakeDocument() {
  return {
    createElement(tag) {
      const attrs = new Map();
      return {
        tagName: tag.toUpperCase(),
        type: "",
        accept: "",
        className: "",
        setAttribute(name, value) { attrs.set(name, String(value)); },
        getAttribute(name) { return attrs.get(name) ?? null; }
      };
    }
  };
}

test("Native Kamera fordert bei jedem neuen Input die Rückkamera an", () => {
  const first = createNativeRearCameraInput(fakeDocument());
  const second = createNativeRearCameraInput(fakeDocument());
  assert.notEqual(first, second);
  assert.equal(first.type, "file");
  assert.equal(first.accept, "image/*");
  assert.equal(first.getAttribute("capture"), "environment");
  assert.equal(second.getAttribute("capture"), "environment");
});
