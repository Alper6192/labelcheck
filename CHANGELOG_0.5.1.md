# LabelCheck PaddleOCR 0.5.1

## Behoben

- PaddleOCR-Analysen im Profileditor besitzen jetzt ein festes Zeitlimit von 60 Sekunden.
- Ein hängender OCR-Worker wird verworfen, statt den Editor dauerhaft bei „analysiert …“ zu blockieren.
- Neue Schaltfläche „Analyse abbrechen“ mit anschließendem Modellneustart.
- Der Editor verarbeitet Masterbilder mit der bereits erfolgreich getesteten Maximalgröße von 1800 Pixeln.
- Masterbild, OCR-Ergebnis und aktuelle OCR-Auswahl werden getrennt pro Profil im Browser gehalten.
- Beim Profilwechsel wird nur das zu diesem Profil gehörende Masterbild angezeigt.
- Neue Schaltfläche „Masterbild entfernen“ löscht ausschließlich das Bild des ausgewählten Profils.

## Hinweise

- Masterbilder bleiben weiterhin nur flüchtig im Browser und werden nicht in `label-profiles.json` exportiert.
- Nach einem Neuladen der Webseite müssen die Masterbilder erneut ausgewählt werden.
