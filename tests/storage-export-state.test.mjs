import test from "node:test";
import assert from "node:assert/strict";

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key)
  };
}

test("Exportbestätigung entfernt einen Datensatz aus dem Neu-Zähler und gesendete können separat geleert werden", async () => {
  const previousStorage = globalThis.localStorage;
  const previousIndexedDb = globalThis.indexedDB;
  try {
    globalThis.localStorage = memoryStorage();
    try { delete globalThis.indexedDB; } catch { globalThis.indexedDB = undefined; }
    const storage = await import(`../src/storage.js?state-test=${Date.now()}`);
    let records = await storage.saveRecord({ timestamp: "2026-08-13T20:00:00.000Z", product: {}, vda: {} });
    assert.equal(records.length, 1);
    assert.equal(Boolean(records[0].exportedAt), false);
    const id = records[0].id;

    await storage.markRecordsExported([id], "2026-08-13T20:01:00.000Z");
    records = await storage.loadRecords();
    assert.equal(records.filter((record) => !record.exportedAt).length, 0);
    assert.equal(records.filter((record) => record.exportedAt).length, 1);

    records = await storage.clearExportedRecords();
    assert.equal(records.length, 0);
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = previousStorage;
    if (previousIndexedDb === undefined) delete globalThis.indexedDB; else globalThis.indexedDB = previousIndexedDb;
  }
});
