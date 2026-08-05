# LabelCheck Florence – GitHub Pages ohne Punktdateien

Dieses Paket enthält keine Dateien oder Ordner, deren Name mit einem Punkt beginnt.

## Hochladen

1. Auf GitHub ein neues Repository erstellen.
2. Im Repository auf **Add file → Upload files** klicken.
3. Den Inhalt dieses entpackten Ordners hochladen.
4. Den Upload mit **Commit changes** bestätigen.

Wichtig: Nicht die ZIP-Datei selbst hochladen, sondern die entpackten Dateien und Ordner.

## GitHub Pages aktivieren

1. Im Repository **Settings → Pages** öffnen.
2. Unter **Build and deployment** bei **Source** auswählen:
   **Deploy from a branch**
3. Branch auswählen:
   **main**
4. Ordner auswählen:
   **/(root)**
5. **Save** anklicken.

Nach einigen Minuten erscheint oben die Adresse der GitHub Page.

## Enthalten

- index.html
- app.js
- florence-worker.js
- styles.css
- service-worker.js
- manifest.webmanifest
- layouts/index.json
- layouts/layout_001.json

## Nicht mehr enthalten

- .github
- .gitignore
- .nojekyll

Diese Dateien sind für die Bereitstellung aus dem Branch nicht erforderlich.

## Nutzung

1. GitHub-Pages-Adresse in Microsoft Edge oder Google Chrome öffnen.
2. Florence-2 laden.
3. Foto aufnehmen oder auswählen.
4. Etikett analysieren.

Florence läuft per WebGPU direkt im Browser. Das Etikettenfoto wird nicht zu GitHub hochgeladen.
