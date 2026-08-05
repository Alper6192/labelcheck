import test from "node:test";
import assert from "node:assert/strict";
import { parseFlorenceOcr } from "../src/ocr-parser.js";
import { compareLabels } from "../src/comparison.js";

function box(x, y, w = 120, h = 30) {
  return [x, y, x + w, y, x + w, y + h, x, y + h];
}

test("liest beschriftete Werte über Nachbarboxen", () => {
  const parsed = parseFlorenceOcr({
    "<OCR_WITH_REGION>": {
      labels: ["Batch", "D123456789", "IDH", "2847365", "Net Weight", "200 KG", "Drum No", "17", "Delivery Note", "47110815"],
      quad_boxes: [box(20,20), box(180,20), box(20,70), box(180,70), box(20,120), box(180,120), box(20,170), box(180,170), box(20,220), box(180,220)],
    },
  });
  assert.equal(parsed.fields.batch.value, "D123456789");
  assert.equal(parsed.fields.idh.value, "2847365");
  assert.equal(parsed.fields.weight.value, "200 KG");
  assert.equal(parsed.fields.drum.value, "17");
  assert.equal(parsed.fields.deliveryNote.value, "47110815");
});

test("gibt nur bei allen Pflichtfeldern frei", () => {
  const field = (value) => ({ value });
  const product = { batch: field("D123456789"), idh: field("2847365"), weight: field("200 KG") };
  const vda = { batch: field("D123456789"), idh: field("2847365"), weight: field("200000 G") };
  const result = compareLabels(product, vda);
  assert.equal(result.released, true);
  assert.equal(result.status, "released");
});

test("lehnt abweichende Batch ab", () => {
  const field = (value) => ({ value });
  const product = { batch: field("D123456789"), idh: field("2847365"), weight: field("200 KG") };
  const vda = { batch: field("D999999999"), idh: field("2847365"), weight: field("200 KG") };
  const result = compareLabels(product, vda);
  assert.equal(result.released, false);
  assert.equal(result.status, "rejected");
});
