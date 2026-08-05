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

test("erkennt die Werte aus dem gezeigten Produktlabel", () => {
  const parsed = parseFlorenceOcr({
    "<OCR_WITH_REGION>": {
      labels: ["TEROSON PU 1511", "2210485", "Net weight", "25 KG", "Batch No.", "D562900431 /0001"],
      quad_boxes: [box(30,20,220), box(380,90), box(250,140), box(390,140), box(250,190), box(390,190,220)],
    },
  }, { role: "product", imageSize: [800, 600] });
  assert.equal(parsed.fields.batch.value, "D562900431");
  assert.equal(parsed.fields.idh.value, "2210485");
  assert.equal(parsed.fields.weight.value, "25 KG");
});

test("bevorzugt beim VDA-Label 1300 KG vor einem falschen 3 G", () => {
  const parsed = parseFlorenceOcr({
    "<OCR_WITH_REGION>": {
      labels: [
        "51 Füllmenge (Q)", "3 G", "1300 KG",
        "11 Sach-Nr Lieferant", "1845762",
        "1T Chargen-Nr", "D561707374",
      ],
      quad_boxes: [
        box(20,180,160), box(220,40), box(210,180,150),
        box(420,180,180), box(450,240),
        box(420,420,160), box(510,470,180),
      ],
    },
  }, { role: "vda", imageSize: [800, 600] });
  assert.equal(parsed.fields.weight.value, "1300 KG");
  assert.equal(parsed.fields.idh.value, "1845762");
  assert.equal(parsed.fields.batch.value, "D561707374");
});
