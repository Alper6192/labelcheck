# Start hier – Veröffentlichung auf GitHub Pages

## 1. Repository anlegen

1. Auf GitHub **New repository** wählen.
2. Name: `label-check-florence`.
3. Für einen einfachen Start **Public** wählen.
4. Keine README und keine `.gitignore` automatisch erzeugen.
5. **Create repository** anklicken.

## 2. Dateien hochladen

Den vollständigen Inhalt dieses Projektordners hochladen. Wichtig: Auch der versteckte Ordner `.github/workflows` muss enthalten sein. Am zuverlässigsten funktioniert das mit Git:

```bash
git init
git add .
git commit -m "Florence LabelCheck Prototyp"
git branch -M main
git remote add origin https://github.com/DEIN-NAME/label-check-florence.git
git push -u origin main
```

## 3. GitHub Pages aktivieren

1. Repository öffnen.
2. **Settings → Pages**.
3. Unter **Build and deployment** die Quelle **GitHub Actions** auswählen.
4. Zum Reiter **Actions** wechseln.
5. Den Workflow **GitHub Pages veröffentlichen** öffnen.
6. Falls er nicht automatisch läuft: **Run workflow** anklicken.

## 4. Erster Build

Der erste Build lädt die angehefteten Florence-Modelldateien und kann wegen rund 600 MB länger als gewöhnliche Pages-Builds dauern. Das Modell wird danach im GitHub-Actions-Cache gehalten.

Nach erfolgreichem Deployment zeigt GitHub die Adresse an, typischerweise:

```text
https://DEIN-NAME.github.io/label-check-florence/
```

## 5. Smartphone-Test

1. Adresse mit aktuellem Chrome oder Edge auf Android öffnen.
2. Prüfen, ob **WebGPU verfügbar** angezeigt wird.
3. Zunächst **Demo-Daten laden** drücken.
4. Datensatz übernehmen.
5. **Excel speichern / teilen** testen.
6. Danach zwei echte Etiketten fotografieren und Florence analysieren lassen.

## 6. Erwartung für den ersten Test

Der Prototyp beweist zunächst:

- Florence lädt auf dem Smartphone.
- OCR mit Positionen läuft.
- Die App erzeugt strukturierte Kandidaten.
- Vergleich und Excel-Export funktionieren.

Die fachliche Erkennungsqualität ist noch nicht validiert. Dafür werden echte Bilder mit bekannten Sollwerten als Ground Truth benötigt.
