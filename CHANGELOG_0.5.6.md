# Änderungen 0.5.6

- Scanner und Profileditor verwenden dieselbe `PaddleOcrEngine`.
- ONNX Runtime wird mit `backend: "auto"` gestartet: WebGPU wird bevorzugt, WASM bleibt Fallback.
- `numThreads: 1` wurde entfernt; `numThreads: 0` überlässt die mögliche Threadzahl ONNX Runtime.
- Die fest codierte Anzeige „WASM/SIMD“ wurde entfernt.
- Nach einer Analyse werden die tatsächlich gemeldeten Provider für Detektion und Erkennung angezeigt.
- Detektions- und Erkennungszeit werden getrennt dargestellt.
- Keine künstliche 60-Sekunden-Inferenz-Zeitüberschreitung mehr, da sie den laufenden `predict()`-Aufruf nicht zuverlässig beendet.
- Der Build prüft, ob die JSEP-WASM-Datei für WebGPU nach `public/ort` kopiert wurde.
- Batch und Fassnummer können weiterhin über „Batch + Fassnummer“ aus derselben OCR-Zeile zugewiesen werden.
