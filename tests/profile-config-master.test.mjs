import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";

const configUrl = new URL("../public/config/label-profiles.json", import.meta.url);

test("Profil-JSON bleibt byte-identisch zum freigegebenen 0.16.7-Master", () => {
  const bytes = fs.readFileSync(configUrl);
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  assert.equal(hash, "acb8cb9402ea3eb48856e79183ff29de4025b3090bb57c0eac5aa396867567c0");
});
