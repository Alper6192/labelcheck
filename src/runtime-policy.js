const COMPATIBILITY_KEY = "labelcheck.ocr.compatibility.v1";
const OCR_INFLIGHT_KEY = "labelcheck.ocr.inflight.v1";
const MAX_RECOVERY_AGE_MS = 30 * 60 * 1000;
let memoryCompatibility = false;
let memoryReason = "";

/**
 * Laufzeitstrategie für Scanner und Editor.
 *
 * Normalmodus: AUTO (WebGPU/WASM), großer Batch.
 * Kompatibilitätsmodus: ausschließlich WASM, 1 Thread, Batch 1 und kleinere
 * Scannerbilder. Der Modus wird automatisch aktiviert, wenn die vorherige
 * Seite während einer markierten OCR-Inferenz beendet/neugeladen wurde.
 */
export function detectRuntimePolicy({ compatibilityMode = false } = {}) {
  if (compatibilityMode) {
    return {
      family: "compatibility",
      compatibilityMode: true,
      label: "Kompatibilität · WASM/1 Thread",
      backend: "wasm",
      numThreads: 1,
      textRecognitionBatchSize: 1,
      scannerMaxImageSide: 1200,
      scannerDetLimitSideLen: 640,
      textDetMaxSideLimit: 1600,
      previewMaxSide: 720,
      resizeDuringDecode: true
    };
  }

  return {
    family: "default",
    compatibilityMode: false,
    label: "AUTO · WebGPU/WASM",
    backend: "auto",
    numThreads: 0,
    textRecognitionBatchSize: 8,
    scannerMaxImageSide: null,
    scannerDetLimitSideLen: null,
    textDetMaxSideLimit: 2400,
    previewMaxSide: 1100,
    resizeDuringDecode: false
  };
}

export function getRuntimePolicy() {
  return detectRuntimePolicy({ compatibilityMode: isCompatibilityMode() });
}

export function isCompatibilityMode() {
  try {
    if (globalThis.localStorage?.getItem(COMPATIBILITY_KEY) === "1") return true;
  } catch {
    // Fallback auf den In-Memory-Status.
  }
  return memoryCompatibility;
}

export function getCompatibilityReason() {
  try {
    const stored = globalThis.localStorage?.getItem(`${COMPATIBILITY_KEY}:reason`);
    if (stored) return stored;
  } catch {
    // Fallback auf den In-Memory-Status.
  }
  return memoryReason;
}

export function setCompatibilityMode(enabled, reason = "manual") {
  memoryCompatibility = Boolean(enabled);
  memoryReason = enabled ? String(reason || "manual") : "";
  try {
    if (enabled) {
      globalThis.localStorage?.setItem(COMPATIBILITY_KEY, "1");
      globalThis.localStorage?.setItem(`${COMPATIBILITY_KEY}:reason`, String(reason || "manual"));
    } else {
      globalThis.localStorage?.removeItem(COMPATIBILITY_KEY);
      globalThis.localStorage?.removeItem(`${COMPATIBILITY_KEY}:reason`);
    }
  } catch {
    // Storage kann im Privatmodus/unter MDM gesperrt sein. Dann bleibt nur der
    // normale Laufzeitpfad; die App darf deshalb nicht selbst scheitern.
  }
}

export function markOcrInFlight(stage = "predict", details = {}) {
  try {
    globalThis.localStorage?.setItem(OCR_INFLIGHT_KEY, JSON.stringify({
      startedAt: Date.now(),
      stage,
      ...details
    }));
  } catch {
    // Best effort.
  }
}

export function clearOcrInFlight() {
  try {
    globalThis.localStorage?.removeItem(OCR_INFLIGHT_KEY);
  } catch {
    // Best effort.
  }
}

/**
 * Muss direkt beim App-Start aufgerufen werden. Ein Marker bleibt nur dann
 * stehen, wenn der Browserprozess während der OCR beendet oder die Seite hart
 * neu geladen wurde. Normale Fehlerpfade entfernen ihn in finally-Blöcken.
 */
export function recoverCompatibilityMode(now = Date.now()) {
  try {
    const raw = globalThis.localStorage?.getItem(OCR_INFLIGHT_KEY);
    if (!raw) return { recovered: false, marker: null };

    globalThis.localStorage?.removeItem(OCR_INFLIGHT_KEY);
    const marker = JSON.parse(raw);
    const age = Math.max(0, Number(now) - Number(marker?.startedAt || 0));
    if (!Number.isFinite(age) || age > MAX_RECOVERY_AGE_MS) {
      return { recovered: false, marker };
    }

    setCompatibilityMode(true, "ocr-crash-recovery");
    return { recovered: true, marker };
  } catch {
    return { recovered: false, marker: null };
  }
}
