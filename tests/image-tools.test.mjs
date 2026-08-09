import test from "node:test";
import assert from "node:assert/strict";
import { parseEncodedImageDimensions } from "../src/image-tools.js";

test("PNG-Abmessungen werden ohne Bilddecode gelesen", () => {
  const bytes = new Uint8Array(24);
  bytes.set([0x89,0x50,0x4e,0x47], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 4032, false);
  view.setUint32(20, 3024, false);
  assert.deepEqual(parseEncodedImageDimensions(bytes, "image/png"), { width: 4032, height: 3024 });
});

test("JPEG-Abmessungen werden aus SOF gelesen", () => {
  const bytes = new Uint8Array([
    0xff,0xd8,
    0xff,0xe0, 0x00,0x04, 0x00,0x00,
    0xff,0xc0, 0x00,0x0b, 0x08, 0x0b,0xd0, 0x0f,0xc0, 0x03,0x01,0x11,0x00
  ]);
  assert.deepEqual(parseEncodedImageDimensions(bytes, "image/jpeg"), { width: 4032, height: 3024 });
});
