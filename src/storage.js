const DB_NAME = "labelcheck-florence";
const DB_VERSION = 1;
const STORE = "records";

export async function loadRecords() {
  const db = await openDatabase();
  return requestToPromise(db.transaction(STORE, "readonly").objectStore(STORE).getAll())
    .then((records) => records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
}

export async function saveRecord(record) {
  const db = await openDatabase();
  await requestToPromise(db.transaction(STORE, "readwrite").objectStore(STORE).put(record));
  return record;
}

export async function deleteRecord(id) {
  const db = await openDatabase();
  await requestToPromise(db.transaction(STORE, "readwrite").objectStore(STORE).delete(id));
}

export async function clearRecords() {
  const db = await openDatabase();
  await requestToPromise(db.transaction(STORE, "readwrite").objectStore(STORE).clear());
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Lokale Datenbank konnte nicht geöffnet werden."));
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Datenbankoperation fehlgeschlagen."));
  });
}
