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

test("Nur angelegte Felder werden validiert und ihre regulären Ausdrücke sind gültig", () => {
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

test("Nicht angelegte Felder sind niemals Validierungs-Pflichtfelder", () => {
  const normalized = normalizeProfileConfig(readConfig(), "1.0.1");
  for (const profile of normalized.profiles) {
    const fieldKeys = new Set((profile.fields || []).map((field) => field.key));
    for (const key of profile.validation?.requiredValidFields || []) {
      assert.ok(fieldKeys.has(key), `${profile.id}: nicht angelegtes Validierungsfeld ${key}`);
    }
    for (const field of profile.fields || []) {
      if (field.neighbor?.field) {
        assert.ok(fieldKeys.has(field.neighbor.field), `${profile.id}/${field.key}: Nachbarfeld ${field.neighbor.field} ist nicht angelegt`);
      }
    }
  }
});

test("QR-Pflichtfelder existieren als Parserregeln und QR-RegEx sind gültig", () => {
  const normalized = normalizeProfileConfig(readConfig(), "1.0.1");
  for (const profile of normalized.profiles.filter((entry) => entry.source?.type === "qr")) {
    const parserFields = new Set(Object.keys(profile.source.parser?.fields || {}));
    for (const key of profile.source.parser?.requiredFields || []) {
      assert.ok(parserFields.has(key), `${profile.id}: nicht angelegte QR-Regel ${key} ist Pflichtfeld`);
    }
    for (const [key, rule] of Object.entries(profile.source.parser?.fields || {})) {
      assert.ok(validateRegex(rule.primaryRegex).valid, `${profile.id}/${key}: primaryRegex`);
      assert.ok(validateRegex(rule.secondaryRegex).valid, `${profile.id}/${key}: secondaryRegex`);
    }
  }
});
