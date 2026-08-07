const DB_NAME = "labelcheck-paddle";
const DB_VERSION = 1;
const STORE_NAME = "scan-records";
const LEGACY_KEY = "labelcheck-paddle-records-v1";
const MAX_RECORDS = 500;

let databasePromise = null;

export async function loadRecords() {
  if (!hasIndexedDb()) return loadLegacyRecords();
  try {
    const db = await openDatabase();
    await migrateLegacyRecords(db);
    return await readAllRecords(db);
  } catch {
    return loadLegacyRecords();
  }
}

export async function saveRecord(record) {
  if (!hasIndexedDb()) return saveLegacyRecord(record);
  try {
    const db = await openDatabase();
    await migrateLegacyRecords(db);
    const stored = { ...record, id: record?.id || createRecordId() };
    await requestTransaction(db, "readwrite", (store) => store.put(stored));

    const records = await readAllRecords(db, false);
    if (records.length > MAX_RECORDS) {
      const surplus = records.slice(MAX_RECORDS);
      await requestTransaction(db, "readwrite", (store) => {
        for (const entry of surplus) store.delete(entry.id);
      });
      return records.slice(0, MAX_RECORDS);
    }
    return records;
  } catch {
    return saveLegacyRecord(record);
  }
}

export async function clearRecords() {
  try { globalThis.localStorage?.removeItem(LEGACY_KEY); } catch { /* optional */ }
  if (!hasIndexedDb()) return [];
  try {
    const db = await openDatabase();
    await requestTransaction(db, "readwrite", (store) => store.clear());
  } catch {
    // Wenn IndexedDB nicht verfügbar ist, ist der lokale Fallback bereits leer.
  }
  return [];
}

function hasIndexedDb() {
  return typeof globalThis.indexedDB !== "undefined";
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB konnte nicht geöffnet werden."));
    request.onblocked = () => reject(new Error("IndexedDB ist durch einen anderen Tab blockiert."));
  });
  return databasePromise;
}

async function migrateLegacyRecords(db) {
  const legacy = loadLegacyRecords();
  if (!legacy.length) return;
  await requestTransaction(db, "readwrite", (store) => {
    legacy.slice(0, MAX_RECORDS).forEach((record) => {
      store.put({ ...record, id: record?.id || createRecordId() });
    });
  });
  try { globalThis.localStorage?.removeItem(LEGACY_KEY); } catch { /* best effort */ }
}

function readAllRecords(db, limit = true) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      const records = Array.isArray(request.result) ? request.result : [];
      records.sort((left, right) => String(right.timestamp || "").localeCompare(String(left.timestamp || "")));
      resolve(limit ? records.slice(0, MAX_RECORDS) : records);
    };
    request.onerror = () => reject(request.error || new Error("Scanprotokoll konnte nicht gelesen werden."));
  });
}

function requestTransaction(db, mode, action) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    try { action(store); }
    catch (error) { reject(error); return; }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Scanprotokoll konnte nicht gespeichert werden."));
    transaction.onabort = () => reject(transaction.error || new Error("Speichervorgang wurde abgebrochen."));
  });
}

function loadLegacyRecords() {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(LEGACY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECORDS) : [];
  } catch {
    return [];
  }
}

function saveLegacyRecord(record) {
  const records = loadLegacyRecords();
  records.unshift(record);
  const limited = records.slice(0, MAX_RECORDS);
  try { globalThis.localStorage?.setItem(LEGACY_KEY, JSON.stringify(limited)); } catch { /* fallback only */ }
  return limited;
}

function createRecordId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
