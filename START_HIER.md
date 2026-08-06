# Update auf 0.5.0

## Installation

1. ZIP entpacken.
2. In GitHub Desktop `Repository → Show in Explorer` öffnen.
3. Den gesamten Inhalt dieses Ordners in den Repository-Ordner kopieren.
4. Vorhandene Dateien ersetzen.
5. Commit-Nachricht: `PaddleOCR Profileditor und Fassnummer ergänzen`
6. `Commit to main` und danach `Push origin`.
7. Unter GitHub Actions warten, bis Build und Deployment grün sind.

Danach:

- Scanner: `https://DEIN-NAME.github.io/labelcheck/?v=050`
- Editor: `https://DEIN-NAME.github.io/labelcheck/editor.html?v=050`

## Fassnummer

Beim vorhandenen Produktprofil ist bereits eine Fassnummer konfiguriert. PaddleOCR hatte `/0001` als `10001` gelesen. Die neue Bereinigung übernimmt die letzten vier Ziffern und liefert deshalb korrekt `0001`.

## Neues Profil einrichten

1. Editor öffnen.
2. `Neues Profil` oder `Profil duplizieren` wählen.
3. Profilname, Rolle und Anker-Aliase eintragen.
4. Masterbild laden und PaddleOCR starten.
5. Kundennamen bzw. stabilen Produktnamen als Anker zuweisen.
6. Wertboxen den Feldern zuordnen.
7. Zonen im Bearbeitungsmodus verschieben oder an den weißen Eckpunkten ändern.
8. JSON exportieren und unter `public/config/label-profiles.json` ablegen.
