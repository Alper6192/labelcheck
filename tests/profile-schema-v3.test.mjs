import test from "node:test";
import assert from "node:assert/strict";
import { normalizeProfileConfig } from "../src/profile-schema.js";

test("Schema v3 erhält erweiterte OCR-Strategie-, Locator- und Erkennungsparameter", () => {
  const normalized = normalizeProfileConfig({
    profiles: [{
      id: "GENERIC", name: "Generic", role: "vda", active: true,
      source: { type: "ocr" },
      detection: { evidenceAliases: ["A"], minEvidenceMatches: 1, excludeAliases: ["B"], minScore: 0.41 },
      validation: { minAnchorScore: 0.47, requiredValidFields: ["batch", "weight"], errorMessage: "Bitte prüfen" },
      anchor: {
        aliases: ["ANCHOR"], localizeAlias: true, scaleFrom: "height", alignFrom: "left",
        poly: [[.1,.1],[.2,.1],[.2,.2],[.1,.2]],
        fallbacks: [{ aliases: ["ALT"], localizeAlias: true, scaleFrom: "width", alignFrom: "center", poly: [[.2,.2],[.3,.2],[.3,.3],[.2,.3]] }]
      },
      fields: [{
        key: "weight", label: "Gewicht", required: true, compare: true,
        regex: "^\\d+ KG$", sourceRegex: "^\\d+ KG$", normalizer: "weight",
        strategy: "quantity_weight", fallbackStrategy: "net_pair", strategyUnits: ["KGM", "LTR"],
        searchRadius: 2.2, minOverlap: 0.03, preferRightmost: true, preferUnit: true,
        pairLeftMinDigits: 7, pairLeftMaxDigits: 10, tailDigits: 7, combinedMinDigits: 14,
        locator: { aliases: ["Quantity"], direction: "below_or_right", maxDistance: 5.5, minAliasScore: .74, strict: true, preferRightmost: true, preferUnit: true },
        poly: [[.6,.4],[.8,.4],[.8,.5],[.6,.5]]
      }]
    }]
  }, "0.17.1");

  const profile = normalized.profiles[0];
  assert.equal(normalized.schemaVersion, 3);
  assert.equal(profile.detection.minScore, 0.41);
  assert.equal(profile.validation.minAnchorScore, 0.47);
  assert.equal(profile.anchor.localizeAlias, true);
  assert.equal(profile.anchor.scaleFrom, "height");
  assert.equal(profile.anchor.alignFrom, "left");
  assert.equal(profile.anchor.fallbacks.length, 1);
  const field = profile.fields[0];
  assert.equal(field.strategy, "quantity_weight");
  assert.equal(field.fallbackStrategy, "net_pair");
  assert.deepEqual(field.strategyUnits, ["KGM", "LTR"]);
  assert.equal(field.pairLeftMinDigits, 7);
  assert.equal(field.pairLeftMaxDigits, 10);
  assert.equal(field.tailDigits, 7);
  assert.equal(field.combinedMinDigits, 14);
  assert.equal(field.locator.minAliasScore, 0.74);
  assert.equal(field.locator.strict, true);
});

test("Schema v3 erhält QR-Suchbereiche und frei definierte Parserregeln", () => {
  const normalized = normalizeProfileConfig({ profiles: [{
    id: "QR_GENERIC", name: "QR Generic", role: "vda", active: true,
    source: {
      type: "qr",
      regions: [{ x: .1, y: .2, width: .3, height: .4 }, { x: 0, y: .5, width: .6, height: .5 }],
      parser: {
        requiredFields: ["batch", "weight"],
        fields: {
          batch: { primaryRegex: "B:(D\\d+)", primaryGroup: 1, template: "{primary}", replacements: [] },
          weight: { primaryRegex: "Q:(\\d+)", primaryGroup: 1, secondaryRegex: "U:(KG)", secondaryGroup: 1, secondaryDefault: "KG", template: "{primary} {secondary}", replacements: [{ from: "KGM", to: "KG" }] }
        }
      }
    },
    detection: {}, validation: { requiredValidFields: ["batch"] }, anchor: { aliases: [], poly: [] },
    fields: [
      { key: "batch", label: "Batch", required: true, compare: true, regex: "^D\\d+$", sourceRegex: "^D\\d+$", normalizer: "batch", poly: [] },
      { key: "weight", label: "Gewicht", required: true, compare: true, regex: "^\\d+ KG$", sourceRegex: "^\\d+ KG$", normalizer: "weight", poly: [] }
    ]
  }] }, "0.17.1");

  const source = normalized.profiles[0].source;
  assert.equal(source.type, "qr");
  assert.equal(source.regions.length, 2);
  assert.deepEqual(source.parser.requiredFields, ["batch", "weight"]);
  assert.equal(source.parser.fields.weight.secondaryDefault, "KG");
  assert.deepEqual(source.parser.fields.weight.replacements, [{ from: "KGM", to: "KG" }]);
});
