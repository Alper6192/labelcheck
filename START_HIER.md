# Start – LabelCheck PaddleOCR 0.5.2

## Update installieren

1. Repository in GitHub Desktop öffnen.
2. `Repository → Show in Explorer` auswählen.
3. Inhalt des Patch-Ordners in den Repository-Ordner kopieren.
4. Vorhandene Dateien ersetzen.
5. Commit-Nachricht: `Profileditor Worker-Test und Hauptfenster-Fallback`.
6. Committen und zu GitHub pushen.
7. Unter GitHub Actions warten, bis Build und Deployment grün sind.

## Seiten öffnen

```text
Scanner:      https://alper6192.github.io/labelcheck/?v=052
Profileditor: https://alper6192.github.io/labelcheck/editor.html?v=052
```

## Profileditor testen

1. Produktprofil auswählen und Produkt-Masterbild laden.
2. VDA-Profil auswählen: Dort darf das Produktbild nicht erscheinen.
3. Eigenes VDA-Masterbild laden.
4. Zwischen den Profilen wechseln: Jedes Profil muss sein eigenes Bild behalten.
5. Warten, bis „praktisch geprüft“ erscheint.
6. PaddleOCR starten. Ein blockierter Worker wechselt automatisch ins Hauptfenster.
7. Bei Bedarf „Analyse abbrechen“ verwenden.

Masterbilder sind nur für die aktuelle Browsersitzung gespeichert. Nach einem Neuladen der Seite müssen sie erneut geladen werden.
