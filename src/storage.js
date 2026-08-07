const KEY = "labelcheck-paddle-records-v1";
const LIMIT = 500;

function getStorage() {
  const storage = globalThis.localStorage;
  if (!storage) throw new Error("Lokaler Browserspeicher ist nicht verfügbar.");
  return storage;
}

export function loadRecords() {
  try {
    const parsed = JSON.parse(getStorage().getItem(KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRecord(record) {
  const next = [record, ...loadRecords()].slice(0, LIMIT);
  try {
    getStorage().setItem(KEY, JSON.stringify(next));
  } catch (error) {
    throw new Error(`Lokales Protokoll konnte nicht gespeichert werden: ${error?.message || error}`);
  }
  return next;
}

export function clearRecords() {
  try {
    getStorage().removeItem(KEY);
  } catch (error) {
    throw new Error(`Lokales Protokoll konnte nicht geleert werden: ${error?.message || error}`);
  }
  return [];
}
