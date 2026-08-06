import { PaddleOCR } from "@paddleocr/paddleocr-js";
import { MODEL_OPTIONS } from "./config.js";
import { safeError } from "./utils.js";

const DEFAULT_PREDICT_TIMEOUT_MS = 60000;
const DEFAULT_PROBE_TIMEOUT_MS = 15000;
const DISPOSE_TIMEOUT_MS = 4000;

const PROBE_PARAMS = {
  textDetLimitSideLen: 640,
  textDetLimitType: "max",
  textDetMaxSideLimit: 960,
  textDetThresh: 0.2,
  textDetBoxThresh: 0.3,
  textDetUnclipRatio: 1.4,
  textRecScoreThresh: 0.1
};

export class PaddleOcrEngine {
  #ocr = null;
  #modelKey = null;
  #mode = null;
  #initSummary = null;
  #verified = false;
  #queue = Promise.resolve();
  #initPromise = null;
  #requestedInitializationKey = null;
  #generation = 0;
  #activeAborters = new Set();

  get ready() {
    return Boolean(this.#ocr);
  }

  get verified() {
    return this.#verified;
  }

  get modelKey() {
    return this.#modelKey;
  }

  get mode() {
    return this.#mode;
  }

  get summary() {
    return this.#initSummary;
  }

  async initialize(modelKey, onStatus = () => {}) {
    const model = getModel(modelKey);
    if (this.#matchesRuntime(modelKey, "auto")) return this.#reuseInfo();
    return this.#startInitialization(modelKey, model, onStatus, "auto");
  }

  async initializeMainThread(modelKey, onStatus = () => {}) {
    const model = getModel(modelKey);
    if (this.#matchesRuntime(modelKey, "main")) return this.#reuseInfo();
    return this.#startInitialization(modelKey, model, onStatus, "main");
  }

  /**
   * Lädt PaddleOCR und führt anschließend einen echten kleinen OCR-Auftrag aus.
   * Ein Worker, der sich nur initialisieren lässt, aber bei predict() hängen bleibt,
   * wird automatisch verworfen und durch eine Hauptfenster-Instanz ersetzt.
   */
  async initializeVerified(modelKey, onStatus = () => {}, options = {}) {
    const probeTimeoutMs = Math.max(5000, Number(options.probeTimeoutMs || DEFAULT_PROBE_TIMEOUT_MS));
    let info = await this.initialize(modelKey, onStatus);

    if (this.#verified) return { ...info, verified: true, probeMs: 0 };

    const attemptedMode = this.#mode || "unbekannter Modus";
    try {
      onStatus(`${attemptedMode} wird mit einem Testbild geprüft …`);
      const probe = await this.#verifyCurrent(probeTimeoutMs);
      return { ...info, mode: this.#mode, verified: true, probeMs: probe.wallMs };
    } catch (workerError) {
      if (!attemptedMode.startsWith("Web Worker")) {
        throw new Error(`PaddleOCR-Test im Hauptfenster fehlgeschlagen: ${safeError(workerError)}`);
      }

      onStatus("Web Worker reagiert nicht. Wechsel ins Hauptfenster …");
      info = await this.initializeMainThread(modelKey, onStatus);

      try {
        onStatus("Hauptfenster wird mit einem Testbild geprüft …");
        const probe = await this.#verifyCurrent(Math.max(probeTimeoutMs, 30000));
        return {
          ...info,
          mode: this.#mode,
          verified: true,
          probeMs: probe.wallMs,
          fallbackFrom: attemptedMode,
          workerError: safeError(workerError)
        };
      } catch (mainError) {
        throw new Error(
          `Worker-Test: ${safeError(workerError)}. Hauptfenster-Test: ${safeError(mainError)}`
        );
      }
    }
  }

  async #verifyCurrent(timeoutMs) {
    const probeCanvas = createProbeCanvas();
    return this.predict(probeCanvas, PROBE_PARAMS, { timeoutMs });
  }

  async #startInitialization(modelKey, model, onStatus, runtime) {
    const requestKey = `${modelKey}:${runtime}`;

    if (this.#initPromise && this.#requestedInitializationKey === requestKey) {
      return this.#initPromise;
    }

    if (this.#initPromise) {
      try {
        await this.#initPromise;
      } catch {
        // Der folgende Versuch liefert den relevanten Fehler.
      }
      if (this.#matchesRuntime(modelKey, runtime)) return this.#reuseInfo();
    }

    this.#requestedInitializationKey = requestKey;
    const operation = this.#initializeInternal(modelKey, model, onStatus, runtime);
    this.#initPromise = operation;
    try {
      return await operation;
    } finally {
      if (this.#initPromise === operation) {
        this.#initPromise = null;
        this.#requestedInitializationKey = null;
      }
    }
  }

  #matchesRuntime(modelKey, runtime) {
    if (!this.ready || this.#modelKey !== modelKey) return false;
    if (runtime === "main") return this.#mode?.startsWith("Hauptfenster");
    return true;
  }

  #reuseInfo() {
    return {
      reused: true,
      mode: this.#mode,
      summary: this.#initSummary,
      verified: this.#verified,
      initMs: 0
    };
  }

  async #initializeInternal(modelKey, model, onStatus, runtime) {
    await this.dispose();
    const startedAt = performance.now();
    const common = createCommonOptions(model);
    let workerError = null;

    if (runtime !== "main") {
      try {
        onStatus("PaddleOCR wird im Web Worker geladen …");
        this.#ocr = await PaddleOCR.create({ ...common, worker: true });
        this.#mode = "Web Worker · WASM/SIMD";
      } catch (error) {
        workerError = error;
        this.#ocr = null;
        onStatus("Worker nicht verfügbar. PaddleOCR startet im Hauptfenster …");
      }
    }

    if (!this.#ocr) {
      try {
        onStatus("PaddleOCR wird im Hauptfenster geladen …");
        this.#ocr = await PaddleOCR.create({ ...common, worker: false });
        this.#mode = "Hauptfenster · WASM/SIMD";
      } catch (mainError) {
        const workerText = workerError ? `Worker: ${safeError(workerError)}. ` : "";
        throw new Error(`${workerText}Hauptfenster: ${safeError(mainError)}`);
      }
    }

    this.#generation += 1;
    this.#modelKey = modelKey;
    this.#verified = false;
    this.#initSummary = this.#ocr.getInitializationSummary?.() ?? null;
    return {
      reused: false,
      mode: this.#mode,
      summary: this.#initSummary,
      verified: false,
      initMs: performance.now() - startedAt
    };
  }

  predict(image, params, options = {}) {
    const timeoutMs = Math.max(5000, Number(options.timeoutMs || DEFAULT_PREDICT_TIMEOUT_MS));
    const requestedGeneration = this.#generation;

    const task = async () => {
      const ocr = this.#ocr;
      if (!ocr) throw new Error("PaddleOCR wurde noch nicht initialisiert.");
      if (requestedGeneration !== this.#generation) throw createAbortError("OCR-Auftrag wurde verworfen.");

      const startedAt = performance.now();
      let timer = null;
      let aborter = null;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(createTimeoutError(timeoutMs)), timeoutMs);
      });
      const aborted = new Promise((_, reject) => {
        aborter = (message = "OCR-Auftrag abgebrochen") => reject(createAbortError(message));
        this.#activeAborters.add(aborter);
      });

      try {
        const [result] = await Promise.race([ocr.predict(image, params), timeout, aborted]);
        if (requestedGeneration !== this.#generation) throw createAbortError("OCR-Auftrag wurde verworfen.");
        this.#verified = true;
        return {
          result,
          wallMs: performance.now() - startedAt
        };
      } catch (error) {
        if (error?.name === "TimeoutError") {
          this.#detachAndDispose(ocr);
        }
        throw error;
      } finally {
        if (timer) clearTimeout(timer);
        if (aborter) this.#activeAborters.delete(aborter);
      }
    };

    const queued = this.#queue.then(task, task);
    this.#queue = queued.catch(() => undefined);
    return queued;
  }

  async abortCurrent(message = "OCR-Auftrag abgebrochen") {
    const current = this.#ocr;
    this.#detachCurrent();
    if (current) await disposeWithTimeout(current, DISPOSE_TIMEOUT_MS);
    return createAbortError(message);
  }

  async dispose() {
    const current = this.#ocr;
    this.#detachCurrent();
    if (current) await disposeWithTimeout(current, DISPOSE_TIMEOUT_MS);
  }

  #detachAndDispose(instance) {
    if (this.#ocr === instance) this.#detachCurrent();
    void disposeWithTimeout(instance, DISPOSE_TIMEOUT_MS);
  }

  #detachCurrent() {
    this.#generation += 1;
    for (const abort of this.#activeAborters) abort("OCR-Worker wurde verworfen.");
    this.#activeAborters.clear();
    this.#ocr = null;
    this.#modelKey = null;
    this.#mode = null;
    this.#initSummary = null;
    this.#verified = false;
    this.#queue = Promise.resolve();
  }
}

function getModel(modelKey) {
  const model = MODEL_OPTIONS[modelKey];
  if (!model) throw new Error(`Unbekanntes Modell: ${modelKey}`);
  return model;
}

function createCommonOptions(model) {
  const wasmPaths = new URL("./ort/", window.location.href).href;
  return {
    textDetectionModelName: model.textDetectionModelName,
    textRecognitionModelName: model.textRecognitionModelName,
    textDetectionBatchSize: 1,
    textRecognitionBatchSize: 8,
    ortOptions: {
      backend: "wasm",
      wasmPaths,
      numThreads: 1,
      simd: true
    }
  };
}

function createProbeCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 180;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#000000";
  context.font = "700 72px Arial, sans-serif";
  context.textBaseline = "middle";
  context.fillText("TEST 1234", 28, canvas.height / 2);
  return canvas;
}

async function disposeWithTimeout(instance, timeoutMs) {
  if (!instance?.dispose) return;
  try {
    await Promise.race([
      Promise.resolve(instance.dispose()),
      new Promise((resolve) => setTimeout(resolve, timeoutMs))
    ]);
  } catch {
    // Ein defekter Worker darf den Neustart nicht verhindern.
  }
}

function createTimeoutError(timeoutMs) {
  const error = new Error(`OCR-Analyse nach ${Math.round(timeoutMs / 1000)} Sekunden beendet.`);
  error.name = "TimeoutError";
  return error;
}

function createAbortError(message) {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}
