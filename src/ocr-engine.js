import { PaddleOCR } from "@paddleocr/paddleocr-js";
import { MODEL_OPTIONS } from "./config.js";
import { safeError } from "./utils.js";

const DEFAULT_PREDICT_TIMEOUT_MS = 60000;
const DISPOSE_TIMEOUT_MS = 4000;

export class PaddleOcrEngine {
  #ocr = null;
  #modelKey = null;
  #mode = null;
  #initSummary = null;
  #queue = Promise.resolve();
  #initPromise = null;
  #requestedModelKey = null;
  #generation = 0;
  #activeAborters = new Set();

  get ready() {
    return Boolean(this.#ocr);
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
    const model = MODEL_OPTIONS[modelKey];
    if (!model) throw new Error(`Unbekanntes Modell: ${modelKey}`);

    if (this.ready && this.#modelKey === modelKey) {
      return {
        reused: true,
        mode: this.#mode,
        summary: this.#initSummary,
        initMs: 0
      };
    }

    if (this.#initPromise && this.#requestedModelKey === modelKey) {
      return this.#initPromise;
    }

    if (this.#initPromise) {
      try {
        await this.#initPromise;
      } catch {
        // Der folgende neue Initialisierungsversuch liefert den relevanten Fehler.
      }
      if (this.ready && this.#modelKey === modelKey) {
        return {
          reused: true,
          mode: this.#mode,
          summary: this.#initSummary,
          initMs: 0
        };
      }
    }

    this.#requestedModelKey = modelKey;
    const operation = this.#initializeInternal(modelKey, model, onStatus);
    this.#initPromise = operation;
    try {
      return await operation;
    } finally {
      if (this.#initPromise === operation) {
        this.#initPromise = null;
        this.#requestedModelKey = null;
      }
    }
  }

  async #initializeInternal(modelKey, model, onStatus) {
    await this.dispose();
    const startedAt = performance.now();
    const wasmPaths = new URL("./ort/", window.location.href).href;
    const common = {
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

    let workerError = null;
    try {
      onStatus("PaddleOCR wird im Web Worker geladen …");
      this.#ocr = await PaddleOCR.create({ ...common, worker: true });
      this.#mode = "Web Worker · WASM/SIMD";
    } catch (error) {
      workerError = error;
      this.#ocr = null;
      onStatus("Worker nicht verfügbar. PaddleOCR startet im Hauptfenster …");
    }

    if (!this.#ocr) {
      try {
        this.#ocr = await PaddleOCR.create({ ...common, worker: false });
        this.#mode = "Hauptfenster · WASM/SIMD";
      } catch (mainError) {
        const workerText = workerError ? `Worker: ${safeError(workerError)}. ` : "";
        throw new Error(`${workerText}Hauptfenster: ${safeError(mainError)}`);
      }
    }

    this.#generation += 1;
    this.#modelKey = modelKey;
    this.#initSummary = this.#ocr.getInitializationSummary?.() ?? null;
    return {
      reused: false,
      mode: this.#mode,
      summary: this.#initSummary,
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
    const error = createAbortError(message);
    return error;
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
    this.#queue = Promise.resolve();
  }
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
