# Start – LabelCheck 1.0.1

1. Projektinhalt in das GitHub-Repository kopieren.
2. `public/config/label-profiles.json` ist die vollständige produktive Profilkonfiguration.
3. Neue Text- und QR-Labels ausschließlich über `editor.html` anlegen bzw. optimieren und anschließend die JSON exportieren.
4. Die exportierte Datei als `public/config/label-profiles.json` übernehmen.
5. Commit und Push auf `main`.
6. Unter GitHub Actions den Workflow **GitHub Pages veröffentlichen** vollständig durchlaufen lassen.
7. Scanner: `https://alper6192.github.io/labelcheck/?v=0174`
8. Editor: `https://alper6192.github.io/labelcheck/editor.html?v=0174`

Für ein neues Label sind keine Änderungen an `index.html` oder am Scanner-JavaScript vorgesehen. Profilabhängige Erkennungsleistung wird im erweiterten Editor konfiguriert.
