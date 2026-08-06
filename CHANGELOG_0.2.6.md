# Version 0.2.6

- Direkte `requestAdapter()`-Vorabfragen blockieren Florence nicht mehr.
- Worker und Hauptfenster werden durch einen echten ONNX-/Florence-Modellstart getestet.
- Verwalteter Edge darf den WebGPU-Adapter intern über ONNX Runtime auswählen.
- Nach einem fehlgeschlagenen Modellstart werden alle abgelehnten Modell-Promises zurückgesetzt.
- „Florence neu starten“ kann dadurch nach einem Absturz tatsächlich neu initialisieren.
- Hauptfenster-Fallback bleibt erhalten.
