import { PaddleOCR } from "@paddleocr/paddleocr-js";
import { MODEL_OPTIONS } from "./config.js";
import { safeError } from "./utils.js";
import { RUNTIME_POLICY } from "./runtime-policy.js";

const DISPOSE_TIMEOUT_MS = 5000;

/**
 * Gemeinsame PaddleOCR-Laufzeit für Scanner und Profileditor.
 *
 * - genau ein dedizierter Worker
 * - alle Browser: Backend AUTO (WebGPU bevorzugt, WASM als Fallback)
 * - OCR-Modelle werden same-origin von GitHub Pages geladen
 * - keine künstliche Inferenz-Zeitüberschreitung; ein Timeout beendet predict()
 *   nicht zuverlässig und kann sonst eine zweite konkurrierende Instanz erzeugen
 */
export class PaddleOcrEngine {
  #ocr = null;
  #modelKey = null;
  #initPromise = null;
  #queue = Promise.resolve();
  #pendingCount = 0;
  #generation = 0;
  #summary = null;
  #lastRuntime = null;
  #mode = `Web Worker · ${RUNTIME_POLICY.label}`;

  get ready() {
    return Boolean(this.#ocr);
  }

  get busy() {
    return this.#pendingCount > 0;
  }

  get modelKey() {
    return this.#modelKey;
  }

  get mode() {
    return this.#mode;
  }

  get summary() {
    return this.#summary;
  }

  get runtime() {
    return this.#lastRuntime;
  }

  get diagnostics() {
    return createRuntimeDiagnostics(this.#summary, this.#lastRuntime);
  }

  async initialize(modelKey, onStatus = () => {}, force = false) {
    if (!force && this.ready && this.#modelKey === modelKey) {
      return this.#reuseInfo();
    }
    if (this.#initPromise) return this.#initPromise;
    if (this.busy) throw new Error("PaddleOCR verarbeitet bereits ein Bild.");

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

    if (force || (this.ready && this.#modelKey !== modelKey)) {
      await this.dispose();
    }
    if (this.ready && this.#modelKey === modelKey) return this.#reuseInfo();

    const startedAt = performance.now();
    const options = createCommonOptions(model);
    onStatus(`PaddleOCR lädt im Web Worker · ${RUNTIME_POLICY.label} …`);

    try {
      this.#ocr = await PaddleOCR.create({ ...options, worker: true });
    } catch (error) {
      this.#ocr = null;
      throw new Error(`Web-Worker konnte nicht initialisiert werden: ${safeError(error)}`);
    }

    this.#generation += 1;
    this.#modelKey = modelKey;
    this.#summary = this.#ocr.getInitializationSummary?.() ?? null;
    this.#lastRuntime = null;
    this.#mode = describeRuntimeMode(this.#summary, null);

    return {
      reused: false,
      mode: this.#mode,
      summary: this.#summary,
      diagnostics: this.diagnostics,
      initMs: performance.now() - startedAt
    };
  }

  predict(image, params = {}) {
    const requestedGeneration = this.#generation;
    this.#pendingCount += 1;

    const task = async () => {
      const ocr = this.#ocr;
      if (!ocr) throw new Error("PaddleOCR wurde noch nicht initialisiert.");
      if (requestedGeneration !== this.#generation) {
        throw createAbortError("OCR-Auftrag wurde verworfen.");
      }

      const startedAt = performance.now();
      const [result] = await ocr.predict(image, params);
      if (!result) throw new Error("PaddleOCR hat kein Ergebnis zurückgegeben.");
      if (requestedGeneration !== this.#generation) {
        throw createAbortError("OCR-Auftrag wurde verworfen.");
      }

      this.#lastRuntime = result.runtime ?? null;
      this.#mode = describeRuntimeMode(this.#summary, this.#lastRuntime);
      return {
        result,
        wallMs: performance.now() - startedAt,
        mode: this.#mode,
        runtime: this.#lastRuntime,
        diagnostics: this.diagnostics
      };
    };

    const queued = this.#queue.then(task, task);
    this.#queue = queued.catch(() => undefined);
    return queued.finally(() => {
      this.#pendingCount = Math.max(0, this.#pendingCount - 1);
    });
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

  #detachCurrent() {
    this.#generation += 1;
    this.#ocr = null;
    this.#modelKey = null;
    this.#summary = null;
    this.#lastRuntime = null;
    this.#mode = `Web Worker · ${RUNTIME_POLICY.label}`;
    this.#queue = Promise.resolve();
    this.#pendingCount = 0;
  }

  #reuseInfo() {
    return {
      reused: true,
      mode: this.#mode,
      summary: this.#summary,
      diagnostics: this.diagnostics,
      initMs: 0
    };
  }
}

export function createCommonOptions(model) {
  const wasmPaths = new URL("./ort/", window.location.href).href;
  const modelBase = new URL("./models/", window.location.href);
  return {
    textDetectionModelName: model.textDetectionModelName,
    textDetectionModelAsset: {
      url: new URL(model.textDetectionModelFile, modelBase).href
    },
    textRecognitionModelName: model.textRecognitionModelName,
    textRecognitionModelAsset: {
      url: new URL(model.textRecognitionModelFile, modelBase).href
    },
    textDetectionBatchSize: 1,
    textRecognitionBatchSize: RUNTIME_POLICY.textRecognitionBatchSize,
    ortOptions: {
      backend: RUNTIME_POLICY.backend,
      wasmPaths,
      numThreads: RUNTIME_POLICY.numThreads,
      simd: true
    }
  };
}

export function createRuntimeDiagnostics(summary = null, runtime = null) {
  const requestedBackend = runtime?.requestedBackend ?? summary?.backend ?? RUNTIME_POLICY.backend;
  const detProvider = runtime?.detProvider ?? summary?.detProvider ?? null;
  const recProvider = runtime?.recProvider ?? summary?.recProvider ?? null;
  return {
    requestedBackend,
    detProvider,
    recProvider,
    webgpuAvailable: runtime?.webgpuAvailable ?? summary?.webgpuAvailable ?? Boolean(globalThis.navigator?.gpu),
    hardwareConcurrency: Number(globalThis.navigator?.hardwareConcurrency || 0) || null,
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    configuredThreads: RUNTIME_POLICY.numThreads,
    simdRequested: true
  };
}

export function describeRuntimeMode(summary = null, runtime = null) {
  const info = createRuntimeDiagnostics(summary, runtime);
  const det = formatProvider(info.detProvider);
  const rec = formatProvider(info.recProvider);

  if (det && rec) {
    const provider = det === rec ? det : `${det}/${rec}`;
    return `Web Worker · ${provider}`;
  }
  return `Web Worker · ${RUNTIME_POLICY.label}`;
}

export function formatRuntimeDetails(summary = null, runtime = null) {
  const info = createRuntimeDiagnostics(summary, runtime);
  const parts = [];
  if (info.detProvider) parts.push(`Detektor ${formatProvider(info.detProvider)}`);
  if (info.recProvider) parts.push(`Erkennung ${formatProvider(info.recProvider)}`);
  parts.push(`Backend-Anfrage ${String(info.requestedBackend).toUpperCase()}`);
  parts.push(`CPU-Kerne ${info.hardwareConcurrency ?? "unbekannt"}`);
  parts.push(info.configuredThreads > 0
    ? `Threads ${info.configuredThreads}`
    : `Threads automatisch${info.crossOriginIsolated ? " · Mehrthread möglich" : " · derzeit Einzelthread-Fallback möglich"}`);
  parts.push("Modelle lokal · GitHub Pages");
  parts.push(`WebGPU-API ${info.webgpuAvailable ? "verfügbar" : "nicht verfügbar"}`);
  return parts.join(" · ");
}

function formatProvider(provider) {
  const value = String(provider || "").trim().toLowerCase();
  if (!value) return "";
  if (value === "webgpu") return "WebGPU";
  if (value === "wasm" || value === "cpu") return "WASM";
  if (value === "webnn") return "WebNN";
  if (value === "webgl") return "WebGL";
  return value.toUpperCase();
}

async function disposeWithTimeout(instance, timeoutMs) {
  if (!instance?.dispose) return;
  try {
    await Promise.race([
      Promise.resolve(instance.dispose()),
      new Promise((resolve) => setTimeout(resolve, timeoutMs))
    ]);
  } catch {
    // Ein defekter Worker darf einen Neustart nicht verhindern.
  }
}

function createAbortError(message) {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}
