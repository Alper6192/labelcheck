# LabelCheck PaddleOCR 0.5.4

Statische GitHub-Pages-Anwendung zum Erfassen und Vergleichen von Produkt- und VDA-Etiketten mit PP-OCRv5.

## Scanner

Der Scanner verwendet PaddleOCR im Web Worker mit WASM/SIMD und verarbeitet Produkt- und VDA-Bilder vollständig lokal im Browser.

## Profileditor

Der Profileditor verwendet ab Version 0.5.4 denselben schnellen OCR-Pfad wie der Scanner:

- genau ein Web Worker
- Canvas wird direkt an PaddleOCR übergeben
- Recognition-Batch 8
- kein langsamer Hauptfensterbetrieb
- kein automatischer Timeout- oder Parallel-Fallback

Während der Analyse bleibt die Oberfläche bedienbar und zeigt die verstrichene Zeit an. „Analyse abbrechen“ beendet den Worker. Danach muss das Modell einmal neu geladen werden.

Masterbilder und OCR-Ergebnisse werden getrennt pro Profil nur im aktuellen Browser-Tab gehalten. Sie werden nicht in `label-profiles.json` eingebettet und nicht hochgeladen.

## Entwicklung

```bash
npm install
npm test
npm run build
```
