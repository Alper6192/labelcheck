# Version 0.5.2

## Profileditor

- Nach dem Modellladen wird ein echter kleiner OCR-Auftrag ausgeführt.
- Ein Worker, der nur „bereit“ meldet, aber bei `predict()` nicht antwortet, wird automatisch erkannt.
- Automatischer Wechsel auf PaddleOCR im Hauptfenster.
- Worker-Zeitlimit bei Masterbildern: 30 Sekunden.
- Ein fehlgeschlagener Worker-Auftrag wird automatisch einmal im Hauptfenster wiederholt.
- Status zeigt den tatsächlich geprüften Ausführungsmodus an.
- Getrennte Masterbilder und OCR-Zustände je Profil aus Version 0.5.1 bleiben bestehen.
