import { PaddleOCR } from "@paddleocr/paddleocr-js";
import { MODEL_OPTIONS } from "./config.js";

/**
 * OCR-Lauf des Profileditors.
 *
 * Wichtig: Der Editor benutzt genau denselben schnellen Laufzeitpfad wie der
 * Scanner: einen einzelnen PaddleOCR-Web-Worker mit WASM/SIMD. Es gibt keinen
 * Zeitüberschreitungs-Fallback und keine zweite parallele OCR-Instanz.
 */
export class EditorPaddleOcrEngine {
  #ocr = null;
  #modelKey = null;
  #initPromise = null;
  #predictPromise = null;
  #summary = null;

  get ready() {
    return Boolean(this.#ocr);
  }

  get busy() {
    return Boolean(this.#predictPromise);
  }

  get mode() {
    return "Web Worker · WASM/SIMD";
  }

  get summary() {
    return this.#summary;
  }

  async initialize(modelKey, onStatus = () => {}, force = false) {
    if (!force && this.ready && this.#modelKey === modelKey) {
      return { reused: true, mode: this.mode, summary: this.#summary, initMs: 0 };
    }
    if (this.#initPromise) return this.#initPromise;
    if (this.#predictPromise) throw new Error("PaddleOCR analysiert bereits ein Bild.");

    const operation = this.#initializeInternal(modelKey, onStatus, force);
    this.#initPromise = operation;
    try {
      return await operation;
    } finally {
      if (this.#initPromise === operation) this.#initPromise = null;
    }
  }

  async #initializeInternal(modelKey, onStatus, force) {
    const model = MODEL_OPTIONS[modelKey];
    if (!model) throw new Error(`Unbekanntes Modell: ${modelKey}`);

    if (force) await this.dispose();
    if (this.ready && this.#modelKey === modelKey) {
      return { reused: true, mode: this.mode, summary: this.#summary, initMs: 0 };
    }

    const startedAt = performance.now();
    const wasmPaths = new URL("./ort/", window.location.href).href;
    onStatus("PaddleOCR wird im Web Worker geladen …");

    this.#ocr = await PaddleOCR.create({
      textDetectionModelName: model.textDetectionModelName,
      textRecognitionModelName: model.textRecognitionModelName,
      textDetectionBatchSize: 1,
      textRecognitionBatchSize: 2,
      worker: true,
      ortOptions: {
        backend: "wasm",
        wasmPaths,
        numThreads: 1,
        simd: true
      }
    });

    this.#modelKey = modelKey;
    this.#summary = this.#ocr.getInitializationSummary?.() ?? null;
    return {
      reused: false,
      mode: this.mode,
      summary: this.#summary,
      initMs: performance.now() - startedAt
    };
  }

  async predict(canvas, params, onStatus = () => {}) {
    if (!this.#ocr) throw new Error("PaddleOCR wurde noch nicht initialisiert.");
    if (this.#predictPromise) throw new Error("PaddleOCR analysiert bereits ein Bild.");
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new TypeError("Für die OCR wird ein Canvas-Masterbild benötigt.");
    }

    const operation = this.#predictInternal(canvas, params, onStatus);
    this.#predictPromise = operation;
    try {
      return await operation;
    } finally {
      if (this.#predictPromise === operation) this.#predictPromise = null;
    }
  }

  async #predictInternal(canvas, params, onStatus) {
    const startedAt = performance.now();
    onStatus("PaddleOCR erkennt Text im Web Worker …");

    // Das für den Editor verkleinerte OCR-Canvas direkt
    // an PaddleOCR übergeben. Keine erneute JPEG-Komprimierung im Hauptfenster.
    const [result] = await this.#ocr.predict(canvas, params);
    if (!result) throw new Error("PaddleOCR hat kein Ergebnis zurückgegeben.");
    return { result, wallMs: performance.now() - startedAt };
  }

  async abort() {
    const current = this.#ocr;
    this.#ocr = null;
    this.#modelKey = null;
    this.#summary = null;
    if (current?.dispose) await current.dispose();
  }

  async dispose() {
    if (this.#predictPromise) {
      throw new Error("Das Modell kann während einer laufenden Analyse nicht neu geladen werden.");
    }
    const current = this.#ocr;
    this.#ocr = null;
    this.#modelKey = null;
    this.#summary = null;
    if (current?.dispose) await current.dispose();
  }
}
