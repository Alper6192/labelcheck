# LabelCheck Florence 0.2.8
> **0.2.8:** Direkte Adapter-Vorabfragen sind nur noch diagnostisch. Worker und Hauptfenster werden durch den tatsächlichen ONNX-/Florence-Start getestet; fehlgeschlagene Initialisierungen lassen sich sauber neu starten.


> **0.2.2:** Der Editor bleibt während Florence sichtbar, kann Analysen abbrechen und erlaubt das Verschieben sowie Vergrößern vorhandener Zuordnungen.
> **0.2.1:** Behebt das Zusammenziehen aller erwarteten Feldboxen an den Kundenanker.

Smartphone-Web-App zum lokalen Vergleich eines Produktlabels mit einem VDA-/Kundenlabel.

## Neue Architektur

- genau ein Florence-2-Durchlauf pro Etikett mit `<OCR_WITH_REGION>`
- keine Erkennung der Etikettenränder
- kein automatischer Bildzuschnitt
- keine Zuordnung über Texte wie „Batch“, „IDH“ oder „Gewicht“
- Kundenname beziehungsweise Henkel dient als geometrischer Profilanker
- Wertboxen werden ausschließlich über ihre hinterlegte Position im jeweiligen Profil zugeordnet
- optional wird die Transformation über die anonyme Verteilung der Florence-Textboxen verfeinert
- Format kann nach der OCR manuell gewechselt werden, ohne Florence erneut auszuführen
- lokales Scanprotokoll und Excel-Export

Florence-2 unterstützt OCR mit Regionen; Transformers.js führt das Modell über WebGPU direkt im Browser aus.

## Seiten

- `index.html`: Smartphone-Scanner
- `editor.html`: Profileditor

## Profilkonfiguration

Die mitgelieferte Datei `public/config/label-profiles.json` enthält die zwölf Formate aus der bisherigen Konfiguration. Feldpositionen und Masterbilder wurden übernommen. Für die automatische Profilauswahl sind unter anderem folgende Kundenanker voreingetragen:

- Henkel für das Produktlabel
- BMW
- ICS Aerosols
- Jaguar Land Rover
- Mercedes-Benz
- Scania
- Škoda
- Stellantis
- Volkswagen
- Tesla

Zwei Formate ohne stabilen Kundennamen sind als manuelle Formate gekennzeichnet. Das zusätzliche SEGRO-Layout ist im Editor enthalten, aber bewusst noch nicht fachlich freigeschaltet, weil seine IDH-Zuordnung aus den Bildern allein nicht zweifelsfrei ableitbar ist.

## Editor benutzen

1. `editor.html` öffnen.
2. Profil auswählen.
3. „Florence auf Masterbild“ drücken.
4. Die erkannte Kundenname-Textbox anklicken und „Auswahl = Kundenanker“ drücken.
5. Die reinen Wertboxen anklicken und Batch, IDH, Gewicht usw. zuweisen.
6. Bei Bedarf mit „Bereich zeichnen“ einen Bereich frei markieren.
7. `label-profiles.json` exportieren.
8. Exportdatei nach `public/config/label-profiles.json` kopieren.
9. Commit und Push ausführen.

Der Editor speichert zusätzlich einen anonymen geometrischen Fingerabdruck der Textboxen. Die Inhalte dieser Boxen werden nicht zur Feldbedeutung benutzt.

## Datenschutz

Bei der Nutzung der GitHub-Pages-App werden Fotos nicht hochgeladen. Das Modell, die OCR, die Profilzuordnung und der Excel-Export laufen im Browser. Beim GitHub-Actions-Build werden die fest angehefteten Modell- und Runtime-Dateien in das Pages-Artefakt aufgenommen.

## Entwicklung

```bash
npm install
npm test
npm run check
npm run prepare:assets
npm run dev
```

## Prüfstatus

Die reine JavaScript-Syntax und die positionsbasierte Profilengine sind automatisiert getestet. Ein vollständiger lokaler Vite-/WebGPU-Build konnte in der Erstellungsumgebung nicht ausgeführt werden, weil das dortige npm-Registry das Transformers.js-Paket nicht bereitstellte. Der enthaltene GitHub-Actions-Workflow verwendet die öffentliche npm- und Hugging-Face-Infrastruktur.
