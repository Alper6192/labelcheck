# Start mit Version 0.5.5

1. Patch entpacken.
2. Inhalt in den lokalen Repository-Ordner kopieren und vorhandene Dateien ersetzen.
3. `public/config/label-profiles.json` wird vom Patch nicht überschrieben.
4. In GitHub Desktop committen und pushen.
5. Warten, bis GitHub Actions vollständig grün ist.
6. Editor mit `editor.html?v=054` öffnen.

Im Editor muss vor der Analyse stehen:

`PaddleOCR bereit · Web Worker · WASM/SIMD`

Der Editor zeigt während der OCR die laufenden Sekunden an. Es gibt keinen automatischen Wechsel ins Hauptfenster.
