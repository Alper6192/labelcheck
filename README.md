# LabelCheck PaddleOCR 0.17.0

LabelCheck prüft weiterhin immer **ein Produktlabel** gegen **ein VDA-/TA-Label**. Die Bedienoberfläche, Freigabelogik, Kamera, Bedienerprüfung, Scanprotokoll und CSV-Funktion bleiben wie in 0.16.22. Neu in 0.17.0 ist die Profilarchitektur: **alle labelabhängigen Erkennungsregeln liegen in `public/config/label-profiles.json` und können vollständig im erweiterten Profileditor gepflegt werden.**

## Architektur

Die Scanner-App ist eine generische Engine. Sie kennt keine einzelnen Kunden-/Labelprofile mehr als Sonderfall im JavaScript. Ein Profil beschreibt in der JSON:

- Rolle: Produktlabel oder VDA-/TA-Label
- Quelle: OCR/Textlayout oder QR-Code
- Profilanker und alternative Anker
- zusätzliche Erkennungs- und Ausschlussmerkmale
- Mindestquoten für Profilerkennung und Labelvalidierung
- feste LabelCheck-Felder: Batch, IDH, Gewicht, Lieferscheinnummer, Fassnummer
- Feldzonen, Regex, Normalizer und Pflicht-/Vergleichsstatus
- Locator-Regeln relativ zu Feldbeschriftungen
- Erkennungsstrategien und deren Parameter
- QR-Suchbereiche und QR-Parserregeln
- Pflichtfelder und profilspezifische Fehlermeldung

Damit kann ein neues OCR- oder QR-Label über den Editor angelegt werden, ohne `index.html`, `main.js` oder `profile-engine.js` anzupassen.

## Globale Regeln

Regeln, die für alle Standorte und Labels identisch sind, bleiben zentral in der App. Dazu gehören insbesondere:

- Workflow Produktlabel → VDA/TA → Batchvergleich
- Freigabe ausschließlich über die Batchnummer
- Bedienerprüfung bei manueller Korrektur oder Erkennungsquote unter 60 %
- keine identische Doppelbelegung zweier Felder innerhalb desselben Labels
- Gewicht maximal fünf Ziffern vor dem Dezimaltrennzeichen
- Querformatprüfung nach der Fotoaufnahme
- Scanprotokoll, Exportstatus und CSV-Verhalten

## Erweiterter Profileditor

Der Editor ist bewusst als erweiterter Modus ausgelegt. Typischer Ablauf für ein neues OCR-Label:

1. Neues Profil anlegen und Rolle wählen.
2. `OCR / Textlayout` als Erkennungsquelle wählen.
3. Masterbild laden und PaddleOCR ausführen.
4. Profilanker markieren und Aliase festlegen.
5. Batch, IDH, Gewicht, Lieferscheinnummer und/oder Fassnummer zuordnen.
6. Für jedes Feld Regex, Normalizer, Suchbereich und bei Bedarf eine Erkennungsstrategie einstellen.
7. Profilerkennung, Ausschlussmerkmale, Pflichtfelder und Mindestquoten einstellen.
8. Konfiguration als `label-profiles.json` exportieren und unter `public/config/` ablegen.

### Allgemeine Erkennungsstrategien

Die bisher im Code eingebauten Sonderlogiken wurden in allgemeine, im Editor wählbare Strategien überführt:

- **Standard: Zone / Nähe** – normale Feldsuche um die markierte Sollposition
- **Gewicht nur mit Einheit** – akzeptiert nur Gewichtswerte mit Einheit und verbindet bei Bedarf getrennte Zahl-/Einheitsboxen
- **Netto aus Zahlenpaar / rechter Wert** – verarbeitet Gross-/Netto-Zeilen und toleriert typische OCR-Fehler der Gewichtseinheit
- **Große Zahlen-Kombizeile** – teilt kombinierte Zahlenzeilen in linken und rechten Wert
- **Quantity-Gewicht mit bevorzugter Einheit** – sucht Mengenwerte mit konfigurierbaren Einheiten

Zusätzlich lassen sich Suchradius, Mindestüberlappung, bevorzugte Position/Einheit, Tail-Länge, Kombizeilenlänge und Locator-Regeln einstellen. Die bestehende produktive Konfiguration wurde auf diese Strategien migriert, sodass die bisherige Erkennungsleistung erhalten bleibt.

## QR-Profile ohne Codeänderung

QR-Profile sind ebenfalls vollständig konfigurationsgesteuert. Im Editor können eingestellt werden:

- primärer und optionaler Fallback-Suchbereich im Bild
- welche der fünf LabelCheck-Felder aus dem QR gelesen werden
- Primär-RegEx und Capture-Gruppe
- optionaler Sekundär-RegEx, z. B. für eine Einheit
- Fallbackwert für den Sekundärteil
- Template zur Zusammensetzung des Feldwerts
- einfache Ersetzungen
- Pflichtfelder, die erfüllt sein müssen, damit der QR zu diesem Profil gehört

Über **„QR-Regeln am Masterbild testen“** kann die Konfiguration direkt im Editor geprüft werden.

## Bedienerprüfung

Wenn die Analyse `ÜBERPRÜFEN` liefert, muss der Bediener die Werte kontrollieren und **„Überprüft“** drücken. Erst danach wird die endgültige Batchentscheidung sichtbar und der Datensatz kann übernommen werden. Bei Batchabweichung bleibt das Ergebnis rot `NICHT FREIGEGEBEN`; bei gleicher Batch wird es grün `FREIGEGEBEN`.

## Scanprotokoll und CSV

Das Protokoll liegt lokal in IndexedDB. „Neue Teile senden“ hält die zu diesem Export gehörenden Datensätze fest, bis der Bediener den erfolgreichen OneDrive-Upload bestätigt. Neue Scans werden nicht in einen bereits versendeten Export gemischt. „Gesamtes Protokoll senden“ exportiert den vollständigen lokalen Verlauf. Bereits bestätigte Einträge können separat über „Gesendete leeren“ entfernt werden.

Dateiname: `Labelcheck_YYYY-MM-DD_HH-MM-SS.csv`.

Die Spalte `Manuell korrigiert` enthält die konkret bearbeiteten Felder, z. B. `Gewicht Produkt, IDH VDA`.

## Kamera und OCR-Laufzeit

Die native Kamera-App wird über `capture="environment"` angefordert. Nach der Aufnahme wird die tatsächliche Bildausrichtung einschließlich JPEG-EXIF-Rotation geprüft; Hochkantfotos werden vor der Analyse abgewiesen.

Mobilgeräte verwenden standardmäßig den stabilen OCR-Modus, Desktop/Notebook den schnellen AUTO-Modus. Die PP-OCRv5-Modelle werden beim Build in die Pages-Site kopiert und same-origin geladen.

## Deployment

```bash
npm install
npm test
npm run build
```

GitHub Pages veröffentlicht anschließend den erzeugten `dist`-Ordner über den enthaltenen GitHub-Actions-Workflow.
