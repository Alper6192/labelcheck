const WORKER_LOAD_TIMEOUT = 180000;

export class FlorenceClient extends EventTarget {
  constructor() {
    super();
    this.workerClient = null;
    this.mainClient = null;
    this.mode = "";
    this.loaded = false;
    this.loadPromise = null;
    this.closed = false;
  }

  load() {
    if (this.loaded) return Promise.resolve(this.#runtimeSummary());
    if (this.loadPromise) return this.loadPromise;
    this.closed = false;
    this.loadPromise = this.#loadAdaptive().catch((error) => {
      this.loadPromise = null;
      this.loaded = false;
      throw error;
    });
    return this.loadPromise;
  }

  async analyze(dataUrl, role, options = {}) {
    await this.load();
    try {
      return await this.#activeClient().analyze(dataUrl, role, options);
    } catch (error) {
      if (this.mode === "worker" && !this.closed) {
        this.#emitStatus("Florence-Worker ist ausgefallen. Wechsel ins Hauptfenster …");
        await this.#switchToMain(error);
        return this.mainClient.analyze(dataUrl, role, options);
      }
      throw error;
    }
  }

  terminate(reason = "Florence beendet.") {
    this.closed = true;
    this.loaded = false;
    this.loadPromise = null;
    try { this.workerClient?.terminate(reason); } catch {}
    try { this.mainClient?.terminate(reason); } catch {}
    this.workerClient = null;
    this.mainClient = null;
    this.mode = "";
  }

  async #loadAdaptive() {
    if (!globalThis.navigator?.gpu) {
      throw new Error("WebGPU ist in diesem Browserkontext nicht verfügbar.");
    }

    // Keine harte Adapter-Vorprüfung: Auf einzelnen verwalteten Edge-Versionen
    // liefert requestAdapter() bei einer Vorabfrage null, obwohl ONNX Runtime
    // den WebGPU-Backend beim tatsächlichen Session-Start verwenden kann.
    // Deshalb ist der echte Modellstart der maßgebliche Kompatibilitätstest.
    this.#emitStatus("Florence wird im Web Worker praktisch gestartet …");
    this.workerClient = this.#createWorkerClient();

    try {
      const info = await withTimeout(
        this.workerClient.load(),
        WORKER_LOAD_TIMEOUT,
        "Florence konnte im Worker nicht rechtzeitig geladen werden.",
      );
      this.mode = "worker";
      this.loaded = true;
      return { ...info, mode: "worker" };
    } catch (error) {
      this.#emitStatus(
        `Worker konnte Florence nicht starten (${error?.message || error}). Wechsel ins Hauptfenster …`,
      );
      try { this.workerClient.terminate("Wechsel zum Hauptfenster."); } catch {}
      this.workerClient = null;
    }

    return this.#loadMainClient();
  }

  async #switchToMain(originalError) {
    try { this.workerClient?.terminate("Worker abgestürzt; Hauptfenster-Fallback."); } catch {}
    this.workerClient = null;
    this.loaded = false;
    this.loadPromise = null;
    try {
      await this.#loadMainClient();
    } catch (fallbackError) {
      throw new AggregateError(
        [originalError, fallbackError],
        `Florence ist im Worker und im Hauptfenster fehlgeschlagen. Worker: ${originalError?.message || originalError}; Hauptfenster: ${fallbackError?.message || fallbackError}`,
      );
    }
  }

  async #loadMainClient() {
    this.mainClient ??= this.#createMainClient();
    const info = await withTimeout(
      this.mainClient.load(),
      WORKER_LOAD_TIMEOUT,
      "Florence konnte im Browserfenster nicht rechtzeitig geladen werden.",
    );
    this.mode = "main";
    this.loaded = true;
    return { ...info, mode: "main" };
  }

  #createWorkerClient() {
    const client = new WorkerFlorenceClient();
    forwardEvents(client, this);
    client.addEventListener("crash", (event) => {
      this.dispatchEvent(new CustomEvent("crash", { detail: event.detail }));
    });
    return client;
  }

  #createMainClient() {
    const client = new MainThreadFlorenceClient();
    forwardEvents(client, this);
    return client;
  }

  #activeClient() {
    if (this.mode === "worker" && this.workerClient) return this.workerClient;
    if (this.mode === "main" && this.mainClient) return this.mainClient;
    throw new Error("Florence wurde noch nicht initialisiert.");
  }

  #emitStatus(text) {
    this.dispatchEvent(new CustomEvent("status", { detail: { type: "status", text } }));
  }

  #runtimeSummary() {
    return { mode: this.mode, context: this.mode === "worker" ? "worker-webgpu" : "main-webgpu" };
  }
}

class WorkerFlorenceClient extends EventTarget {
  constructor() {
    super();
    this.pending = new Map();
    this.loaded = false;
    this.dead = false;
    this.worker = new Worker(new URL("./florence-worker.js", import.meta.url), { type: "module" });
    this.worker.addEventListener("message", (event) => this.#handleMessage(event.data));
    this.worker.addEventListener("error", (event) => {
      const error = event.error || new Error(event.message || "Florence-Worker ist abgestürzt.");
      this.#markDead(error);
    });
    this.worker.addEventListener("messageerror", () => {
      this.#markDead(new Error("Florence-Worker konnte eine Nachricht nicht verarbeiten."));
    });
  }

  probe() {
    return this.#request("probe", {});
  }

  load() {
    if (this.loaded) return Promise.resolve({ context: "worker-webgpu" });
    return this.#request("load", {});
  }

  analyze(dataUrl, role, options = {}) {
    return this.#request("analyze", { dataUrl, role, ...options });
  }

  terminate(reason = "Florence-Worker beendet.") {
    if (this.dead) return;
    this.dead = true;
    try { this.worker?.terminate(); } catch {}
    this.#rejectAll(new Error(reason));
  }

  #request(type, payload) {
    if (this.dead) return Promise.reject(new Error("Florence-Worker ist nicht mehr verfügbar."));
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, type });
      try {
        this.worker.postMessage({ id, type, payload });
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
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

  #markDead(error) {
    if (this.dead) return;
    this.dead = true;
    this.loaded = false;
    this.#rejectAll(error);
    this.dispatchEvent(new CustomEvent("crash", { detail: { error } }));
  }

  #rejectAll(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

class MainThreadFlorenceClient extends EventTarget {
  constructor() {
    super();
    this.runtime = null;
    this.loaded = false;
    this.closed = false;
  }

  async load() {
    if (this.loaded) return { context: "main-webgpu", adapterMode: "runtime-auto" };
    if (this.closed) throw new Error("Florence-Hauptfenster-Client wurde beendet.");
    this.#status("Florence-2 wird im Browserfenster geladen …");
    this.runtime ??= await import("./florence-runtime.js");
    const loaded = await this.runtime.initializeFlorence({
      context: "main-webgpu",
      progressCallback: (progress) => {
        this.dispatchEvent(new CustomEvent("progress", {
          detail: { type: "progress", progress },
        }));
      },
    });
    this.loaded = true;
    return loaded.info;
  }

  async analyze(dataUrl, role, options = {}) {
    await this.load();
    if (this.closed) throw new Error("Florence-Hauptfenster-Client wurde beendet.");
    this.#status(
      `${role === "product" ? "Produktlabel" : "VDA-Label"} wird im Browserfenster gelesen …`,
    );
    return this.runtime.analyzeFlorence(dataUrl, role, {
      ...options,
      context: "main-webgpu",
      progressCallback: (progress) => {
        this.dispatchEvent(new CustomEvent("progress", {
          detail: { type: "progress", progress },
        }));
      },
    });
  }

  terminate() {
    // Ein bereits laufender GPU-Auftrag kann im Hauptfenster nicht hart
    // abgebrochen werden. Das Ergebnis wird vom Aufrufer über Job-IDs ignoriert.
    this.closed = true;
    this.loaded = false;
    try { this.runtime?.resetFlorenceRuntime?.(); } catch {}
  }

  #status(text) {
    this.dispatchEvent(new CustomEvent("status", {
      detail: { type: "status", text },
    }));
  }
}

function forwardEvents(source, target) {
  for (const type of ["status", "progress"]) {
    source.addEventListener(type, (event) => {
      target.dispatchEvent(new CustomEvent(type, { detail: event.detail }));
    });
  }
}

function withTimeout(promise, milliseconds, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}
