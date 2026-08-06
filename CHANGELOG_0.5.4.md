# Änderungen 0.5.4

- Profileditor verwendet wieder einen einzelnen PaddleOCR-Web-Worker.
- OCR-Pfad entspricht dem bereits schnellen Scanner: Canvas direkt, Recognition-Batch 8, WASM/SIMD.
- Kein Hauptfensterbetrieb und kein automatischer Timeout-Fallback.
- Laufzeit wird sekundengenau angezeigt.
- „Analyse abbrechen“ beendet den Worker; anschließend kann das Modell manuell neu geladen werden.
- Masterbilder und OCR-Ergebnisse bleiben weiterhin je Profil getrennt.
