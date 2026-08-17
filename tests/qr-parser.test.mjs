import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseQrPayload } from "../src/qr-parser.js";

const config = JSON.parse(fs.readFileSync(new URL("../public/config/label-profiles.json", import.meta.url), "utf8"));
const qrProfile = config.profiles.find((profile) => profile.source?.type === "qr");
const sample = "[)>+06:6J0001713232607130956263434:P2254461-00-A:Q900:K5603632493:5K:4K150:3QKG:1TD562808695:15D20261003:12D:99Z0013029294:S:X0+#";

test("QR-Felder werden ausschließlich über Parserregeln aus der JSON gelesen", () => {
  assert.ok(qrProfile?.source?.parser);
  const parsed = parseQrPayload(qrProfile.source.parser, sample);
  assert.equal(parsed?.fields.batch, "D562808695");
  assert.equal(parsed?.fields.delivery_note, "0013029294");
  assert.equal(parsed?.fields.weight, "900 KG");
  assert.equal(parsed?.parser, "config");
});

test("beliebiger QR-Code erfüllt konfigurierte Pflichtfelder nicht", () => {
  assert.equal(parseQrPayload(qrProfile.source.parser, "https://example.com"), null);
});

test("Sekundär-Fallback kann keinen fehlenden Primärwert vortäuschen", () => {
  const parser = {
    requiredFields: ["weight"],
    fields: {
      weight: {
        primaryRegex: "Q(\\d+)", primaryGroup: 1,
        secondaryRegex: "U(KG)", secondaryGroup: 1,
        secondaryDefault: "KG", template: "{primary} {secondary}", replacements: []
      }
    }
  };
  assert.equal(parseQrPayload(parser, "U(KG)"), null);
});
