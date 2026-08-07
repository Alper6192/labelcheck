import test from "node:test";
import assert from "node:assert/strict";
import { clearRecords, loadRecords, saveRecord } from "../src/storage.js";

function fakeStorage({ failSet = false, failRemove = false } = {}) {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { if (failSet) throw new Error("quota"); data.set(key, String(value)); },
    removeItem(key) { if (failRemove) throw new Error("blocked"); data.delete(key); }
  };
}

test("saveRecord speichert und begrenzt das Protokoll", () => {
  globalThis.localStorage = fakeStorage();
  for (let index = 0; index < 505; index += 1) saveRecord({ index });
  const records = loadRecords();
  assert.equal(records.length, 500);
  assert.equal(records[0].index, 504);
});

test("saveRecord meldet gesperrten oder vollen Browserspeicher", () => {
  globalThis.localStorage = fakeStorage({ failSet: true });
  assert.throws(() => saveRecord({ ok: true }), /konnte nicht gespeichert werden/i);
});

test("clearRecords meldet fehlgeschlagenes Löschen", () => {
  globalThis.localStorage = fakeStorage({ failRemove: true });
  assert.throws(() => clearRecords(), /konnte nicht geleert werden/i);
});
