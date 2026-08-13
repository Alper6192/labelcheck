const DB_NAME = "labelcheck-paddle";
const DB_VERSION = 1;
const STORE_NAME = "scan-records";
const LEGACY_KEY = "labelcheck-paddle-records-v1";
const PENDING_EXPORT_KEY = "labelcheck-paddle-pending-export-v1";
const MAX_RECORDS = 500;

let databasePromise = null;

export async function loadRecords() {
  // Ab 0.16.15 bleibt auch der bereits bestätigte Exportverlauf lokal sichtbar.
  // exportedAt kennzeichnet nur den Sendestatus; die Zeile wird nicht mehr aus
  // dem lokalen Protokoll entfernt.
  if (!hasIndexedDb()) return loadLegacyRecords(false);
  try {
    const db = await openDatabase();
    await migrateLegacyRecords(db);
    return await readAllRecords(db, true, false);
  } catch {
    return loadLegacyRecords(false);
  }
}

export async function saveRecord(record) {
  if (!hasIndexedDb()) return saveLegacyRecord(record);
  try {
    const db = await openDatabase();
    await migrateLegacyRecords(db);
    const stored = { ...record, id: record?.id || createRecordId() };
    await requestTransaction(db, "readwrite", (store) => store.put(stored));

    const allRecords = await readAllRecords(db, false, false);
    if (allRecords.length > MAX_RECORDS) {
      const surplus = allRecords.slice(MAX_RECORDS);
      await requestTransaction(db, "readwrite", (store) => {
        for (const entry of surplus) store.delete(entry.id);
      });
    }
    return await readAllRecords(db, true, false);
  } catch {
    return saveLegacyRecord(record);
  }
}

export async function markRecordsExported(ids, exportedAt = new Date().toISOString()) {
  const wanted = new Set((ids || []).filter(Boolean));
  if (!wanted.size) return loadRecords();

  if (!hasIndexedDb()) {
    const allRecords = loadLegacyRecords(false).map((record) => wanted.has(record.id)
      ? { ...record, exportedAt }
      : record);
    saveLegacyRecords(allRecords);
    return allRecords.slice(0, MAX_RECORDS);
  }

  try {
    const db = await openDatabase();
    await migrateLegacyRecords(db);
    const allRecords = await readAllRecords(db, false, false);
    const matches = allRecords.filter((record) => wanted.has(record.id));
    await requestTransaction(db, "readwrite", (store) => {
      for (const record of matches) store.put({ ...record, exportedAt });
    });
    return await readAllRecords(db, true, false);
  } catch (error) {
    throw error instanceof Error ? error : new Error("Exportstatus konnte nicht gespeichert werden.");
  }
}

export function loadPendingExport() {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(PENDING_EXPORT_KEY) || "null");
    if (!parsed || !Array.isArray(parsed.recordIds) || !parsed.recordIds.length || !parsed.createdAt) return null;
    return {
      recordIds: parsed.recordIds.filter(Boolean),
      createdAt: String(parsed.createdAt)
    };
  } catch {
    return null;
  }
}

export function savePendingExport(pending) {
  const normalized = pending && Array.isArray(pending.recordIds) && pending.recordIds.length
    ? { recordIds: pending.recordIds.filter(Boolean), createdAt: String(pending.createdAt || new Date().toISOString()) }
    : null;
  try {
    if (normalized) globalThis.localStorage?.setItem(PENDING_EXPORT_KEY, JSON.stringify(normalized));
    else globalThis.localStorage?.removeItem(PENDING_EXPORT_KEY);
  } catch { /* best effort */ }
  return normalized;
}

export function clearPendingExport() {
  try { globalThis.localStorage?.removeItem(PENDING_EXPORT_KEY); } catch { /* best effort */ }
  return null;
}

export async function clearRecords() {
  try {
    globalThis.localStorage?.removeItem(LEGACY_KEY);
    globalThis.localStorage?.removeItem(PENDING_EXPORT_KEY);
  } catch { /* optional */ }
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
  const legacy = loadLegacyRecords(false);
  if (!legacy.length) return;
  await requestTransaction(db, "readwrite", (store) => {
    legacy.slice(0, MAX_RECORDS).forEach((record) => {
      store.put({ ...record, id: record?.id || createRecordId() });
    });
  });
  try { globalThis.localStorage?.removeItem(LEGACY_KEY); } catch { /* best effort */ }
}

function readAllRecords(db, limit = true, activeOnly = true) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      let records = Array.isArray(request.result) ? request.result : [];
      records.sort((left, right) => String(right.timestamp || "").localeCompare(String(left.timestamp || "")));
      if (activeOnly) records = records.filter((record) => !record.exportedAt);
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

function loadLegacyRecords(activeOnly = true) {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(LEGACY_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    let changed = false;
    let records = parsed.map((record) => {
      if (record?.id) return record;
      changed = true;
      return { ...record, id: createRecordId() };
    });
    if (changed) saveLegacyRecords(records);
    records.sort((left, right) => String(right.timestamp || "").localeCompare(String(left.timestamp || "")));
    if (activeOnly) records = records.filter((record) => !record.exportedAt);
    return records.slice(0, MAX_RECORDS);
  } catch {
    return [];
  }
}

function saveLegacyRecord(record) {
  const records = loadLegacyRecords(false);
  records.unshift({ ...record, id: record?.id || createRecordId() });
  saveLegacyRecords(records.slice(0, MAX_RECORDS));
  return records.slice(0, MAX_RECORDS);
}

function saveLegacyRecords(records) {
  try { globalThis.localStorage?.setItem(LEGACY_KEY, JSON.stringify(records.slice(0, MAX_RECORDS))); } catch { /* fallback only */ }
}

function createRecordId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
