# LabelCheck PaddleOCR 0.5.9

LabelCheck erkennt Produkt- und VDA-Labels lokal im Browser und enthält einen Profileditor für Anker und Feldzonen.

## OCR-Laufzeit

Scanner und Profileditor verwenden dieselbe gemeinsame Engine:

- dedizierter Web Worker
- `backend: "auto"`
- WebGPU, sofern PaddleOCR/ONNX Runtime diesen Provider erfolgreich auswählt
- WASM als Fallback
- automatische WASM-Threadzahl (`numThreads: 0`)
- PP-OCRv5 mobile detection und recognition

Die Oberfläche zeigt nach der ersten Analyse die tatsächlich gemeldeten Provider getrennt für Detektor und Erkennung. Eine bloße vorhandene WebGPU-API wird nicht mehr als erfolgreicher GPU-Einsatz ausgegeben.

## Profileditor

`editor.html` verwaltet für jedes Profil ein separates Masterbild und OCR-Ergebnis. Eine kombinierte Zeile wie

`D562707978 / 0001`

wird ausgewählt und mit **Batch + Fassnummer** beiden Feldern zugeordnet. Der Scanner trennt daraus Batch und vierstellige Fassnummer über die Feldregeln.

## Deployment

```bash
npm install
npm run test
npm run build
```

GitHub Pages veröffentlicht den erzeugten `dist`-Ordner über GitHub Actions.

## Eigene Profile und Build-Tests

Ab Version 0.5.9 sind die fachlichen Extraktionstests von `public/config/label-profiles.json` getrennt. Die im Editor exportierte Profildatei darf daher beliebige eigene Kunden- und Produktprofile enthalten. Der Build prüft nur noch die technische Gültigkeit der produktiven JSON-Datei.
