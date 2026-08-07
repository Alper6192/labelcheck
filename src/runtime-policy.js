const COMPATIBILITY_KEY = "labelcheck.ocr.compatibility.v1";
const MODE_PREFERENCE_KEY = "labelcheck.ocr.mode.preference.v1";
const OCR_INFLIGHT_KEY = "labelcheck.ocr.inflight.v1";
const MAX_RECOVERY_AGE_MS = 30 * 60 * 1000;
let memoryCompatibility = false;
let memoryReason = "";
let memoryPreference = "";

/**
 * Laufzeitstrategie für Scanner und Editor.
 *
 * Mobilgeräte starten standardmäßig im stabilen Kompatibilitätsmodus. Auf
 * Desktop/Notebook bleibt AUTO aktiv. Eine manuelle Auswahl wird pro Browser
 * gespeichert. Crash-Recovery kann jederzeit wieder auf den stabilen Modus
 * schalten.
 */
export function detectRuntimePolicy({ compatibilityMode = false } = {}) {
  if (compatibilityMode) {
    return {
      family: "compatibility",
      compatibilityMode: true,
      label: "Stabil · WASM/1 Thread",
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
    label: "Schnell · AUTO/WebGPU/WASM",
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

export function isMobileLike(navigatorLike = globalThis.navigator) {
  const nav = navigatorLike || {};
  if (nav.userAgentData?.mobile === true) return true;
  const ua = String(nav.userAgent || "");
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  // iPadOS kann sich gegenüber Webseiten als Macintosh ausgeben.
  if (/Macintosh/i.test(ua) && Number(nav.maxTouchPoints || 0) > 1) return true;
  return false;
}

export function isCompatibilityMode() {
  const preference = getModePreference();
  if (preference === "stable") return true;
  if (preference === "fast") return false;

  try {
    if (globalThis.localStorage?.getItem(COMPATIBILITY_KEY) === "1") return true;
  } catch {
    // Fallback auf den In-Memory-Status.
  }
  if (memoryCompatibility) return true;

  // Kein Nutzerwunsch gespeichert: auf Telefonen/Tablets sofort stabil starten.
  return isMobileLike();
}

export function getCompatibilityReason() {
  try {
    const stored = globalThis.localStorage?.getItem(`${COMPATIBILITY_KEY}:reason`);
    if (stored) return stored;
  } catch {
    // Fallback auf den In-Memory-Status.
  }
  if (memoryReason) return memoryReason;
  if (!getModePreference() && isMobileLike()) return "mobile-default";
  return "";
}

export function getModePreference() {
  try {
    const stored = globalThis.localStorage?.getItem(MODE_PREFERENCE_KEY);
    if (stored === "stable" || stored === "fast") return stored;
  } catch {
    // Fallback.
  }
  return memoryPreference;
}

export function setCompatibilityMode(enabled, reason = "manual") {
  memoryCompatibility = Boolean(enabled);
  memoryReason = enabled ? String(reason || "manual") : "";

  // Bei manueller Wahl oder Crash-Recovery soll die Entscheidung beim nächsten
  // Besuch auf genau diesem Gerät erhalten bleiben.
  const persistPreference = reason === "manual" || reason === "ocr-crash-recovery";
  if (persistPreference) memoryPreference = enabled ? "stable" : "fast";

  try {
    if (enabled) {
      globalThis.localStorage?.setItem(COMPATIBILITY_KEY, "1");
      globalThis.localStorage?.setItem(`${COMPATIBILITY_KEY}:reason`, String(reason || "manual"));
    } else {
      globalThis.localStorage?.removeItem(COMPATIBILITY_KEY);
      globalThis.localStorage?.removeItem(`${COMPATIBILITY_KEY}:reason`);
    }
    if (persistPreference) {
      globalThis.localStorage?.setItem(MODE_PREFERENCE_KEY, enabled ? "stable" : "fast");
    }
  } catch {
    // Storage kann im Privatmodus/unter MDM gesperrt sein. Dann bleibt der
    // In-Memory-Status für die aktuelle Sitzung erhalten.
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
