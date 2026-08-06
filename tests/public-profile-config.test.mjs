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
