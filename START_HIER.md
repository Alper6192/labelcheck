# Start hier – Umstieg auf PaddleOCR

## Wichtig

Dies ist kein Patch für Florence, sondern ein vollständiger Neuaufbau. Sichere dein bisheriges Repository zunächst als ZIP oder behalte den letzten Florence-Commit in GitHub.

## Bestehendes Repository ersetzen

1. ZIP entpacken.
2. In GitHub Desktop `Repository → Show in Explorer` öffnen.
3. Im lokalen Repository alles außer dem versteckten Ordner `.git` entfernen.
4. Den gesamten Inhalt dieses Projektordners in das Repository kopieren.
5. In GitHub Desktop als Summary eintragen: `Auf PaddleOCR Prototyp 0.3.0 umstellen`.
6. `Commit to main` und danach `Push origin`.
7. Unter GitHub `Actions` warten, bis Build und Deploy grün sind.
8. Öffnen: `https://DEIN-NAME.github.io/DEIN-REPOSITORY/?v=030`

## Testablauf

1. Warten, bis `PaddleOCR bereit` erscheint.
2. Zunächst `Lateinisch/Deutsch` und `Ausgewogen` verwenden.
3. Produkt- und VDA-Foto aufnehmen.
4. Laufzeit, erkannte Texte und Konfidenzen prüfen.
5. Ergebnisse als JSON speichern.
6. Danach das Modell auf `Englisch/Zahlen` wechseln, `Modell neu laden` drücken und dieselben Bilder erneut testen.
7. Beide JSON-Dateien aufbewahren.

## Was ich für die nächste Stufe brauche

- Screenshot der beiden OCR-Tabellen,
- Laufzeiten für beide Bilder,
- die exportierte JSON-Datei des lateinischen Tests,
- optional die JSON-Datei des englischen Vergleichstests.
