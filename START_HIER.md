# Update auf Version 0.2.0

## 1. ZIP entpacken

Die ZIP-Datei vollständig entpacken. Im inneren Projektordner liegen unter anderem:

- `.github`
- `public`
- `scripts`
- `src`
- `tests`
- `editor.html`
- `index.html`
- `package.json`

## 2. Lokales Repository öffnen

In GitHub Desktop:

`Repository → Show in Explorer`

## 3. Dateien ersetzen

Den gesamten Inhalt des entpackten Projektordners in den geöffneten Repository-Ordner kopieren und vorhandene Dateien ersetzen. Den versteckten Ordner `.git` nicht löschen.

## 4. Commit und Push

In GitHub Desktop:

1. Summary: `Ankerbasierte Florence Profile Version 0.2.0`
2. `Commit to main`
3. `Push origin`

## 5. GitHub Actions abwarten

Auf GitHub unter `Actions → GitHub Pages veröffentlichen` warten, bis Build und Deploy grün sind.

## 6. Neue Version öffnen

Beispiel:

`https://alper6192.github.io/labelcheck/?v=020`

Oben muss `v0.2.0` stehen. Bei einer alten Version einen Inkognito-Tab verwenden oder die Websitedaten löschen.

## 7. Zuerst mit den gezeigten Etiketten testen

Die App sollte beim Mercedes-Label automatisch `Format_007` beziehungsweise Mercedes erkennen. Die blauen Profilrahmen zeigen die erwarteten Wertpositionen. Die orangefarbenen Rahmen sind die einmalig von Florence erkannten Textboxen. Der grüne Rahmen ist der Kundenanker.

## 8. Profile kalibrieren

Editor öffnen:

`https://alper6192.github.io/labelcheck/editor.html`

Für jedes verwendete Format einmal „Florence auf Masterbild“ ausführen, Anker und Wertboxen kontrollieren und anschließend die exportierte `label-profiles.json` in `public/config/` ersetzen. Erst dadurch wird auch die anonyme geometrische Feinjustierung aktiviert.
