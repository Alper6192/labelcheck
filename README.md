# LabelCheck PaddleOCR 0.5.0

Browserbasierter Etikettenvergleich mit PaddleOCR, lokalen Layoutprofilen und Excel-Export.

## Neu in 0.5.0

- eigener Profileditor unter `editor.html`
- Profile erstellen, duplizieren und löschen
- Masterbild mit PaddleOCR analysieren
- erkannte OCR-Boxen als Anker oder Feldzone übernehmen
- freie Zonen zeichnen
- vorhandene Zonen verschieben und über Eckpunkte vergrößern/verkleinern
- Regex, Pflichtfeld, Vergleich und Bereinigung je Feld konfigurieren
- `label-profiles.json` importieren und exportieren
- Fassnummer auf dem Produktlabel, z. B. `/0001`
- OCR-Fehler `10001` wird im Fassnummernfeld als `0001` normalisiert
- Fassnummer wird im lokalen Protokoll und in Excel gespeichert

## Seiten

- Scanner: `index.html`
- Profileditor: `editor.html`

## Profileditor – Kurzablauf

1. Profil auswählen oder neu anlegen.
2. Masterbild laden.
3. `PaddleOCR auf Masterbild` drücken.
4. Orange OCR-Box anklicken.
5. Auswahl als Anker, Batch, Fassnummer, IDH, Gewicht oder Lieferscheinnummer zuweisen.
6. Im Modus `Zuordnung verschieben/ändern` die Zone direkt bearbeiten.
7. `label-profiles.json exportieren`.
8. Die Datei im Repository unter `public/config/label-profiles.json` ersetzen.
9. Committen und pushen.

Das Masterbild wird nicht in der JSON gespeichert. Fotos und OCR-Ergebnisse bleiben im Browser.
