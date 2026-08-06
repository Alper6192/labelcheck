# LabelCheck PaddleOCR-Prototyp 0.3.0

Dieser Stand ist bewusst ein isolierter Machbarkeitstest. Er enthält noch keinen Editor, keine Feldprofile, keinen Produkt-/VDA-Vergleich und keinen Excel-Export.

## Ziel dieses Tests

Auf dem privaten und dem verwalteten Firmenhandy messen:

- Welche Texte erkennt PP-OCRv5?
- Welche Polygonkoordinaten und Konfidenzen werden geliefert?
- Wie lange dauern Detektion und Erkennung?
- Funktioniert der offizielle Web-Worker oder wird der Hauptfenster-Fallback verwendet?
- Ist das lateinische oder das englische Erkennungsmodell für die Etiketten besser?

## Technik

- `@paddleocr/paddleocr-js` 0.4.2
- PP-OCRv5 Mobile Detektion
- standardmäßig lateinisches PP-OCRv5-Erkennungsmodell (`lang: de`)
- zuverlässiges WASM/SIMD-Backend mit einem Thread
- Web-Worker mit automatischem Hauptfenster-Fallback
- GitHub Pages und GitHub Actions

## Datenschutz in dieser Teststufe

Die Fotos werden lokal im Browser verarbeitet und nicht hochgeladen. Beim ersten Initialisieren lädt das offizielle PaddleOCR.js-SDK die gewählten Modellarchive von der offiziellen PaddleOCR-Modellquelle. Nach erfolgreichem Gerätetest werden diese Modellarchive in der nächsten Stufe in die GitHub-Pages-Ausgabe gespiegelt, sodass auch die Modellversorgung über die eigene GitHub-Adresse läuft.

## Lokale Entwicklung

```bash
npm install
npm run dev
```

## Build

```bash
npm test
npm run build
```

## Nächste Stufe nach erfolgreichem Test

1. Modellarchive auf GitHub Pages spiegeln.
2. Aufnahmehilfe mit festem Rahmen ergänzen.
3. Neuer Zonen-Editor ohne OCR im Editor.
4. Produktprofil fest, VDA-Profil über Kundenname.
5. Batch, IDH und Gewicht per Zone + Regex zuordnen.
6. Vergleich, lokales Protokoll und XLSX-Export ergänzen.
