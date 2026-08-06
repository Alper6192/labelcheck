# Änderungen 0.5.5

- Profileditor analysiert für OCR nur noch eine auf maximal 1200 px verkleinerte Kopie.
- Recognition-Batch im Editor von 8 auf 2 reduziert, um sehr lange Textzeilen auf langsamen WASM-Systemen weniger stark aufzublähen.
- Detektions-, Erkennungs- und Gesamtlaufzeit werden getrennt angezeigt.
- OCR-Ergebnisse aus Scanner-/Prototyp-Debug-JSON können in den Editor importiert werden.
- Eine kombinierte OCR-Zeile wie `D562707978 / 0001` kann mit einem Klick gleichzeitig Batch und Fassnummer zugeordnet werden.
- Importierte OCR-Polygone werden automatisch auf die Größe des geladenen Masterbilds skaliert.
