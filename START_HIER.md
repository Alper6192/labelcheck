# Start mit Version 0.3.1

## Update installieren

1. ZIP entpacken.
2. In GitHub Desktop `Repository → Show in Explorer` öffnen.
3. Den gesamten Inhalt des neuen Projektordners in den Repository-Ordner kopieren.
4. Vorhandene Dateien ersetzen; den versteckten Ordner `.git` nicht löschen.
5. In GitHub Desktop committen und `Push origin` drücken.
6. Unter GitHub Actions warten, bis Build und Deployment grün sind.

Danach öffnen:

```text
https://alper6192.github.io/labelcheck/?v=031
```

Oben muss `v0.3.1` stehen.

## Test

1. Auf `PaddleOCR bereit` warten.
2. Qualität `Ausgewogen` verwenden.
3. Produktlabel aufnehmen.
4. VDA-Label aufnehmen.
5. Laufzeiten und OCR-Zeilen kontrollieren.
6. `Ergebnisse als JSON speichern` drücken.

Die Modellauswahl enthält in dieser Version bewusst nur das eingebaute PP-OCRv5-Standardmodell. Das deutsche `lang: de` wurde entfernt, weil diese Kombination vom aktuellen Browser-SDK nicht akzeptiert wird.
