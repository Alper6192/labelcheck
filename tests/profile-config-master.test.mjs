import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const configUrl = new URL("../public/config/label-profiles.json", import.meta.url);
const runtimeFiles = ["main.js", "profile-engine.js", "qr-parser.js", "qr-engine.js"];

function config() {
  return JSON.parse(fs.readFileSync(configUrl, "utf8"));
}

test("Profilkonfiguration ist die zentrale Quelle der 0.17-Architektur", () => {
  const raw = config();
  assert.equal(raw.schemaVersion, 3);
  assert.equal(raw.appVersion, "0.17.0");
  assert.ok(raw.profiles.length >= 1);
  for (const profile of raw.profiles) {
    assert.ok(["ocr", "qr"].includes(profile?.source?.type), `${profile.id}: source.type fehlt`);
    assert.ok(profile.detection && typeof profile.detection === "object", `${profile.id}: detection fehlt`);
    assert.ok(profile.validation && typeof profile.validation === "object", `${profile.id}: validation fehlt`);
  }
});

test("Runtime enthält keine Verzweigung auf konkrete Profil-IDs", () => {
  const ids = config().profiles.map((profile) => String(profile.id || "")).filter(Boolean);
  const runtime = runtimeFiles
    .map((file) => fs.readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"))
    .join("\n");
  for (const id of ids) {
    assert.doesNotMatch(runtime, new RegExp(`(?:===|==|case\\s+)[^\\n]{0,20}[\"']${id}[\"']`, "i"), `Profil-ID ${id} ist im Runtime-Code verdrahtet`);
  }
});

test("index.html enthält keine kundenspezifischen VDA-Profilnamen", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const profiles = config().profiles.filter((profile) => profile.role === "vda");
  for (const profile of profiles) {
    assert.doesNotMatch(html, new RegExp(`>${String(profile.name).replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}<`, "i"));
  }
});

test("Produktive JSON liegt bereits in der vom Editor exportierten Schema-v3-Normalform vor", async () => {
  const { normalizeProfileConfig } = await import("../src/profile-schema.js");
  const raw = config();
  const normalized = normalizeProfileConfig(raw, "0.17.0");
  assert.deepEqual(JSON.parse(JSON.stringify(normalized)), raw);
});
