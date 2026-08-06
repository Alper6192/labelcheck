import { PaddleOCR } from "@paddleocr/paddleocr-js";
import { MODEL_OPTIONS } from "./config.js";
import { safeError } from "./utils.js";

export class PaddleOcrEngine {
  #ocr = null;
  #modelKey = null;
  #mode = null;
  #initSummary = null;
  #queue = Promise.resolve();
  #initPromise = null;
  #requestedModelKey = null;

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
      lang: model.lang,
      ocrVersion: "PP-OCRv5",
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

    this.#modelKey = modelKey;
    this.#initSummary = this.#ocr.getInitializationSummary?.() ?? null;
    return {
      reused: false,
      mode: this.#mode,
      summary: this.#initSummary,
      initMs: performance.now() - startedAt
    };
  }

  predict(image, params) {
    const task = async () => {
      if (!this.#ocr) throw new Error("PaddleOCR wurde noch nicht initialisiert.");
      const startedAt = performance.now();
      const [result] = await this.#ocr.predict(image, params);
      return {
        result,
        wallMs: performance.now() - startedAt
      };
    };

    const queued = this.#queue.then(task, task);
    this.#queue = queued.catch(() => undefined);
    return queued;
  }

  async dispose() {
    const current = this.#ocr;
    this.#ocr = null;
    this.#modelKey = null;
    this.#mode = null;
    this.#initSummary = null;
    if (current?.dispose) {
      try {
        await current.dispose();
      } catch {
        // Freigabe darf einen Neustart nicht verhindern.
      }
    }
  }
}
