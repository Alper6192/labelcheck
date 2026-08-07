/**
 * Einheitliche Laufzeitstrategie für alle Browser.
 *
 * Die bisherige iOS-Sonderbehandlung wurde entfernt, weil das beobachtete
 * Verhalten netzwerkabhängig war: Android und iPhone scheiterten im
 * Firmennetz, Android funktionierte außerhalb des Firmennetzes.
 *
 * Alle Geräte verwenden deshalb wieder denselben AUTO-Pfad. WebGPU wird
 * genutzt, wenn ONNX Runtime/PaddleOCR es tatsächlich verwenden können;
 * sonst fällt die Runtime auf WASM zurück.
 */
export function detectRuntimePolicy() {
  return {
    family: "default",
    label: "AUTO · WebGPU/WASM",
    backend: "auto",
    numThreads: 0,
    textRecognitionBatchSize: 8,
    scannerMaxImageSide: null,
    scannerDetLimitSideLen: null,
    previewMaxSide: 1100
  };
}

export const RUNTIME_POLICY = detectRuntimePolicy();
