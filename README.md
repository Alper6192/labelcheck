# LabelCheck PaddleOCR 0.5.1

Statische GitHub-Pages-Anwendung zur Erkennung und zum Vergleich von Produkt- und VDA-Etiketten mit PaddleOCR.js.

## Scanner

- PP-OCRv5 mobile direkt im Browser
- Batch, Fassnummer, IDH, Gewicht und Lieferscheinnummer
- Produkt-/VDA-Vergleich
- lokales Prüfprotokoll und Excel-Export

## Profileditor

Der Editor ist unter `editor.html` erreichbar. Er kann PaddleOCR-Textfelder oder frei gezeichnete Zonen als Anker und Felder übernehmen.

Seit Version 0.5.1 besitzt jedes Profil während der geöffneten Browsersitzung einen eigenen flüchtigen Masterbildzustand. Produkt- und VDA-Profile zeigen daher nicht mehr dasselbe geladene Bild. Die Bilder werden weder hochgeladen noch in die exportierte JSON eingebettet.

OCR-Analysen werden nach 60 Sekunden beendet. Ein hängender Worker wird verworfen und das Modell anschließend neu geladen. Über „Analyse abbrechen“ kann ein laufender Auftrag manuell beendet werden.

## Konfiguration

Die produktive Profilkonfiguration liegt unter:

```text
public/config/label-profiles.json
```

Im Editor exportierte JSON-Dateien müssen dort ersetzt und anschließend über GitHub Pages veröffentlicht werden.

## Lokaler Start

```bash
npm install
npm run dev
```

## Prüfung

```bash
npm test
npm run build
```
