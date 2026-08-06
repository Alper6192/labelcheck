# LabelCheck PaddleOCR 0.4.0

Erste integrierte Version nach erfolgreichem PP-OCRv5-Machbarkeitstest.

## Enthalten

- lokale PaddleOCR-Erkennung im Browser
- profilbasierte Zuordnung über einen stabilen Textanker
- manuell korrigierbare Felder
- Vergleich von Batch, IDH und Gewicht
- lokales Scanprotokoll
- echter XLSX-Export
- Debug-JSON

## Derzeit validierte Profile

- Produktlabel TEROSON PU 1511
- Format_007 – Mercedes-Benz

Die Profile wurden direkt aus dem erfolgreichen Testexport vom 06.08.2026 erzeugt. Weitere Formate werden erst nach einem Testbild beziehungsweise einem Profil-Editor aktiviert.

## Installation

Projektinhalt in das bestehende Repository kopieren, Dateien ersetzen, committen und pushen. Danach GitHub Actions abwarten und die Seite mit `?v=040` öffnen.
