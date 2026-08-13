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

test("Pending-Export speichert Export- und Bestätigungs-IDs", async () => {
  const previousStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = memoryStorage();
    const storage = await import(`../src/storage.js?pending-state=${Date.now()}`);
    const saved = storage.savePendingExport({
      recordIds: ["a", "b", "c"],
      confirmRecordIds: ["b", "c"],
      createdAt: "2026-08-13T20:00:00.000Z",
      mode: "all",
      awaitingConfirmation: true
    });
    assert.deepEqual(saved.recordIds, ["a", "b", "c"]);
    assert.deepEqual(saved.confirmRecordIds, ["b", "c"]);
    assert.equal(saved.mode, "all");
    assert.equal(saved.awaitingConfirmation, true);

    const loaded = storage.loadPendingExport();
    assert.deepEqual(loaded, saved);
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});

test("Alte 0.16.17-Pending-Daten werden als bestätigungsbereit migriert", async () => {
  const previousStorage = globalThis.localStorage;
  try {
    const mem = memoryStorage();
    globalThis.localStorage = mem;
    mem.setItem("labelcheck-paddle-pending-export-v1", JSON.stringify({
      recordIds: ["legacy-1"],
      createdAt: "2026-08-13T20:00:00.000Z"
    }));
    const storage = await import(`../src/storage.js?pending-legacy=${Date.now()}`);
    const loaded = storage.loadPendingExport();
    assert.deepEqual(loaded.recordIds, ["legacy-1"]);
    assert.deepEqual(loaded.confirmRecordIds, ["legacy-1"]);
    assert.equal(loaded.awaitingConfirmation, true);
    assert.equal(loaded.mode, "new");
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
