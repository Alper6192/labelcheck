import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");

test("neues Foto setzt das Layoutprofil auf Automatisch", () => {
  assert.match(source, /selectedProfileId:\s*""/);
  assert.match(source, /el\(`\$\{key\}Profile`\)\.value\s*=\s*""/);
});

test("automatisch erkanntes Profil überschreibt den Select nicht", () => {
  assert.match(source, /el\(`\$\{key\}Profile`\)\.value\s*=\s*slot\.selectedProfileId\s*\|\|\s*""/);
});
