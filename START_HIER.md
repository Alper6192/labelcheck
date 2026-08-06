# Start mit Version 0.5.9

1. Projektinhalt in das bestehende Repository kopieren.
2. Commit und Push ausführen.
3. Warten, bis GitHub Actions Build und Deploy abgeschlossen hat.
4. Scanner öffnen: `https://alper6192.github.io/labelcheck/?v=056`
5. Editor öffnen: `https://alper6192.github.io/labelcheck/editor.html?v=056`

Nach der ersten Analyse steht im Status beispielsweise:

- `Web Worker · WebGPU`
- oder `Web Worker · WASM`

Die Detailzeile zeigt Detektor- und Erkennungsprovider sowie deren Laufzeiten.

## Batch und Fassnummer

Im Profileditor die OCR-Box mit dem gesamten Text wie `D… / 0001` anklicken und **Batch + Fassnummer** wählen. Die gleiche Zone wird für beide Felder gespeichert; die Feldregeln trennen den Inhalt später automatisch.
