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
  assert.deepEqual(comparison.rows.map((row) => row.key), ["batch", "weight"]);
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
