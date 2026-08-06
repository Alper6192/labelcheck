# Version 0.2.5

- WebGPU wird getrennt im Browserfenster und im Web Worker geprüft.
- Wenn Edge WebGPU nur im Hauptfenster bereitstellt, startet Florence automatisch dort.
- Bei einem Worker-Absturz wird der Worker verworfen; ein toter Worker kann keine Ladeanfrage mehr endlos offenlassen.
- Scheitert eine Analyse im Worker, wird sie einmal automatisch im Hauptfenster wiederholt.
- ONNX Runtime erhält den bereits erfolgreich geprüften GPU-Adapter, statt selbst erneut einen Adapter anzufordern.
- Core-, High-Performance- und Compatibility-Adapter werden nacheinander geprüft.
- Neue Schaltfläche „Florence neu starten“ für eine saubere Wiederherstellung nach einem Fehler.
- Anzeige nennt nun, ob Florence im Web Worker oder über den Hauptfenster-Fallback läuft.
