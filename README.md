# LabelCheck Florence

Smartphone-Web-App zum lokalen Vergleich eines Produktlabels mit einem VDA-Label. Microsoft Florence-2 läuft vollständig im Browser über WebGPU. Bilder werden nicht hochgeladen. Ergebnisse bleiben in IndexedDB und können als `.xlsx` gespeichert oder über den Android-Teilen-Dialog an OneDrive, SharePoint, Teams oder andere Ziele übergeben werden.

## Was Version 0.1 bereits enthält

- Smartphone-Kamera für Produkt- und VDA-Label
- lokale Bildverkleinerung und einfache Qualitätswarnungen
- Florence-2 `<OCR_WITH_REGION>` im Web Worker
- Parser für Batch, IDH, Gewicht, Fass- und Lieferscheinnummer
- deterministischer Vergleich von Batch, IDH und Gewicht
- manuelle Korrektur erkannter Werte
- lokales Scanprotokoll in IndexedDB
- Excel-Export als `.xlsx`
- PWA-Grundgerüst
- automatisches GitHub-Pages-Deployment

## Wichtige Architektur

GitHub Pages ist statisches Hosting. Florence läuft deshalb nicht als GitHub-Serverprozess, sondern auf der GPU des Smartphones. Beim ersten Deployment lädt GitHub Actions die fest angehefteten Modelldateien von Hugging Face in das Pages-Artefakt. Beim späteren Betrieb lädt das Smartphone App und Modell ausschließlich von deiner GitHub-Pages-Domain.

## GitHub-Einrichtung

1. Neues leeres GitHub-Repository erstellen, zum Beispiel `label-check-florence`.
2. Den Inhalt dieses Projekts in das Repository hochladen und nach `main` pushen.
3. Unter **Settings → Pages → Build and deployment** als Quelle **GitHub Actions** auswählen.
4. Den Workflow **GitHub Pages veröffentlichen** starten oder auf den ersten Push warten.
5. Der erste Build lädt rund 600 MB Modelldateien. Spätere Builds verwenden den Actions-Cache.
6. Die veröffentlichte Adresse lautet typischerweise `https://BENUTZERNAME.github.io/REPOSITORY/`.

## Lokale Entwicklung

Voraussetzungen: Node.js 22 und ein Chromium-Browser mit WebGPU.

```bash
npm install
npm run prepare:assets
npm test
npm run dev
```

`prepare:assets` lädt die lokal zu hostenden Florence-Dateien. Für reine Oberflächenentwicklung ohne lokalen Modelldownload kann vorübergehend das Remote-Modell verwendet werden:

```bash
VITE_MODEL_SOURCE=remote npm run dev
```

In PowerShell:

```powershell
$env:VITE_MODEL_SOURCE="remote"
npm run dev
```

Der Produktionsworkflow verwendet standardmäßig immer lokale Modelldateien und blockiert Remote-Modellzugriffe.

## Vergleichsregeln

In `src/config.js` sind Batch, IDH und Gewicht zunächst als Pflichtvergleiche definiert. Fehlende oder abweichende Werte verhindern eine Freigabe. Diese Regeln müssen vor Produktion fachlich bestätigt werden.

## Noch vor Produktion erforderlich

- Erkennung anhand realer Ground-Truth-Daten messen
- Parser an alle tatsächlichen Labelbegriffe und Nummernformate anpassen
- QR-/DataMatrix-Decoder ergänzen
- Versions- und Freigabeprozess festlegen
- mindestens Positiv-, Negativ-, Unschärfe-, Reflexions- und Falschpaar-Tests durchführen
- klären, ob manuell korrigierte Datensätze freigegeben werden dürfen

## Modell und Lizenzen

- Microsoft / ONNX Community: `onnx-community/Florence-2-base-ft`, MIT-Lizenz
- Transformers.js: Apache-2.0
- SheetJS Community Edition: Apache-2.0

Die verwendete Florence-Revision ist in `src/config.js` und `scripts/download-model.mjs` fest angeheftet.
