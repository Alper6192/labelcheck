const DB_NAME = "labelcheck-profile-editor-v1";
const DB_VERSION = 1;
const STORE_NAME = "master-images";

export async function loadEditorMaster(profileId) {
  const db = await openDb();
  return requestResult(db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(String(profileId || "")));
}

export async function saveEditorMaster(profileId, payload) {
  const key = String(profileId || "");
  if (!key || !(payload?.blob instanceof Blob)) return;
  const db = await openDb();
  const record = {
    profileId: key,
    blob: payload.blob,
    fileName: String(payload.fileName || "masterbild.jpg"),
    ocrResult: payload.ocrResult || null,
    updatedAt: new Date().toISOString()
  };
  await transactionDone(db.transaction(STORE_NAME, "readwrite"), (store) => store.put(record));
}

export async function deleteEditorMaster(profileId) {
  const db = await openDb();
  await transactionDone(db.transaction(STORE_NAME, "readwrite"), (store) => store.delete(String(profileId || "")));
}

export async function renameEditorMaster(previousId, nextId) {
  const previousKey = String(previousId || "");
  const nextKey = String(nextId || "");
  if (!previousKey || !nextKey || previousKey === nextKey) return;
  const record = await loadEditorMaster(previousKey);
  if (!record) return;
  await saveEditorMaster(nextKey, { ...record, blob: record.blob });
  await deleteEditorMaster(previousKey);
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) return reject(new Error("IndexedDB ist in diesem Browser nicht verfügbar."));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "profileId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB konnte nicht geöffnet werden."));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("IndexedDB-Lesezugriff fehlgeschlagen."));
  });
}

function transactionDone(transaction, operation) {
  return new Promise((resolve, reject) => {
    operation(transaction.objectStore(STORE_NAME));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB-Schreibzugriff fehlgeschlagen."));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB-Transaktion abgebrochen."));
  });
}
