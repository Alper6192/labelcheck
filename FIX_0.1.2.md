# Korrektur v0.1.2

Diese Version verbessert den realen Etikettentest:

- zweiter Florence-Detailpass auf den automatisch erkannten Textbereich
- bessere Erkennung von `Füllmenge`, `Sach-Nr Lieferant` und `Chargen-Nr`
- Gewichtsauswahl bevorzugt plausible KG-Werte vor Fehlkandidaten wie `3 G`
- tolerantere Batch-Erkennung bei Leerzeichen und OCR-Zeichenfehlern
- struktureller IDH-Fallback für Produktlabels ohne deutlich lesbare IDH-Beschriftung
- übersichtliche mobile Vergleichskarten statt zerquetschter Tabellenspalten
- Florence-Rohdaten zeigen zusätzlich die Textblöcke des Detailpasses

## Aktualisierung

1. ZIP entpacken.
2. Den gesamten Inhalt in den lokalen Repository-Ordner kopieren und vorhandene Dateien ersetzen.
3. In GitHub Desktop committen und `Push origin` drücken.
4. Warten, bis GitHub Actions grün ist.
5. Die Seite zuerst im Inkognito-Tab öffnen oder `?v=012` an die URL anhängen.
6. Oben muss `v0.1.2` stehen.
