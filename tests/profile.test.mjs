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
  assert.equal(result, null);
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
      { key: "idh", label: "IDH", required: true, compare: true, regex: "^\\d{7}$", sourceRegex: "^(?:\\d{7}|\\d{7,8}\\s*\\d{7})$", normalizer: "last_digits", digits: 7, poly: [[0.55,0.72],[0.7,0.72],[0.7,0.8],[0.55,0.8]] }
    ]
  };
  const items = [
    item("Volkswagen Sachsen GmbH", .99, [[100,50],[300,50],[300,90],[100,90]]),
    item("130234443103560", .99, [[300,360],[700,360],[700,400],[300,400]])
  ];
  const result = extractProfileFields(items, profile, { width: 1000, height: 500 });
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
  assert.deepEqual(comparison.rows.map((row) => row.key), ["batch"]);
});

test("Manuelle Profilauswahl akzeptiert keinen beliebigen OCR-Text als Anker", () => {
  const profile = {
    id: "MANUAL", name: "Manual", role: "vda", active: true,
    anchor: { aliases: ["Prüflos"], poly: [[0.6,0.4],[0.7,0.4],[0.7,0.45],[0.6,0.45]] },
    fields: [{ key: "idh", label: "IDH", required: true, compare: true, regex: "^\\d{7}$", sourceRegex: "^\\d{7}$", normalizer: "digits", poly: [[0.1,0.1],[0.2,0.1],[0.2,0.2],[0.1,0.2]] }]
  };
  const result = extractProfileFields([
    item("COMPLETELY UNRELATED", .99, [[100,100],[420,100],[420,140],[100,140]])
  ], profile, { width: 1000, height: 500 });
  assert.match(result.warning, /nicht sicher erkannt/i);
  assert.deepEqual(result.fields, {});
});

test("Intern2 lokalisiert Prüflos innerhalb einer langen OCR-Zeile", () => {
  const profile = {
    id: "INTERN2", name: "Intern2", role: "vda", active: true,
    detection: { evidenceAliases: ["Prüflos"], minEvidenceMatches: 1, excludeAliases: ["Alte Materialnummer"], minScore: 0.62 },
    anchor: { aliases: ["Prüflos"], localizeAlias: true, fallbacks: [], poly: [[0.60,0.40],[0.68,0.40],[0.68,0.45],[0.60,0.45]] },
    fields: []
  };
  const sourcePoly = [[300,180],[820,180],[820,220],[300,220]];
  const result = extractProfileFields([
    item("H314 Verursacht schwere Augenschäden Prüflos", .99, sourcePoly)
  ], profile, { width: 1000, height: 500 });
  const xs = result.anchorMatch.item.poly.map(([x]) => x);
  const localizedWidth = Math.max(...xs) - Math.min(...xs);
  assert.equal(result.warning, "");
  assert.equal(result.anchorMatch.item.text, "Prüflos");
  assert.equal(result.anchorMatch.item.sourceText, "H314 Verursacht schwere Augenschäden Prüflos");
  assert.ok(localizedWidth < 180, `lokalisierter Anker ist zu breit: ${localizedWidth}`);
  assert.ok(result.transform.scale < 2, `Ankerskalierung ist unplausibel: ${result.transform.scale}`);
});

test("Intern2 wird nur ohne Alte Materialnummer automatisch gewählt", () => {
  const intern2 = {
    id: "INTERN2", name: "Intern2", role: "vda", active: true,
    detection: { evidenceAliases: ["Prüflos", "Referenzbeleg"], minEvidenceMatches: 1, excludeAliases: ["Alte Materialnummer"], minScore: 0.62 },
    anchor: { aliases: ["Prüflos"], localizeAlias: true, fallbacks: [], poly: [[0.6,0.4],[0.7,0.4],[0.7,0.45],[0.6,0.45]] },
    fields: []
  };
  const clean = autoSelectProfile([
    item("Prüflos", .99, [[600,200],[700,200],[700,225],[600,225]])
  ], [intern2], "vda");
  assert.equal(clean?.profile?.id, "INTERN2");

  const excluded = autoSelectProfile([
    item("Prüflos", .99, [[600,200],[700,200],[700,225],[600,225]]),
    item("Alte Materialnummer", .99, [[120,220],[300,220],[300,245],[120,245]])
  ], [intern2], "vda");
  assert.equal(excluded, null);

  const manualExtraction = extractProfileFields([
    item("Prüflos", .99, [[600,200],[700,200],[700,225],[600,225]]),
    item("Alte Materialnummer", .99, [[120,220],[300,220],[300,245],[120,245]])
  ], intern2, { width: 1000, height: 500 });
  assert.match(manualExtraction.warning, /Alte Materialnummer/);
});

test("vollständige Lieferscheinnummer wird nicht in kürzere Teilnummern zerlegt", () => {
  const profile = {
    id: "LSN", name: "LSN", role: "vda", active: true,
    anchor: { aliases: ["ANKER"], poly: [[0.1,0.1],[0.3,0.1],[0.3,0.2],[0.1,0.2]] },
    fields: [{ key: "delivery_note", label: "Lieferscheinnummer", required: false, compare: false, regex: "^\\d{7,12}$", sourceRegex: "^\\d{7,12}$", normalizer: "digits", poly: [[0.2,0.4],[0.35,0.4],[0.35,0.5],[0.2,0.5]] }]
  };
  const result = extractProfileFields([
    item("ANKER", .99, [[100,50],[300,50],[300,100],[100,100]]),
    item("969711916", .99, [[200,200],[350,200],[350,250],[200,250]])
  ], profile, { width: 1000, height: 500 });
  assert.equal(result.fields.delivery_note.value, "969711916");
  assert.equal(result.fields.delivery_note.raw, "969711916");
});

test("Seat-IDH nimmt keine Teilziffern aus einer 9-stelligen Lieferscheinnummer", () => {
  const profile = {
    id: "SEAT", name: "Seat", role: "vda", active: true,
    anchor: { aliases: ["SEAT"], poly: [[0.1,0.1],[0.3,0.1],[0.3,0.2],[0.1,0.2]] },
    fields: [
      { key: "delivery_note", label: "Lieferscheinnummer", required: false, compare: false, regex: "^\\d{7,12}$", sourceRegex: "^\\d{7,12}$", normalizer: "digits", poly: [[0.2,0.35],[0.35,0.35],[0.35,0.43],[0.2,0.43]] },
      { key: "idh", label: "IDH", required: true, compare: true, regex: "^\\d{5,8}$", sourceRegex: "^\\d{5,8}$", normalizer: "digits", minOverlap: 0.05, poly: [[0.2,0.44],[0.32,0.44],[0.32,0.52],[0.2,0.52]] }
    ]
  };
  const result = extractProfileFields([
    item("SEAT", .99, [[100,50],[300,50],[300,100],[100,100]]),
    item("969711916", .99, [[200,175],[350,175],[350,215],[200,215]]),
    item("41584", .99, [[210,220],[300,220],[300,260],[210,260]])
  ], profile, { width: 1000, height: 500 });
  assert.equal(result.fields.delivery_note.value, "969711916");
  assert.equal(result.fields.idh.value, "41584");
});

test("VW-IDH ist bei der kombinierten untersten Zeile immer die letzten 7 Ziffern", () => {
  const profile = {
    id: "VW", name: "VW", role: "vda", active: true,
    anchor: { aliases: ["Volkswagen Sachsen GmbH"], poly: [[0.1,0.1],[0.3,0.1],[0.3,0.18],[0.1,0.18]] },
    fields: [
      { key: "idh", label: "IDH", required: true, compare: true, regex: "^\\d{7}$", sourceRegex: "^(?:\\d{7}|\\d{7,8}\\s*\\d{7})$", normalizer: "last_digits", digits: 7, poly: [[0.55,0.72],[0.7,0.72],[0.7,0.8],[0.55,0.8]] }
    ]
  };
  for (const text of ["13023444 3103560", "130234443103560", "3103560"]) {
    const result = extractProfileFields([
      item("Volkswagen Sachsen GmbH", .99, [[100,50],[300,50],[300,90],[100,90]]),
      item(text, .99, [[300,360],[700,360],[700,400],[300,400]])
    ], profile, { width: 1000, height: 500 });
    assert.equal(result.fields.idh.value, "3103560", text);
    assert.equal(result.fields.idh.valid, true, text);
  }
});

test("Scania-Gewicht nimmt Netto rechts und nicht Gross oder Batch-Suffix", () => {
  const profile = {
    id: "SCANIA", name: "Scania", role: "vda", active: true,
    anchor: { aliases: ["SCANIA AB (PUBL)"], poly: [[0.1,0.1],[0.3,0.1],[0.3,0.18],[0.1,0.18]] },
    fields: [{
      key: "weight", label: "Gewicht", required: true, compare: true,
      regex: "^\\d+(?:[.,]\\d+)?(?:\\s*(?:KG|KGM|G|L|LTR))?$",
      sourceRegex: "^(?:\\d{1,4}(?:[.,]\\d+)?(?:\\s*(?:KG|KGM))?|\\d{1,4}(?:[.,]\\d+)?\\s*[/|I]\\s*\\d{1,4}(?:[.,]\\d+)?(?:\\s*(?:KG|KGM))?)$",
      normalizer: "net_weight", searchRadius: 1.2, minOverlap: 0.05,
      poly: [[0.75,0.50],[0.90,0.50],[0.90,0.60],[0.75,0.60]]
    }]
  };
  const anchor = item("SCANIA AB (PUBL)", .99, [[100,50],[300,50],[300,90],[100,90]]);
  const combined = extractProfileFields([
    anchor,
    item("1550 / 1300 KG", .99, [[650,250],[900,250],[900,300],[650,300]]),
    item("00001", .99, [[780,330],[870,330],[870,365],[780,365]])
  ], profile, { width: 1000, height: 500 });
  assert.equal(combined.fields.weight.value, "1300 KG");

  const separated = extractProfileFields([
    anchor,
    item("1550", .99, [[620,250],[735,250],[735,300],[620,300]]),
    item("1300 KG", .99, [[755,250],[900,250],[900,300],[755,300]]),
    item("00001", .99, [[780,330],[870,330],[870,365],[780,365]])
  ], profile, { width: 1000, height: 500 });
  assert.equal(separated.fields.weight.value, "1300 KG");
});

test("VW-Ankerbreite verändert bei scaleFrom height nicht den Profilmaßstab", () => {
  const profile = {
    id: "VW", name: "VW", role: "vda", active: true,
    anchor: {
      aliases: ["Volkswagen AG", "Volkswagen Sachsen GmbH"],
      scaleFrom: "height",
      poly: [[0.2,0.1],[0.6,0.1],[0.6,0.2],[0.2,0.2]]
    },
    fields: [
      { key: "delivery_note", label: "Lieferscheinnummer", required: false, compare: false,
        regex: "^\\d{7,12}$", sourceRegex: "^\\d{7,12}$", normalizer: "digits", minOverlap: 0.02,
        poly: [[0.2,0.4],[0.3,0.4],[0.3,0.5],[0.2,0.5]] }
    ]
  };
  const result = extractProfileFields([
    item("Volkswagen AG", .99, [[200,50],[380,50],[380,100],[200,100]]),
    item("13026260", .99, [[90,200],[190,200],[190,250],[90,250]])
  ], profile, { width: 1000, height: 500 });
  assert.equal(result.transform.scaleFrom, "height");
  assert.ok(Math.abs(result.transform.scale - 1) < 0.05, `unerwartete VW-Skalierung ${result.transform.scale}`);
  assert.equal(result.fields.delivery_note.value, "13026260");
});

test("Interne Lieferscheinnummer ignoriert passende Referenznummer oberhalb", () => {
  const profile = {
    id: "INTERN1", name: "Intern1", role: "vda", active: true,
    anchor: { aliases: ["Alte Materialnummer"], poly: [[0.2,0.2],[0.4,0.2],[0.4,0.3],[0.2,0.3]] },
    fields: [
      { key: "delivery_note", label: "Lieferscheinnummer", required: false, compare: false,
        regex: "^\\d{7,12}$", sourceRegex: "^\\d{7,12}$", normalizer: "digits",
        minOverlap: 0.02, searchRadius: 1.25,
        poly: [[0.6,0.55],[0.8,0.55],[0.8,0.62],[0.6,0.62]] }
    ]
  };
  const result = extractProfileFields([
    item("Alte Materialnummer", .99, [[200,100],[400,100],[400,150],[200,150]]),
    item("2008520842", .999, [[600,210],[800,210],[800,245],[600,245]]),
    item("1006539616 - 0001", .99, [[600,275],[840,275],[840,310],[600,310]])
  ], profile, { width: 1000, height: 500 });
  assert.equal(result.fields.delivery_note.value, "1006539616");
});

test("Scania-Netto darf knapp rechts neben der Sollbox liegen und gewinnt gegen Gross", () => {
  const profile = {
    id: "SCANIA", name: "Scania", role: "vda", active: true,
    anchor: { aliases: ["SCANIA AB (PUBL)"], poly: [[0.1,0.1],[0.3,0.1],[0.3,0.18],[0.1,0.18]] },
    fields: [{
      key: "weight", label: "Gewicht", required: true, compare: true,
      regex: "^\\d+(?:[.,]\\d+)?(?:\\s*(?:KG|KGM|G|L|LTR))?$",
      sourceRegex: "^(?:\\d{1,4}(?:[.,]\\d+)?(?:\\s*(?:KG|KGM))?|\\d{1,4}(?:[.,]\\d+)?\\s*[/|I]\\s*\\d{1,4}(?:[.,]\\d+)?(?:\\s*(?:KG|KGM))?)$",
      normalizer: "net_weight", searchRadius: 1.8, minOverlap: 0,
      preferRightmost: true, preferUnit: true,
      poly: [[0.70,0.50],[0.78,0.50],[0.78,0.60],[0.70,0.60]]
    }]
  };
  const result = extractProfileFields([
    item("SCANIA AB (PUBL)", .99, [[100,50],[300,50],[300,90],[100,90]]),
    item("1550", .999, [[650,250],[735,250],[735,300],[650,300]]),
    item("1300 KG", .98, [[790,250],[910,250],[910,300],[790,300]]),
    item("00001", .999, [[780,330],[870,330],[870,365],[780,365]])
  ], profile, { width: 1000, height: 500 });
  assert.equal(result.fields.weight.value, "1300 KG");
});

test("Locator bindet interne LSN an Transportauftrag statt Referenzbeleg", () => {
  const profile = {
    id: "INTERN1", name: "Intern1", role: "vda", active: true,
    anchor: { aliases: ["Alte Materialnummer"], poly: [[0.1,0.1],[0.3,0.1],[0.3,0.18],[0.1,0.18]] },
    fields: [{
      key: "delivery_note", label: "Lieferscheinnummer", required: false, compare: false,
      regex: "^\\d{7,12}$", sourceRegex: "^\\d{7,12}$", normalizer: "digits",
      locator: { aliases: ["Transportauftrag - Position"], direction: "below", maxDistance: 4.5, strict: true },
      poly: [[0.6,0.55],[0.8,0.55],[0.8,0.62],[0.6,0.62]]
    }]
  };
  const result = extractProfileFields([
    item("Alte Materialnummer", .99, [[100,50],[300,50],[300,90],[100,90]]),
    item("Referenzbeleg", .99, [[600,180],[760,180],[760,200],[600,200]]),
    item("2008801748", .999, [[600,205],[760,205],[760,230],[600,230]]),
    item("Transportauftrag - Position", .99, [[600,245],[850,245],[850,268],[600,268]]),
    item("1006753383 - 0006", .995, [[600,275],[850,275],[850,305],[600,305]])
  ], profile, { width: 1000, height: 500 });
  assert.equal(result.fields.delivery_note.value, "1006753383");
  assert.equal(result.fields.delivery_note.source, "ocr-locator");
  assert.equal(result.fields.delivery_note.raw, "1006753383");
});

test("VW-Locator liest Delivery Note, Netto, Batch und letzte 7 IDH-Ziffern semantisch", () => {
  const profile = {
    id: "VW", name: "VW", role: "vda", active: true,
    anchor: { aliases: ["Volkswagen", "Volkswagen AG"], scaleFrom: "height", alignFrom: "left", poly: [[0.2,0.1],[0.6,0.1],[0.6,0.2],[0.2,0.2]] },
    fields: [
      { key: "delivery_note", label: "Lieferscheinnummer", required: false, compare: false,
        regex: "^\\d{7,12}$", sourceRegex: "^\\d{7,12}$", normalizer: "digits",
        locator: { aliases: ["Delivery note"], direction: "below", maxDistance: 5.5, strict: true },
        poly: [[0.1,0.3],[0.2,0.3],[0.2,0.35],[0.1,0.35]] },
      { key: "idh", label: "IDH", required: true, compare: true,
        regex: "^\\d{7}$", sourceRegex: "^(?:\\d{7,8}|\\d{7,10}\\s+\\d{7,8}|\\d{14,18})$", normalizer: "last_digits", digits: 7,
        locator: { aliases: ["Delivery number / IDH"], direction: "below", maxDistance: 8, preferRightmost: true, strict: true },
        poly: [[0.2,0.75],[0.5,0.75],[0.5,0.82],[0.2,0.82]] },
      { key: "batch", label: "Batch", required: true, compare: true,
        regex: "^D\\d{8,10}$", sourceRegex: "^D\\d{8,10}(?:\\s*[/|I1]\\s*\\d{4})?$", normalizer: "batch",
        locator: { aliases: ["Batch Nr"], direction: "below_or_right", maxDistance: 6, preferBatch: true, strict: true },
        poly: [[0.7,0.65],[0.85,0.65],[0.85,0.7],[0.7,0.7]] },
      { key: "weight", label: "Gewicht", required: true, compare: true,
        regex: "^\\d+(?:[.,]\\d+)?(?:\\s*(?:KG|KGM|G|L|LTR))?$",
        sourceRegex: "^(?:\\d+(?:[.,]\\d+)?(?:\\s*(?:KG|KGM|G|L|LTR))?|\\d+(?:[.,]\\d+)?\\s*[/|I]\\s*\\d+(?:[.,]\\d+)?(?:\\s*(?:KG|KGM|G|L|LTR))?)$",
        normalizer: "net_weight",
        locator: { aliases: ["Gross / Net weight"], direction: "below_or_right", maxDistance: 6, preferRightmost: true, preferUnit: true, strict: true },
        poly: [[0.7,0.45],[0.9,0.45],[0.9,0.5],[0.7,0.5]] }
    ]
  };
  const result = extractProfileFields([
    item("Volkswagen Navarra S.A.", .99, [[200,50],[430,50],[430,100],[200,100]]),
    item("Supplier ID", .99, [[90,135],[180,135],[180,155],[90,155]]),
    item("0015386600", .999, [[90,158],[210,158],[210,182],[90,182]]),
    item("Delivery note", .99, [[90,190],[205,190],[205,212],[90,212]]),
    item("970014634", .998, [[100,218],[220,218],[220,245],[100,245]]),
    item("Gross / Net weight", .99, [[650,245],[820,245],[820,265],[650,265]]),
    item("1400 / 1150 KG", .995, [[650,270],[850,270],[850,300],[650,300]]),
    item("Batch Nr", .99, [[650,320],[725,320],[725,340],[650,340]]),
    item("D561900936", .999, [[730,318],[875,318],[875,345],[730,345]]),
    item("Delivery number / IDH", .99, [[100,365],[300,365],[300,388],[100,388]]),
    item("970014634 26711186", .999, [[110,398],[480,398],[480,432],[110,432]])
  ], profile, { width: 1000, height: 500 });
  assert.equal(result.fields.delivery_note.value, "970014634");
  assert.equal(result.fields.weight.value, "1150 KG");
  assert.equal(result.fields.batch.value, "D561900936");
  assert.equal(result.fields.idh.value, "6711186");
  for (const key of ["delivery_note", "weight", "batch", "idh"]) {
    assert.equal(result.fields[key].source, "ocr-locator", key);
  }
});

test("VW alignFrom left verhindert horizontale Verschiebung bei unterschiedlich langen Ankern", () => {
  const profile = {
    id: "VW", name: "VW", role: "vda", active: true,
    anchor: { aliases: ["Volkswagen"], scaleFrom: "height", alignFrom: "left", poly: [[0.2,0.1],[0.6,0.1],[0.6,0.2],[0.2,0.2]] },
    fields: []
  };
  const result = extractProfileFields([
    item("Volkswagen Navarra S.A.", .99, [[200,50],[430,50],[430,100],[200,100]])
  ], profile, { width: 1000, height: 500 });
  assert.equal(result.transform.alignFrom, "left");
  assert.deepEqual(result.transform.refCenter.map(Math.round), [200, 75]);
  assert.deepEqual(result.transform.liveCenter.map(Math.round), [200, 75]);
});


test("Interne LSN funktioniert auch wenn Beschriftung und Wert in derselben OCR-Zeile liegen", () => {
  const profile = {
    id: "INTERN2", name: "Intern2", role: "vda", active: true,
    anchor: { aliases: ["Prüflos"], localizeAlias: true, poly: [[0.6,0.2],[0.7,0.2],[0.7,0.25],[0.6,0.25]] },
    fields: [{
      key: "delivery_note", label: "Lieferscheinnummer", required: false, compare: false,
      regex: "^\\d{7,12}$", sourceRegex: "^\\d{7,12}$", normalizer: "digits",
      locator: { aliases: ["Transportauftrag - Position"], direction: "below_or_right", maxDistance: 6.5, strict: true },
      poly: [[0.6,0.5],[0.8,0.5],[0.8,0.56],[0.6,0.56]]
    }]
  };
  const result = extractProfileFields([
    item("Prüflos", .99, [[600,100],[700,100],[700,125],[600,125]]),
    item("Referenzbeleg 2008737224", .99, [[600,170],[850,170],[850,195],[600,195]]),
    item("Transportauftrag - Position 1006727978 - 0003", .995, [[600,220],[970,220],[970,250],[600,250]])
  ], profile, { width: 1000, height: 500 });
  assert.equal(result.fields.delivery_note.value, "1006727978");
  assert.equal(result.fields.delivery_note.source, "ocr-locator");
});

test("VW LSN und IDH werden aus derselben großen unteren Zeile getrennt", () => {
  const profile = {
    id: "VW", name: "VW", role: "vda", active: true,
    anchor: { aliases: ["Volkswagen AG"], scaleFrom: "height", alignFrom: "left", poly: [[0.2,0.1],[0.5,0.1],[0.5,0.18],[0.2,0.18]] },
    fields: [
      { key: "delivery_note", label: "Lieferscheinnummer", required: false, compare: false,
        regex: "^\\d{7,12}$", sourceRegex: "^(?:\\d{7,10}|\\d{7,10}\\s+\\d{7,8}|\\d{14,18})$",
        normalizer: "leading_delivery_digits", tailDigits: 7, combinedMinDigits: 14,
        locator: { aliases: ["Delivery number / IDH"], direction: "below_or_right", maxDistance: 8, preferLeftmost: true, strict: true },
        poly: [[0.1,0.7],[0.25,0.7],[0.25,0.78],[0.1,0.78]] },
      { key: "idh", label: "IDH", required: true, compare: true,
        regex: "^\\d{7}$", sourceRegex: "^(?:\\d{7,10}|\\d{7,10}\\s+\\d{7,8}|\\d{14,18})$",
        normalizer: "last_digits", digits: 7,
        locator: { aliases: ["Delivery number / IDH"], direction: "below_or_right", maxDistance: 8, preferRightmost: true, strict: true },
        poly: [[0.25,0.7],[0.45,0.7],[0.45,0.78],[0.25,0.78]] }
    ]
  };
  const result = extractProfileFields([
    item("Volkswagen AG", .99, [[200,50],[380,50],[380,90],[200,90]]),
    item("Delivery number / IDH", .99, [[90,340],[250,340],[250,365],[90,365]]),
    item("13026260 2892944", .999, [[100,375],[430,375],[430,415],[100,415]])
  ], profile, { width: 1000, height: 500 });
  assert.equal(result.fields.delivery_note.value, "13026260");
  assert.equal(result.fields.idh.value, "2892944");
});

test("VW LSN trennt auch eine zusammengeklebte untere Ziffernfolge", () => {
  assert.equal(normalizeFieldValue("delivery_note", "130262602892944", {
    normalizer: "leading_delivery_digits", tailDigits: 7, combinedMinDigits: 14
  }), "13026260");
});

test("VW Netto-Fallback findet Brutto-Netto-Paar auch ohne kleine Feldbeschriftung", () => {
  const profile = {
    id: "VW", name: "VW", role: "vda", active: true,
    anchor: { aliases: ["Volkswagen AG"], scaleFrom: "height", alignFrom: "left", poly: [[0.2,0.1],[0.5,0.1],[0.5,0.18],[0.2,0.18]] },
    fields: [{
      key: "weight", label: "Gewicht", required: true, compare: true,
      regex: "^\\d+(?:[.,]\\d+)?(?:\\s*(?:KG|KGM|G|L|LTR))?$",
      sourceRegex: "^(?:\\d+(?:[.,]\\d+)?(?:\\s*(?:KG|KGM|G|L|LTR))?|\\d+(?:[.,]\\d+)?\\s*[/|I]\\s*\\d+(?:[.,]\\d+)?(?:\\s*(?:KG|KGM|G|L|LTR))?)$",
      normalizer: "net_weight", fallbackStrategy: "net_pair",
      locator: { aliases: ["Gross / Net weight"], direction: "below_or_right", maxDistance: 7, preferRightmost: true, preferUnit: true, strict: true },
      poly: [[0.7,0.45],[0.9,0.45],[0.9,0.5],[0.7,0.5]]
    }]
  };
  const result = extractProfileFields([
    item("Volkswagen AG", .99, [[200,50],[380,50],[380,90],[200,90]]),
    item("Quantity", .99, [[650,140],[720,140],[720,160],[650,160]]),
    item("1150 KGM", .999, [[730,140],[850,140],[850,165],[730,165]]),
    item("1400 / 1150 KG", .98, [[650,260],[850,260],[850,290],[650,290]])
  ], profile, { width: 1000, height: 500 });
  assert.equal(result.fields.weight.value, "1150 KG");
  assert.equal(result.fields.weight.source, "ocr-pattern");
});

test("Scania akzeptiert allein nur Gewicht mit K oder KG", () => {
  const profile = {
    id: "SCANIA", name: "Scania", role: "vda", active: true,
    anchor: { aliases: ["SCANIA AB (PUBL)"], poly: [[0.1,0.1],[0.3,0.1],[0.3,0.18],[0.1,0.18]] },
    fields: [{
      key: "weight", label: "Gewicht", required: true, compare: true,
      regex: "^\\d+(?:[.,]\\d+)?\\s*KG$",
      sourceRegex: "^(?:\\d{1,4}(?:[.,]\\d+)?\\s*K(?:G)?|\\d{1,4}(?:[.,]\\d+)?\\s*[/|I]\\s*\\d{1,4}(?:[.,]\\d+)?\\s*K(?:G)?)$",
      normalizer: "net_weight", searchRadius: 1.8, minOverlap: 0,
      preferRightmost: true, preferUnit: true,
      poly: [[0.66,0.50],[0.90,0.50],[0.90,0.60],[0.66,0.60]]
    }]
  };
  const result = extractProfileFields([
    item("SCANIA AB (PUBL)", .99, [[100,50],[300,50],[300,90],[100,90]]),
    item("1550", .9999, [[660,250],[760,250],[760,300],[660,300]]),
    item("1300 K", .91, [[770,250],[900,250],[900,300],[770,300]])
  ], profile, { width: 1000, height: 500 });
  assert.equal(result.fields.weight.value, "1300 KG");
  assert.equal(result.fields.weight.valid, true);
});


test("Scania setzt getrennte OCR-Boxen 1300 + KG zum Nettogewicht zusammen", () => {
  const profile = {
    id: "SCANIA", name: "Scania", role: "vda", active: true,
    anchor: { aliases: ["SCANIA AB (PUBL)"], poly: [[0.1,0.1],[0.3,0.1],[0.3,0.18],[0.1,0.18]] },
    fields: [{
      key: "weight", label: "Gewicht", required: true, compare: true,
      regex: "^\\d+(?:[.,]\\d+)?\\s*KG$",
      sourceRegex: "^(?:\\d{1,4}(?:[.,]\\d+)?\\s*K(?:G)?|\\d{1,4}(?:[.,]\\d+)?\\s*[/|I]\\s*\\d{1,4}(?:[.,]\\d+)?\\s*K(?:G)?)$",
      normalizer: "net_weight", searchRadius: 1.8, minOverlap: 0,
      preferRightmost: true, preferUnit: true,
      poly: [[0.66,0.50],[0.90,0.50],[0.90,0.60],[0.66,0.60]]
    }]
  };
  const result = extractProfileFields([
    item("SCANIA AB (PUBL)", .99, [[100,50],[300,50],[300,90],[100,90]]),
    item("1550", .999, [[650,250],[735,250],[735,295],[650,295]]),
    item("/", .95, [[742,250],[758,250],[758,295],[742,295]]),
    item("1300", .94, [[770,250],[845,250],[845,295],[770,295]]),
    item("KG", .91, [[852,250],[900,250],[900,295],[852,295]])
  ], profile, { width: 1000, height: 500 });
  assert.equal(result.fields.weight.value, "1300 KG");
  assert.equal(result.fields.weight.valid, true);
  assert.equal(result.fields.weight.source, "ocr-scania-net");
});

test("Scania extrahiert aus kompletter Gross-Net-Zeile nur den Wert mit KG", () => {
  const profile = {
    id: "SCANIA", name: "Scania", role: "vda", active: true,
    anchor: { aliases: ["SCANIA AB (PUBL)"], poly: [[0.1,0.1],[0.3,0.1],[0.3,0.18],[0.1,0.18]] },
    fields: [{
      key: "weight", label: "Gewicht", required: true, compare: true,
      regex: "^\\d+(?:[.,]\\d+)?\\s*KG$", normalizer: "net_weight",
      poly: [[0.66,0.50],[0.90,0.50],[0.90,0.60]]
    }]
  };
  const result = extractProfileFields([
    item("SCANIA AB (PUBL)", .99, [[100,50],[300,50],[300,90],[100,90]]),
    item("1550 / 1300 KG", .95, [[650,250],[900,250],[900,300],[650,300]])
  ], profile, { width: 1000, height: 500 });
  assert.equal(result.fields.weight.value, "1300 KG");
  assert.equal(result.fields.weight.valid, true);
});

test("Scania findet Netto auch wenn die Sollbox oberhalb der echten Gross-Net-Zeile liegt", () => {
  const profile = {
    id: "SCANIA", name: "Scania", role: "vda", active: true,
    anchor: { aliases: ["SCANIA AB (PUBL)"], poly: [[0.1,0.1],[0.3,0.1],[0.3,0.18],[0.1,0.18]] },
    fields: [{
      key: "weight", label: "Gewicht", required: true, compare: true,
      regex: "^\\d+(?:[.,]\\d+)?\\s*KG$",
      sourceRegex: "^(?:\\d{1,4}(?:[.,]\\d+)?\\s*K(?:G)?|\\d{1,4}(?:[.,]\\d+)?\\s*[/|I]\\s*\\d{1,4}(?:[.,]\\d+)?\\s*K(?:G)?)$",
      normalizer: "net_weight",
      // Absichtlich deutlich zu hoch gesetzte Sollbox wie auf dem Live-Screenshot.
      poly: [[0.66,0.38],[0.90,0.38],[0.90,0.44],[0.66,0.44]]
    }]
  };
  const result = extractProfileFields([
    item("SCANIA AB (PUBL)", .99, [[100,50],[300,50],[300,90],[100,90]]),
    item("1550 / 1300 KG", .95, [[650,310],[910,310],[910,355],[650,355]])
  ], profile, { width: 1000, height: 500 });
  assert.equal(result.fields.weight.value, "1300 KG");
  assert.equal(result.fields.weight.source, "ocr-scania-net");
});

test("VW liest LSN und IDH direkt aus der großen unteren Zeile ohne Beschriftung", () => {
  const baseField = {
    sourceRegex: "^(?:\\d{7,10}\\s+\\d{7}|\\d{14,17})$",
    strategy: "vw_delivery_pair"
  };
  const profile = {
    id: "VW", name: "VW", role: "vda", active: true,
    anchor: { aliases: ["Volkswagen AG"], scaleFrom: "height", alignFrom: "left", poly: [[0.2,0.1],[0.5,0.1],[0.5,0.18],[0.2,0.18]] },
    fields: [
      { ...baseField, key: "delivery_note", label: "Lieferscheinnummer", required: false, compare: false,
        regex: "^\\d{7,12}$", normalizer: "leading_delivery_digits", tailDigits: 7, combinedMinDigits: 14,
        poly: [[0.1,0.35],[0.25,0.35],[0.25,0.42],[0.1,0.42]] },
      { ...baseField, key: "idh", label: "IDH", required: true, compare: true,
        regex: "^\\d{7}$", normalizer: "last_digits", digits: 7,
        poly: [[0.15,0.72],[0.55,0.72],[0.55,0.80],[0.15,0.80]] }
    ]
  };
  const result = extractProfileFields([
    item("Volkswagen AG", .99, [[200,50],[380,50],[380,90],[200,90]]),
    item("0002303800", .999, [[80,165],[210,165],[210,190],[80,190]]),
    item("(6J) UN 333361199 000100613", .999, [[80,290],[540,290],[540,330],[80,330]]),
    item("13014402 2503891", .995, [[100,390],[470,390],[470,440],[100,440]])
  ], profile, { width: 1000, height: 500 });
  assert.equal(result.fields.delivery_note.value, "13014402");
  assert.equal(result.fields.idh.value, "2503891");
  assert.equal(result.fields.delivery_note.source, "ocr-vw-pair");
  assert.equal(result.fields.idh.source, "ocr-vw-pair");
});

test("VW Kombizeile funktioniert auch bei getrennten OCR-Boxen", () => {
  const profile = {
    id: "VW", name: "VW", role: "vda", active: true,
    anchor: { aliases: ["Volkswagen AG"], scaleFrom: "height", alignFrom: "left", poly: [[0.2,0.1],[0.5,0.1],[0.5,0.18],[0.2,0.18]] },
    fields: [
      { key: "delivery_note", label: "Lieferscheinnummer", regex: "^\\d{7,12}$", sourceRegex: "^(?:\\d{7,10}\\s+\\d{7}|\\d{14,17})$", normalizer: "leading_delivery_digits", tailDigits: 7, combinedMinDigits: 14, strategy: "vw_delivery_pair", poly: [[0.1,0.35],[0.25,0.35],[0.25,0.42],[0.1,0.42]] },
      { key: "idh", label: "IDH", regex: "^\\d{7}$", sourceRegex: "^(?:\\d{7,10}\\s+\\d{7}|\\d{14,17})$", normalizer: "last_digits", digits: 7, strategy: "vw_delivery_pair", poly: [[0.15,0.72],[0.55,0.72],[0.55,0.80],[0.15,0.80]] }
    ]
  };
  const result = extractProfileFields([
    item("Volkswagen AG", .99, [[200,50],[380,50],[380,90],[200,90]]),
    item("13012900", .99, [[100,390],[270,390],[270,440],[100,440]]),
    item("2822940", .98, [[285,390],[440,390],[440,440],[285,440]])
  ], profile, { width: 1000, height: 500 });
  assert.equal(result.fields.delivery_note.value, "13012900");
  assert.equal(result.fields.idh.value, "2822940");
});

test("VW Gewicht nimmt Quantity mit KGM/LTR und ignoriert Gross-Net-KG", () => {
  const profile = {
    id: "VW", name: "VW", role: "vda", active: true,
    anchor: { aliases: ["Volkswagen AG"], scaleFrom: "height", alignFrom: "left", poly: [[0.2,0.1],[0.5,0.1],[0.5,0.18],[0.2,0.18]] },
    fields: [{
      key: "weight", label: "Gewicht", required: true, compare: true,
      regex: "^\\d+(?:[.,]\\d+)?(?:\\s*(?:KG|KGM|G|L|LTR))?$",
      sourceRegex: "^\\d+(?:[.,]\\d+)?\\s*(?:KGM|LTR)$",
      normalizer: "weight", strategy: "quantity_weight", searchRadius: 2.2,
      poly: [[0.70,0.30],[0.90,0.30],[0.90,0.38],[0.70,0.38]]
    }]
  };
  const result = extractProfileFields([
    item("Volkswagen AG", .99, [[200,50],[380,50],[380,90],[200,90]]),
    item("18600 KGM", .96, [[700,150],[880,150],[880,185],[700,185]]),
    item("18600 / 18600 KG", .999, [[650,260],[900,260],[900,300],[650,300]])
  ], profile, { width: 1000, height: 500 });
  assert.equal(result.fields.weight.value, "18600 KG");
  assert.equal(result.fields.weight.source, "ocr-quantity");
});

test("VW Quantity-Gewicht verbindet getrennte Zahl und KGM-Einheit", () => {
  const profile = {
    id: "VW", name: "VW", role: "vda", active: true,
    anchor: { aliases: ["Volkswagen AG"], scaleFrom: "height", alignFrom: "left", poly: [[0.2,0.1],[0.5,0.1],[0.5,0.18],[0.2,0.18]] },
    fields: [{
      key: "weight", label: "Gewicht", required: true, compare: true,
      regex: "^\\d+(?:[.,]\\d+)?(?:\\s*(?:KG|KGM|G|L|LTR))?$",
      sourceRegex: "^\\d+(?:[.,]\\d+)?\\s*(?:KGM|LTR)$",
      normalizer: "weight", strategy: "quantity_weight", searchRadius: 2.2,
      poly: [[0.70,0.30],[0.90,0.30],[0.90,0.38],[0.70,0.38]]
    }]
  };
  const result = extractProfileFields([
    item("Volkswagen AG", .99, [[200,50],[380,50],[380,90],[200,90]]),
    item("1150", .99, [[700,150],[790,150],[790,185],[700,185]]),
    item("KGM", .98, [[800,150],[860,150],[860,185],[800,185]]),
    item("1400 / 1150 KG", .999, [[650,260],[900,260],[900,300],[650,300]])
  ], profile, { width: 1000, height: 500 });
  assert.equal(result.fields.weight.value, "1150 KG");
  assert.equal(result.fields.weight.valid, true);
});

test("Scania Gross/Net funktioniert auch wenn OCR die Einheit als K6 liest", () => {
  const profile = {
    id: "SCANIA", name: "Scania", role: "vda", active: true,
    anchor: { aliases: ["SCANIA AB (PUBL)"], poly: [[0.1,0.1],[0.3,0.1],[0.3,0.18],[0.1,0.18]] },
    fields: [{
      key: "weight", label: "Gewicht", required: true, compare: true,
      regex: "^\\d+(?:[.,]\\d+)?\\s*KG$", normalizer: "net_weight",
      poly: [[0.66,0.38],[0.90,0.38],[0.90,0.44],[0.66,0.44]]
    }]
  };
  const result = extractProfileFields([
    item("SCANIA AB (PUBL)", .99, [[100,50],[300,50],[300,90],[100,90]]),
    item("1550 / 1300 K6", .95, [[650,310],[910,310],[910,355],[650,355]])
  ], profile, { width: 1000, height: 500 });
  assert.equal(result.fields.weight.value, "1300 KG");
  assert.equal(result.fields.weight.valid, true);
});

test("Scania Gross/Net nimmt rechten Wert auch wenn OCR die Einheit komplett verliert", () => {
  const profile = {
    id: "SCANIA", name: "Scania", role: "vda", active: true,
    anchor: { aliases: ["SCANIA AB (PUBL)"], poly: [[0.1,0.1],[0.3,0.1],[0.3,0.18],[0.1,0.18]] },
    fields: [{
      key: "weight", label: "Gewicht", required: true, compare: true,
      regex: "^\\d+(?:[.,]\\d+)?\\s*KG$", normalizer: "net_weight",
      poly: [[0.66,0.38],[0.90,0.38],[0.90,0.44],[0.66,0.44]]
    }]
  };
  const result = extractProfileFields([
    item("SCANIA AB (PUBL)", .99, [[100,50],[300,50],[300,90],[100,90]]),
    item("1550", .99, [[650,310],[740,310],[740,355],[650,355]]),
    item("/", .95, [[748,310],[765,310],[765,355],[748,355]]),
    item("1300", .96, [[775,310],[860,310],[860,355],[775,355]])
  ], profile, { width: 1000, height: 500 });
  assert.equal(result.fields.weight.value, "1300 KG");
  assert.equal(result.fields.weight.source, "ocr-scania-pair");
  assert.equal(result.fields.weight.valid, true);
});


test("Henkel-Fassnummer kann nicht als Produktgewicht verwendet werden", () => {
  const henkel = structuredClone(product);
  henkel.id = "HENKEL";
  const withoutWeight = productItems.filter((entry) => entry.text !== "25 KG" && entry.text !== "10001" && entry.text !== "D562900431");
  withoutWeight.push(item("D562900431 /0007", .99, [[858,404],[1155,399],[1155,437],[858,437]]));
  const result = extractProfileFields(withoutWeight, henkel, { width: 1800, height: 1013 });
  assert.equal(result.fields.drum_number.value, "0007");
  assert.equal(result.fields.weight.value, "");
  assert.equal(result.fields.weight.valid, false);
});

test("Henkel-Produktgewicht verlangt Einheit und bleibt trotz Fassnummer korrekt", () => {
  const henkel = structuredClone(product);
  henkel.id = "HENKEL";
  const withDrum = productItems.filter((entry) => entry.text !== "10001" && entry.text !== "D562900431");
  withDrum.push(item("D562900431 /0007", .99, [[858,404],[1155,399],[1155,437],[858,437]]));
  const result = extractProfileFields(withDrum, henkel, { width: 1800, height: 1013 });
  assert.equal(result.fields.drum_number.value, "0007");
  assert.equal(result.fields.weight.value, "25 KG");
  assert.equal(result.fields.weight.valid, true);
});

test("Henkel-Produktgewicht verbindet getrennte Zahl- und Einheitsbox", () => {
  const henkel = structuredClone(product);
  henkel.id = "HENKEL";
  const split = productItems.filter((entry) => entry.text !== "25 KG" && entry.text !== "10001" && entry.text !== "D562900431");
  split.push(item("D562900431 /0007", .99, [[858,404],[1155,399],[1155,437],[858,437]]));
  split.push(item("25", .97, [[1004,333],[1090,329],[1092,380],[1005,384]]));
  split.push(item("KG", .96, [[1095,333],[1157,329],[1159,380],[1095,384]]));
  const result = extractProfileFields(split, henkel, { width: 1800, height: 1013 });
  assert.equal(result.fields.weight.value, "25 KG");
  assert.equal(result.fields.drum_number.value, "0007");
});


test("Freigabe hängt nur von Batch ab, nicht von IDH oder Gewicht", () => {
  const left = { fields: {
    batch: { value: "D562808695", valid: true, required: true, compare: true },
    idh: { value: "1111111", valid: true, required: true, compare: true },
    weight: { value: "25 KG", valid: true, required: true, compare: true }
  }};
  const right = { fields: {
    batch: { value: "D562808695", valid: true, required: true, compare: true },
    idh: { value: "9999999", valid: true, required: true, compare: true },
    weight: { value: "1300 KG", valid: true, required: true, compare: true }
  }};
  const comparison = compareExtractions(left, right);
  assert.equal(comparison.status, "released");
  assert.deepEqual(comparison.rows.map((row) => row.key), ["batch"]);
});

test("Fehlende IDH und fehlendes Gewicht blockieren die Batch-Freigabe nicht", () => {
  const left = { fields: { batch: { value: "D562808695", valid: true, required: true, compare: true } }};
  const right = { fields: { batch: { value: "D562808695", valid: true, required: true, compare: true } }};
  const comparison = compareExtractions(left, right);
  assert.equal(comparison.status, "released");
});
