import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { autoSelectProfile, extractProfileFields, normalizeFieldValue, normalizedWeight } from "../src/profile-engine.js";
import { compareExtractions } from "../src/comparison.js";

const config = JSON.parse(fs.readFileSync(new URL("./fixtures/extraction-profiles.json", import.meta.url), "utf8"));
const product = config.profiles.find((profile) => profile.role === "product");
const vda = config.profiles.find((profile) => profile.role === "vda");
const item = (text, score, poly) => ({ text, score, poly });
const productItems = [
  item("TEROSON", .997, [[298,76],[861,68],[862,180],[299,187]]),
  item("2210485", .999, [[955,277],[1158,271],[1160,321],[956,328]]),
  item("25 KG", .948, [[1004,333],[1157,329],[1159,380],[1005,384]]),
  item("D562900431", .999, [[858,404],[1042,400],[1043,434],[858,437]]),
  item("10001", .904, [[1067,399],[1155,399],[1155,433],[1067,433]])
];
const vdaItems = [
  item("Mercedes-Benz AG", .968, [[230,128],[522,128],[522,160],[230,160]]),
  item("12981531", .999, [[580,254],[783,252],[784,297],[581,299]]),
  item("1300 KG", .93, [[569,517],[803,517],[803,568],[569,568]]),
  item("1845762", .999, [[822,597],[971,597],[971,634],[822,634]]),
  item("D561707374", .999, [[1172,847],[1407,844],[1407,884],[1173,888]])
];

test("Produkt-, Fass- und Mercedesfelder werden korrekt zugeordnet", () => {
  const p = extractProfileFields(productItems, product, { width: 1800, height: 1013 });
  const v = extractProfileFields(vdaItems, vda, { width: 1800, height: 1013 });
  assert.equal(p.fields.batch.value, "D562900431");
  assert.equal(p.fields.drum_number.value, "0001");
  assert.equal(p.fields.drum_number.valid, true);
  assert.equal(p.fields.idh.value, "2210485");
  assert.equal(p.fields.weight.value, "25 KG");
  assert.equal(v.fields.delivery_note.value, "12981531");
  assert.equal(v.fields.idh.value, "1845762");
  assert.equal(v.fields.weight.value, "1300 KG");
  assert.equal(v.fields.batch.value, "D561707374");
  const comparison = compareExtractions(p, v);
  assert.equal(comparison.status, "rejected");
});

test("Fassnummer wird auch aus einem an den Batch angehängten Wert gelesen", () => {
  const merged = productItems.filter((entry) => !["D562900431", "10001"].includes(entry.text));
  merged.push(item("D562900431 /0002", .99, [[858,404],[1155,399],[1155,437],[858,437]]));
  const result = extractProfileFields(merged, product, { width: 1800, height: 1013 });
  assert.equal(result.fields.batch.value, "D562900431");
  assert.equal(result.fields.drum_number.value, "0002");
});

test("last_digits korrigiert einen als 1 gelesenen Schrägstrich", () => {
  assert.equal(normalizeFieldValue("drum_number", "10001", { normalizer: "last_digits", digits: 4 }), "0001");
  assert.equal(normalizeFieldValue("drum_number", "/0007", { normalizer: "last_digits", digits: 4 }), "0007");
});

test("Batch-Normalisierung ignoriert Doppelpunkt und Suffix", () => {
  assert.equal(normalizeFieldValue("batch", "D561001475 :00001", { normalizer: "batch" }), "D561001475");
  assert.equal(normalizeFieldValue("batch", "D561001475:00001", { normalizer: "batch" }), "D561001475");
});


test("Kurzer Alias BMW erkennt eine längere Kundenzeile automatisch", () => {
  const profile = {
    id: "BMW", name: "BMW", role: "vda", active: true,
    anchor: { aliases: ["BMW"], poly: [[0.1,0.1],[0.3,0.1],[0.3,0.2],[0.1,0.2]] }, fields: []
  };
  const result = autoSelectProfile([
    item("BMW (UK) Manufacturing Ltd", .99, [[100,50],[400,50],[400,90],[100,90]])
  ], [profile], "vda");
  assert.equal(result?.profile?.id, "BMW");
});

test("Materialnummer allein reicht nicht als Anker Alte Materialnummer", () => {
  const profile = {
    id: "INTERN", name: "Intern", role: "product", active: true,
    anchor: { aliases: ["Alte Materialnummer"], poly: [[0.1,0.1],[0.3,0.1],[0.3,0.2],[0.1,0.2]] }, fields: []
  };
  const result = autoSelectProfile([
    item("Materialnummer", .99, [[100,50],[260,50],[260,90],[100,90]])
  ], [profile], "product");
  assert.equal(result?.manual, true);
  assert.equal(result?.anchorMatch, null);
});

test("IDH kann als Teil einer gemeinsamen OCR-Zeile gewählt werden", () => {
  const profile = {
    id: "VW", name: "VW", role: "vda", active: true,
    anchor: { aliases: ["Volkswagen Sachsen GmbH"], poly: [[0.1,0.1],[0.3,0.1],[0.3,0.18],[0.1,0.18]] },
    fields: [{ key: "idh", label: "IDH", required: true, compare: true, regex: "^\\d{6,8}$", sourceRegex: "^\\d{6,8}$", normalizer: "digits", poly: [[0.55,0.72],[0.7,0.72],[0.7,0.8],[0.55,0.8]] }]
  };
  const items = [
    item("Volkswagen Sachsen GmbH", .99, [[100,50],[300,50],[300,90],[100,90]]),
    item("13023444 3103560", .99, [[300,360],[700,360],[700,400],[300,400]])
  ];
  const result = extractProfileFields(items, profile, { width: 1000, height: 500 });
  assert.equal(result.fields.idh.value, "3103560");
  assert.equal(result.fields.idh.valid, true);
});

test("Gewicht ohne Einheit wird als Kilogramm vergleichbar", () => {
  assert.deepEqual(normalizedWeight("1550"), { number: 1550, unit: "KG", base: 1550000 });
  assert.deepEqual(normalizedWeight("1150 KGM"), { number: 1150, unit: "KG", base: 1150000 });
});


test("VW-IDH wird auch aus einer zusammengeklebten Ziffernzeile gewählt", () => {
  const profile = {
    id: "VW", name: "VW", role: "vda", active: true,
    anchor: { aliases: ["Volkswagen Sachsen GmbH"], poly: [[0.1,0.1],[0.3,0.1],[0.3,0.18],[0.1,0.18]] },
    fields: [
      { key: "delivery_note", label: "Lieferschein", required: false, compare: false, regex: "^\\d{8}$", sourceRegex: "^\\d{8}$", normalizer: "digits", poly: [[0.30,0.72],[0.48,0.72],[0.48,0.8],[0.30,0.8]] },
      { key: "idh", label: "IDH", required: true, compare: true, regex: "^\\d{7}$", sourceRegex: "^\\d{7}$", normalizer: "digits", poly: [[0.55,0.72],[0.7,0.72],[0.7,0.8],[0.55,0.8]] }
    ]
  };
  const items = [
    item("Volkswagen Sachsen GmbH", .99, [[100,50],[300,50],[300,90],[100,90]]),
    item("130234443103560", .99, [[300,360],[700,360],[700,400],[300,400]])
  ];
  const result = extractProfileFields(items, profile, { width: 1000, height: 500 });
  assert.equal(result.fields.delivery_note.value, "13023444");
  assert.equal(result.fields.idh.value, "3103560");
});

test("Vergleich überspringt IDH, wenn der Lieferschein dieses Feld nicht vergleicht", () => {
  const left = { fields: {
    batch: { value: "D562808695", valid: true, required: true, compare: true },
    idh: { value: "2561822", valid: true, required: true, compare: true },
    weight: { value: "900 KG", valid: true, required: true, compare: true }
  }};
  const right = { fields: {
    batch: { value: "D562808695", valid: true, required: true, compare: true },
    weight: { value: "900 KG", valid: true, required: true, compare: true },
    delivery_note: { value: "0013029294", valid: true, required: true, compare: false }
  }};
  const comparison = compareExtractions(left, right);
  assert.equal(comparison.status, "released");
  assert.deepEqual(comparison.rows.map((row) => row.key), ["batch", "weight"]);
});

test("VW-Geometrie skaliert nicht mit der Länge des erkannten Ankertexts", () => {
  const profile = {
    id: "VW", name: "VW", role: "vda", active: true,
    anchor: { aliases: ["Volkswagen", "Volkswagen Sachsen GmbH"], poly: [[0.2,0.1],[0.6,0.1],[0.6,0.15],[0.2,0.15]] },
    fields: [
      { key: "batch", label: "Batch", required: true, compare: true, regex: "^D\\d{9}$", sourceRegex: "^D\\d{9}$", normalizer: "batch", poly: [[0.70,0.62],[0.88,0.62],[0.88,0.68],[0.70,0.68]] },
      { key: "idh", label: "IDH", required: true, compare: true, regex: "^\\d{7}$", sourceRegex: "^\\d{7}$", normalizer: "digits", poly: [[0.50,0.72],[0.62,0.72],[0.62,0.79],[0.50,0.79]] }
    ]
  };
  const items = [
    item("Volkswagen AG", .99, [[300,100],[450,100],[450,150],[300,150]]),
    item("D562707959", .99, [[675,620],[855,620],[855,680],[675,680]]),
    item("13026259 2892943", .99, [[300,720],[620,720],[620,790],[300,790]])
  ];
  const result = extractProfileFields(items, profile, { width: 1000, height: 1000 });
  assert.equal(result.fields.batch.value, "D562707959");
  assert.equal(result.fields.idh.value, "2892943");
});

test("Getrennte OCR-Boxen können gemeinsam einen Textanker bilden", () => {
  const profile = {
    id: "INTERN2", name: "Intern2", role: "vda", active: true,
    anchor: { aliases: ["Stor.Cl./WPC"], poly: [[0.50,0.50],[0.65,0.50],[0.65,0.55],[0.50,0.55]] },
    fields: []
  };
  const result = autoSelectProfile([
    item("Stor.Cl.", .96, [[500,500],[570,500],[570,540],[500,540]]),
    item("/ WPC", .94, [[575,502],[645,502],[645,542],[575,542]])
  ], [profile], "vda");
  assert.equal(result?.profile?.id, "INTERN2");
  assert.equal(result?.anchorMatch?.item?.joined, true);
});


test("INTERN2 lokalisiert Stor.Cl./WPC innerhalb einer langen H-Satz-OCR-Zeile", () => {
  const profile = {
    id: "INTERN2", name: "Intern2", role: "vda", active: true,
    anchor: { aliases: ["Stor.Cl./WPC"], localizeAlias: true, poly: [[0.54,0.58],[0.64,0.58],[0.64,0.61],[0.54,0.61]] },
    fields: []
  };
  const result = autoSelectProfile([
    item("H-Sätze: H351/H373/H319/H315/H351/H335/H317/H334Stor.Cl./WPC 11 /1", .97, [[250,580],[900,580],[900,620],[250,620]])
  ], [profile], "vda");
  assert.equal(result?.profile?.id, "INTERN2");
  assert.equal(result?.anchorMatch?.item?.anchorFragment, true);
  assert.equal(result?.anchorMatch?.item?.text, "Stor.Cl./WPC");
  const xs = result.anchorMatch.item.poly.map((point) => point[0]);
  assert.ok(Math.min(...xs) > 650, "virtueller Anker muss im rechten Teil der langen OCR-Zeile liegen");
  assert.ok(Math.max(...xs) - Math.min(...xs) < 180, "virtueller Anker darf nicht die gesamte H-Satz-Zeile umfassen");
});
