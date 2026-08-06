# Änderungen 0.5.3

- Ursache des Editor-Hängers beseitigt: Ein `Promise.race`-Timeout hatte nur das Warten beendet, nicht den laufenden PaddleOCR-Worker.
- Keine Worker-zu-Hauptfenster-Umschaltung mehr im Profileditor.
- Der Profileditor verwendet genau eine PaddleOCR-Instanz im Hauptfenster.
- Das verkleinerte Masterbild wird als JPEG-Blob an PaddleOCR übergeben.
- Kein automatischer Parallel-Neustart während ein alter OCR-Auftrag noch laufen könnte.
- Scanner bleibt unverändert im bewährten Worker-Modus.
- Masterbilder und OCR-Ergebnisse bleiben weiterhin strikt pro Profil getrennt.
