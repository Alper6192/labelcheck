import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FIELD_PRESETS, normalizeProfileConfig, validateRegex } from "../src/profile-schema.js";

const configUrl = new URL("../public/config/label-profiles.json", import.meta.url);

function readConfig() {
  const text = fs.readFileSync(configUrl, "utf8");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`public/config/label-profiles.json ist kein gültiges JSON: ${error.message}`);
  }
}

test("Produktive label-profiles.json ist lesbar und enthält ein Profilarray", () => {
  const raw = readConfig();
  assert.ok(Array.isArray(raw.profiles), "Die Eigenschaft profiles muss ein Array sein.");
  const normalized = normalizeProfileConfig(raw, String(raw.appVersion || ""));
  assert.equal(normalized.profiles.length, raw.profiles.length);
});

test("Profil-IDs sind vorhanden und eindeutig", () => {
  const raw = readConfig();
  const ids = raw.profiles.map((profile, index) => {
    const id = String(profile?.id || "").trim();
    assert.ok(id, `Profil ${index + 1} besitzt keine Profil-ID.`);
    return id;
  });
  assert.equal(new Set(ids).size, ids.length, "Profil-IDs dürfen nicht doppelt vorkommen.");
});

test("Exportierte Feldregeln verwenden bekannte Felder und gültige reguläre Ausdrücke", () => {
  const raw = readConfig();
  for (const profile of raw.profiles) {
    for (const field of Array.isArray(profile?.fields) ? profile.fields : []) {
      assert.ok(FIELD_PRESETS[field?.key], `Unbekanntes Feld ${field?.key} in Profil ${profile?.id}.`);
      for (const property of ["regex", "sourceRegex"]) {
        const result = validateRegex(field?.[property]);
        assert.ok(result.valid, `${profile?.id}/${field?.key}: ${property} ist ungültig: ${result.message}`);
      }
    }
  }
});

test("Aktuelle Nutzerkonfiguration enthält die zuletzt angelegten Profile", () => {
  const raw = readConfig();
  const ids = new Set(raw.profiles.map((profile) => profile.id));
  for (const id of ["STELLANTIS", "MERCEDES", "HENKEL", "BMW", "SCANIA", "VW", "INTERN1", "INTERN2", "TESLA"]) {
    assert.ok(ids.has(id), `Aktuelles Profil ${id} fehlt.`);
  }
});

test("Intern1 verwendet den vollständigen Anker Alte Materialnummer", () => {
  const raw = readConfig();
  const profile = raw.profiles.find((entry) => entry.id === "INTERN1");
  assert.deepEqual(profile?.anchor?.aliases, ["Alte Materialnummer"]);
});

test("Scania-Batch akzeptiert Doppelpunkt-Suffix im OCR-Rohtext", () => {
  const raw = readConfig();
  const profile = raw.profiles.find((entry) => entry.id === "SCANIA");
  const field = profile?.fields?.find((entry) => entry.key === "batch");
  assert.equal(new RegExp(field.sourceRegex, "i").test("D561001475 :00001"), true);
});


test("Tesla-Profil verwendet den QR-Parser und benötigt keine IDH", () => {
  const raw = readConfig();
  const profile = raw.profiles.find((entry) => entry.id === "TESLA");
  assert.equal(profile?.source?.type, "qr");
  assert.equal(profile?.source?.parser, "tesla");
  assert.equal(profile?.source?.region, "lower-left");
  assert.equal(profile?.fields?.some((field) => field.key === "idh"), false);
  assert.equal(profile?.fields?.find((field) => field.key === "delivery_note")?.required, true);
});

test("Intern2 nutzt Prüflos und Inspection Lot als Anker und schließt Alte Materialnummer aus", () => {
  const raw = readConfig();
  const profile = raw.profiles.find((entry) => entry.id === "INTERN2");
  assert.deepEqual(profile?.anchor?.aliases, ["Prüflos", "Inspection Lot"]);
  assert.equal(profile?.anchor?.localizeAlias, true);
  assert.deepEqual(profile?.anchor?.fallbacks, []);
  assert.ok(profile?.detection?.excludeAliases?.includes("Alte Materialnummer"));
  assert.equal(profile?.detection?.minEvidenceMatches, 1);
});

test("Schema-Normalisierung erhält die Intern2-Erkennungsregeln", () => {
  const raw = readConfig();
  const normalized = normalizeProfileConfig(raw, String(raw.appVersion || ""));
  const profile = normalized.profiles.find((entry) => entry.id === "INTERN2");
  assert.equal(profile?.anchor?.localizeAlias, true);
  assert.deepEqual(profile?.anchor?.fallbacks, []);
  assert.ok(profile?.detection?.evidenceAliases?.includes("Prüflos"));
  assert.ok(profile?.detection?.excludeAliases?.includes("Alte Materialnummer"));
  assert.equal(profile?.detection?.minScore, 0.62);
});

test("VW verwendet für die IDH die letzten 7 Ziffern der untersten Zahlenzeile", () => {
  const vw = readConfig().profiles.find((profile) => profile.id === "VW");
  const idh = vw?.fields?.find((field) => field.key === "idh");
  assert.equal(idh?.normalizer, "last_digits");
  assert.equal(idh?.digits, 7);
  assert.equal(idh?.regex, "^\\d{7}$");
  assert.equal(idh?.strategy, "vw_delivery_pair");
  assert.match(idh?.sourceRegex || "", /\\d\{7\}/);
});

test("Scania-Gewicht verlangt K/KG und verwendet Netto-Logik", () => {
  const scania = readConfig().profiles.find((profile) => profile.id === "SCANIA");
  const weight = scania?.fields?.find((field) => field.key === "weight");
  assert.equal(weight?.normalizer, "net_weight");
  assert.equal(weight?.strategy, undefined);
  assert.equal(weight?.minOverlap, 0);
  assert.equal(weight?.searchRadius, 1.8);
  const re = new RegExp(weight?.sourceRegex || "", "i");
  assert.equal(re.test("1550"), false);
  assert.equal(re.test("1300 KG"), true);
  assert.equal(re.test("1300 K"), true);
  assert.equal(re.test("1550 / 1300 KG"), true);
});

test("Seat akzeptiert 5-stellige IDH und keine 9-stellige Lieferscheinnummer als IDH", () => {
  const seat = readConfig().profiles.find((profile) => profile.id === "SEAT");
  const idh = seat?.fields?.find((field) => field.key === "idh");
  assert.equal(idh?.regex, "^\\d{5,8}$");
  assert.equal(idh?.sourceRegex, "^\\d{5,8}$");
  assert.equal(idh?.minOverlap, 0.05);
});

test("VW richtet unterschiedlich lange Anker über Höhe und linke Kante aus", () => {
  const vw = readConfig().profiles.find((profile) => profile.id === "VW");
  assert.equal(vw?.anchor?.scaleFrom, "height");
  assert.equal(vw?.anchor?.alignFrom, "left");
});

test("Interne Profile binden die Lieferscheinnummer an Transportauftrag - Position", () => {
  const raw = readConfig();
  for (const id of ["INTERN1", "INTERN2"]) {
    const field = raw.profiles.find((profile) => profile.id === id)?.fields?.find((entry) => entry.key === "delivery_note");
    assert.ok(field?.locator?.aliases?.includes("Transportauftrag - Position"), id);
    assert.equal(field?.locator?.direction, "below_or_right", id);
    assert.equal(field?.locator?.strict, true, id);
  }
});

test("VW nutzt die große Kombizeile und das obere Quantity-Gewicht", () => {
  const vw = readConfig().profiles.find((profile) => profile.id === "VW");
  const byKey = Object.fromEntries(vw.fields.map((field) => [field.key, field]));
  assert.equal(byKey.delivery_note.strategy, "vw_delivery_pair");
  assert.equal(byKey.delivery_note.normalizer, "leading_delivery_digits");
  assert.equal(byKey.idh.strategy, "vw_delivery_pair");
  assert.equal(byKey.idh.normalizer, "last_digits");
  assert.equal(byKey.weight.strategy, "quantity_weight");
  assert.equal(byKey.weight.normalizer, "weight");
  assert.match(byKey.weight.sourceRegex, /KGM\|LTR/);
  assert.ok(byKey.weight.locator.aliases.includes("Quantity"));
  assert.equal(byKey.weight.locator.strict, false);
  assert.ok(byKey.batch.locator.aliases.includes("Batch Nr"));
  assert.equal(byKey.batch.locator.strict, true);
});

test("Scania bevorzugt beim Gewicht den rechten Wert mit Einheit", () => {
  const scania = readConfig().profiles.find((profile) => profile.id === "SCANIA");
  const field = scania?.fields?.find((entry) => entry.key === "weight");
  assert.equal(field?.minOverlap, 0);
  assert.equal(field?.preferRightmost, true);
  assert.equal(field?.preferUnit, true);
});

test("Schema-Normalisierung erhält VWs height- und left-Ankerausrichtung", () => {
  const raw = readConfig();
  const normalized = normalizeProfileConfig(raw, String(raw.appVersion || ""));
  const vw = normalized.profiles.find((profile) => profile.id === "VW");
  assert.equal(vw?.anchor?.scaleFrom, "height");
  assert.equal(vw?.anchor?.alignFrom, "left");
  assert.equal(vw?.fields?.find((field) => field.key === "delivery_note")?.locator?.strict, true);
});
