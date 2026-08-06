# LabelCheck PaddleOCR-Test 0.3.1

Diese Stufe prüft ausschließlich die OCR-Basis im Smartphone-Browser. Es gibt noch keinen Profilvergleich und keinen Excel-Export.

## Korrektur gegenüber 0.3.0

PaddleOCR.js 0.4.x akzeptiert die Kombination `lang: "de"` und `ocrVersion: "PP-OCRv5"` im Browser derzeit nicht. Die Anwendung verwendet deshalb die von der offiziellen Browser-Dokumentation vorgesehenen eingebauten Modellnamen direkt:

- `PP-OCRv5_mobile_det`
- `PP-OCRv5_mobile_rec`

Damit startet der Browser-Prototyp ohne die fehlerhafte Sprachzuordnung. Für die spätere produktive Stufe soll das spezielle `latin_PP-OCRv5_mobile_rec` als eigenes Modellarchiv über GitHub Pages ausgeliefert und mit den echten Etiketten verglichen werden.

## Testziel

- Welche Texte erkennt PP-OCRv5?
- Welche Textboxen und Konfidenzwerte werden geliefert?
- Wie lange dauern Detektion und Erkennung auf Privat- und Firmenhandy?
- Reicht das Standardmodell bereits für Batch, IDH, Gewicht und Kundennamen?

## Technik

- offizielles Paket `@paddleocr/paddleocr-js`
- PP-OCRv5 Mobile Detektion und Standarderkennung
- WASM/SIMD, bevorzugt im Web Worker
- lokale Verarbeitung der Fotos
- JSON-Export der Messergebnisse

## Bedienung

1. Seite öffnen und auf `PaddleOCR bereit` warten.
2. Qualität zunächst auf `Ausgewogen` lassen.
3. Produkt- und VDA-Label aufnehmen.
4. Text, Konfidenz, Boxen und Laufzeiten prüfen.
5. Ergebnisse als JSON exportieren.

## Nächste Stufe

Nach dem erfolgreichen Gerätetest folgen:

- Vergleich Standardmodell gegen `latin_PP-OCRv5_mobile_rec`
- fester Aufnahmebereich
- Profil-Editor mit großzügigen Feldzonen
- Feldzuordnung über Zone, Regex und Konfidenz
- Produkt-/VDA-Vergleich
- Excel-Export
