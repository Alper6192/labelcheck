import test from "node:test";
import assert from "node:assert/strict";
import { parseEncodedImageDimensions, parseEncodedImageOrientationInfo } from "../src/image-tools.js";

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


test("EXIF-Orientierung 6 tauscht JPEG-Achsen für die Hochkantprüfung", () => {
  const bytes = new Uint8Array(80);
  bytes.set([0xff,0xd8], 0);
  // APP1 Exif, little-endian TIFF, Orientation=6
  bytes.set([0xff,0xe1, 0x00,0x22, 0x45,0x78,0x69,0x66,0x00,0x00, 0x49,0x49,0x2a,0x00, 0x08,0x00,0x00,0x00, 0x01,0x00, 0x12,0x01, 0x03,0x00, 0x01,0x00,0x00,0x00, 0x06,0x00,0x00,0x00, 0x00,0x00,0x00,0x00], 2);
  // SOF0: encoded 4032 x 3024
  const sof = 2 + 2 + 0x22;
  bytes.set([0xff,0xc0, 0x00,0x0b, 0x08, 0x0b,0xd0, 0x0f,0xc0, 0x03,0x01,0x11,0x00], sof);
  const info = parseEncodedImageOrientationInfo(bytes, "image/jpeg");
  assert.equal(info.orientation, 6);
  assert.equal(info.displayWidth, 3024);
  assert.equal(info.displayHeight, 4032);
  assert.equal(info.portrait, true);
});
