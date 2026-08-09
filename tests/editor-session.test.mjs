import test from "node:test";
import assert from "node:assert/strict";
import { EditorProfileSessionStore } from "../src/editor-session.js";

test("Masterbilder und OCR-Ergebnisse bleiben pro Profil getrennt", () => {
  const store = new EditorProfileSessionStore();
  const product = store.get("PRODUCT");
  const vda = store.get("VDA");

  product.prepared = { name: "produkt.jpg" };
  product.ocrResult = { items: [{ text: "2210485" }] };
  vda.prepared = { name: "vda.jpg" };
  vda.ocrResult = { items: [{ text: "Mercedes-Benz AG" }] };

  assert.equal(store.get("PRODUCT").prepared.name, "produkt.jpg");
  assert.equal(store.get("VDA").prepared.name, "vda.jpg");
  assert.notEqual(store.get("PRODUCT"), store.get("VDA"));
});

test("Profil-ID-Änderung übernimmt nur die zugehörige Sitzung", () => {
  const store = new EditorProfileSessionStore();
  store.get("ALT").masterFileName = "master.jpg";
  store.rename("ALT", "NEU");

  assert.equal(store.get("NEU", false).masterFileName, "master.jpg");
  assert.equal(store.get("ALT", false), null);
});

test("Gelöschte Profile verlieren ihren flüchtigen Bildzustand", () => {
  const store = new EditorProfileSessionStore();
  store.get("FORMAT_1").masterFileName = "format1.jpg";
  store.delete("FORMAT_1");
  assert.equal(store.get("FORMAT_1", false), null);
});
