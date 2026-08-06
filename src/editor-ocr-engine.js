import { PaddleOCR } from "@paddleocr/paddleocr-js";
import { MODEL_OPTIONS } from "./config.js";

/**
 * Bewusst einfacher OCR-Lauf für den Profileditor.
 *
 * Der Scanner nutzt weiterhin den Web Worker. Im Editor wird PaddleOCR dagegen
 * genau einmal im Hauptfenster initialisiert. Dadurch kann kein abgelaufener
 * Worker-Auftrag im Hintergrund weiterlaufen und mit einer zweiten ORT-/OpenCV-
 * Instanz konkurrieren.
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
    return "Hauptfenster · WASM/SIMD";
  }

  get summary() {
    return this.#summary;
  }

  async initialize(modelKey, onStatus = () => {}, force = false) {
    if (!force && this.ready && this.#modelKey === modelKey) {
      return { reused: true, mode: this.mode, summary: this.#summary, initMs: 0 };
    }
    if (this.#initPromise) return this.#initPromise;

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
    if (this.#predictPromise) {
      throw new Error("PaddleOCR analysiert bereits ein Bild.");
    }
    if (force) await this.dispose();
    if (this.ready && this.#modelKey === modelKey) {
      return { reused: true, mode: this.mode, summary: this.#summary, initMs: 0 };
    }

    const startedAt = performance.now();
    const wasmPaths = new URL("./ort/", window.location.href).href;
    onStatus("PaddleOCR wird einmalig im Hauptfenster geladen …");

    // worker:false ist hier absichtlich fest. Kein Probe-Worker, kein Timeout-
    // Fallback und keine zweite, parallel startende OCR-Instanz.
    this.#ocr = await PaddleOCR.create({
      textDetectionModelName: model.textDetectionModelName,
      textRecognitionModelName: model.textRecognitionModelName,
      textDetectionBatchSize: 1,
      textRecognitionBatchSize: 4,
      worker: false,
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
    onStatus("Masterbild wird für PaddleOCR vorbereitet …");
    const blob = await canvasToBlob(canvas);
    onStatus("PaddleOCR erkennt Text im Hauptfenster …");
    const [result] = await this.#ocr.predict(blob, params);
    if (!result) throw new Error("PaddleOCR hat kein Ergebnis zurückgegeben.");
    return { result, wallMs: performance.now() - startedAt };
  }

  async dispose() {
    if (this.#predictPromise) {
      throw new Error("Das Modell kann während einer laufenden Analyse nicht neu geladen werden.");
    }
    const current = this.#ocr;
    this.#ocr = null;
    this.#modelKey = null;
    this.#summary = null;
    if (current?.dispose) {
      try {
        await current.dispose();
      } catch {
        // Ein fehlgeschlagenes Dispose darf einen späteren Seiten-Neustart nicht blockieren.
      }
    }
  }
}

function canvasToBlob(canvas) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new TypeError("Für die OCR wird ein Canvas-Masterbild benötigt.");
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Masterbild konnte nicht in ein OCR-Bild umgewandelt werden.")),
      "image/jpeg",
      0.94
    );
  });
}
