export class FlorenceClient extends EventTarget {
  constructor() {
    super();
    this.worker = new Worker(new URL("./florence-worker.js", import.meta.url), { type: "module" });
    this.pending = new Map();
    this.loaded = false;
    this.worker.addEventListener("message", (event) => this.#handleMessage(event.data));
    this.worker.addEventListener("error", (event) => this.#rejectAll(event.error || new Error(event.message || "Florence-Worker ist abgestürzt.")));
  }

  load() {
    if (this.loaded) return Promise.resolve();
    return this.#request("load", {});
  }

  analyze(dataUrl, role) {
    return this.#request("analyze", { dataUrl, role });
  }

  #request(type, payload) {
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, type });
      this.worker.postMessage({ id, type, payload });
    });
  }

  #handleMessage(message) {
    if (message.type === "progress" || message.type === "status") {
      this.dispatchEvent(new CustomEvent(message.type, { detail: message }));
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);

    if (message.type === "error") {
      pending.reject(new Error(message.error || "Unbekannter Florence-Fehler."));
      return;
    }

    if (pending.type === "load") this.loaded = true;
    pending.resolve(message.result);
  }

  #rejectAll(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}
