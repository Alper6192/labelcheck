import test from "node:test";
import assert from "node:assert/strict";
import { parseTeslaQrPayload } from "../src/qr-parser.js";

const sample = "[)>+06:6J0001713232607130956263434:P2254461-00-A:Q900:K5603632493:5K:4K150:3QKG:1TD562808695:15D20261003:12D:99Z0013029294:S:X0+#";

test("Tesla-QR liefert Batch, Lieferscheinnummer und Gewicht", () => {
  const parsed = parseTeslaQrPayload(sample);
  assert.equal(parsed?.fields.batch, "D562808695");
  assert.equal(parsed?.fields.delivery_note, "0013029294");
  assert.equal(parsed?.fields.weight, "900 KG");
  assert.equal(parsed?.fields.idh, "");
});

test("beliebiger QR-Code wird nicht als Tesla interpretiert", () => {
  assert.equal(parseTeslaQrPayload("https://example.com"), null);
});
