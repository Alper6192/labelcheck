# LabelCheck PaddleOCR 0.16.11

LabelCheck prüft Produkt- und Lieferschein-/VDA-Labels lokal im Browser. Die Profile werden aus `public/config/label-profiles.json` geladen und können im Profileditor bearbeitet werden.

## Laufzeit

- Mobilgeräte starten standardmäßig im stabilen Modus: WASM, 1 Thread, Recognition-Batch 1, verkleinerte Bilddekodierung.
- Desktop/Notebook startet standardmäßig im schnellen AUTO-Modus mit WebGPU/WASM.
- Eine manuelle Moduswahl wird lokal pro Browser gespeichert.
- Ein erkannter Browserabsturz während OCR erzwingt beim nächsten Start automatisch den stabilen Modus.
- Die PP-OCRv5-Modelle werden beim GitHub-Actions-Build in die Pages-Site kopiert und zur Laufzeit same-origin geladen.

## Intern2

Intern2 verwendet ausschließlich `Prüflos` als Anker. Wird der Text zusammen mit einer längeren OCR-Zeile erkannt, wird nur der Teilbereich von `Prüflos` für die Geometrie verwendet. `Alte Materialnummer` schließt Intern2 ausdrücklich aus.

## Tesla

Tesla-Versandlabel werden ohne PaddleOCR aus dem kleinen QR-Code links unten gelesen. Auch eine manuelle Tesla-Auswahl startet erneut die QR-Erkennung. Der Parser verwendet:

- `1T` → Batch
- `99Z` → Lieferscheinnummer
- `Q` + `3Q` → Gewicht und Einheit

Tesla besitzt in dieser Prüfung keine IDH; der IDH-Vergleich wird für dieses Profil übersprungen.

## Scanprotokoll und CSV

Kontrollen werden lokal in IndexedDB gespeichert; vorhandene Datensätze aus dem bisherigen localStorage werden beim ersten Start übernommen. Nach einer erfolgreichen Übernahme bleibt der Speicher-Button gesperrt, bis ein Scan, Profil oder Feld geändert beziehungsweise erneut analysiert wurde.

Jede übernommene Kontrolle entspricht einer Zeile. Enthalten sind Zeit, Ergebnis, Produkt-/Lieferschein-Batch, Produkt-/Lieferschein-IDH, Produkt-/Lieferschein-Gewicht, Lieferscheinnummer und ergänzende Protokollinformationen.

Dateiname: `Labelcheck_YYYY-MM-DD_HH-MM-SS.csv`.

## Profileditor

Masterbilder und OCR-Ergebnisse werden profilbezogen in IndexedDB auf dem jeweiligen Browser gespeichert. Sie werden nicht in die JSON eingebettet und nicht auf GitHub hochgeladen.

## Deployment

```bash
npm install
npm test
npm run build
```

GitHub Pages veröffentlicht den erzeugten `dist`-Ordner über GitHub Actions.
