export function createEditorProfileSession() {
  return {
    prepared: null,
    ocrResult: null,
    selection: null,
    masterFileName: "",
    imageRevision: 0
  };
}

export class EditorProfileSessionStore {
  #sessions = new Map();

  get(profileId, create = true) {
    const key = String(profileId || "");
    if (!key) return null;
    if (!this.#sessions.has(key) && create) {
      this.#sessions.set(key, createEditorProfileSession());
    }
    return this.#sessions.get(key) || null;
  }

  rename(previousId, nextId) {
    const previousKey = String(previousId || "");
    const nextKey = String(nextId || "");
    if (!previousKey || !nextKey || previousKey === nextKey) return;
    const session = this.#sessions.get(previousKey);
    if (!session) return;
    this.#sessions.delete(previousKey);
    this.#sessions.set(nextKey, session);
  }

  delete(profileId) {
    this.#sessions.delete(String(profileId || ""));
  }

  clear() {
    this.#sessions.clear();
  }
}
