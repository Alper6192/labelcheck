# Changelog

## 0.6.6
- Asynchrone Scan-Ergebnisse sind an eine Slot-Generation gebunden; ältere OCR-Läufe können kein neueres Foto mehr überschreiben.
- Manuell gewählte QR-Profile (insbesondere Tesla) werden erneut mit `detectQrProfile()` gelesen statt durch die OCR-Geometrie geschickt.
- Derselbe unveränderte Vergleich kann nur einmal gespeichert werden; nach Foto-, Profil-, OCR- oder manueller Feldänderung wird Speichern wieder freigegeben.
- Schlechte Bildqualität wird als Hinweis angezeigt, blockiert die Freigabe aber nicht.
- Fehler beim Schreiben oder Leeren des lokalen Protokolls werden sichtbar gemeldet.
- INTERN2: Wenn PaddleOCR eine lange H-Satz-Zeile zusammen mit `Stor.Cl./WPC` als eine Textbox erkennt, wird der Alias virtuell aus der Zeile ausgeschnitten und nur dessen Geometrie als Anker verwendet.

## 0.6.5
- VW-Geometrie verwendet die Höhe des Textankers statt dessen Breite; kurze Werkbezeichnungen wie „Volkswagen AG“ verzerren die Feldpositionen nicht mehr.
- Benachbarte OCR-Textzeilen können gemeinsam einen Anker bilden, z. B. „Stor.Cl.“ + „/ WPC“ und „Alte“ + „Materialnummer“.
- Das sichtbare Scanprotokoll entspricht jetzt dem Excel-Export.
- Spalten „Nr“ und „Produktprofil“ entfernt.

# 0.6.5

- Mobilgeräte (Android, iPhone, iPad) starten standardmäßig im stabilen OCR-Modus: WASM, 1 Thread, Recognition-Batch 1 und reduzierte Bildgröße. Desktop bleibt standardmäßig im schnellen AUTO-Modus.
- Manuelle Wahl zwischen stabilem und schnellem Modus wird pro Browser gespeichert; Crash-Recovery bleibt aktiv.
- Tesla-Versandlabel werden vor PaddleOCR über den kleinen QR-Code links unten erkannt. Aus dem QR-Code werden Batch, Lieferscheinnummer und Gewicht gelesen; eine IDH ist bei Tesla nicht erforderlich.
- Tesla-QR-Testmuster: Batch `D562808695`, Lieferscheinnummer `0013029294`, Gewicht `900 KG`.
- Vergleich berücksichtigt nur Felder, die auf beiden Etiketten als Vergleichsfeld konfiguriert sind; Tesla kann deshalb ohne IDH freigegeben werden.
- VW: zusammengeklebte Ziffernzeilen wie `130234443103560` werden positionsabhängig in Lieferscheinnummer `13023444` und IDH `3103560` zerlegt.
- Excel enthält pro gespeicherter Kontrolle genau eine Zeile mit Zeit, Ergebnis, Batch/IDH/Gewicht von Produkt und Lieferschein sowie Lieferscheinnummer. Dateiname: `Labelcheck_YYYY-MM-DD_HH-MM-SS.xlsx`.
- Produktive Konfiguration baut auf dem zuletzt bereitgestellten Nutzerprofilstand auf und ergänzt das Tesla-QR-Profil.

# 0.6.1

- iPhone/iPad: OCR läuft im stabileren WASM-Worker statt WebGPU, mit kleinerem Recognition-Batch und reduziertem Scannerbild.
- Vorschau-Canvas wird auf Mobilgeräten deutlich kleiner gerendert, um Safari-Speicherdruck zu reduzieren.
- Jedes neu aufgenommene/gewählte Foto startet wieder im Layoutmodus „Automatisch“.
- Automatisch erkanntes Profil wird intern verwendet, ohne den Layout-Select von „Automatisch“ wegzuschalten.
- Produktive Konfiguration basiert auf dem Nutzerexport vom 07.08.2026; INTERN1-Anker auf „Alte Materialnummer“ präzisiert und KGM bei Gewichten ergänzt.

# Changelog

## 0.6.0
- Masterbilder und OCR-Ergebnisse des Profileditors werden profilbezogen in IndexedDB gespeichert und nach erneutem Öffnen wiederhergestellt.
- Automatische Ankererkennung ist asymmetrisch: kurze Aliase wie BMW dürfen in längeren Kundenzeilen vorkommen; verkürzte OCR-Texte wie Materialnummer reichen nicht mehr für Alte Materialnummer.
- Felder können aus Teilstücken einer gemeinsamen OCR-Zeile extrahiert werden, z. B. VW-IDH aus einer Zeile mit Lieferscheinnummer und IDH.
- Batch-Normalisierung ignoriert Doppelpunkt-/Suffixwerte nach D-Nummern.
- Gewichte ohne Einheit sind zulässig und werden beim Vergleich als KG interpretiert; KGM wird als KG normalisiert.


## 0.5.9

- Vollständiges Paket enthält nun die aktuelle produktive `label-profiles.json` mit HENKEL, MERCEDES, STELLANTIS und BMW.
- Angezeigte App-Version auf 0.5.9 korrigiert.
- Einzelne CHANGELOG-Dateien zu einer Datei zusammengeführt.

# 0.5.8

- GitHub-Pages-Deployments werden bei einem neuen Push nicht mehr abgebrochen (`cancel-in-progress: false`).
- Das Zeitlimit von `actions/deploy-pages` wurde auf 20 Minuten erhöht.
- Profiländerungen bleiben weiterhin automatisch über Push auf `main` veröffentlichbar.



# Änderungen 0.5.7

- Automatische Extraktionstests verwenden jetzt eine feste Test-Fixture statt der produktiven `public/config/label-profiles.json`.
- Eigene, im Profileditor exportierte Profile dürfen Produktnamen, Reihenfolge, Koordinaten und Feldzonen ändern, ohne die TEROSON-Testfälle zu zerstören.
- Die produktive Profildatei wird weiterhin auf gültiges JSON, eindeutige Profil-IDs, bekannte Feldtypen und gültige reguläre Ausdrücke geprüft.
- Der Patch enthält keine produktive `label-profiles.json` und überschreibt daher keine Benutzerprofile.



# Änderungen 0.5.6

- Scanner und Profileditor verwenden dieselbe `PaddleOcrEngine`.
- ONNX Runtime wird mit `backend: "auto"` gestartet: WebGPU wird bevorzugt, WASM bleibt Fallback.
- `numThreads: 1` wurde entfernt; `numThreads: 0` überlässt die mögliche Threadzahl ONNX Runtime.
- Die fest codierte Anzeige „WASM/SIMD“ wurde entfernt.
- Nach einer Analyse werden die tatsächlich gemeldeten Provider für Detektion und Erkennung angezeigt.
- Detektions- und Erkennungszeit werden getrennt dargestellt.
- Keine künstliche 60-Sekunden-Inferenz-Zeitüberschreitung mehr, da sie den laufenden `predict()`-Aufruf nicht zuverlässig beendet.
- Der Build prüft, ob die JSEP-WASM-Datei für WebGPU nach `public/ort` kopiert wurde.
- Batch und Fassnummer können weiterhin über „Batch + Fassnummer“ aus derselben OCR-Zeile zugewiesen werden.



# Änderungen 0.5.5

- Profileditor analysiert für OCR nur noch eine auf maximal 1200 px verkleinerte Kopie.
- Recognition-Batch im Editor von 8 auf 2 reduziert, um sehr lange Textzeilen auf langsamen WASM-Systemen weniger stark aufzublähen.
- Detektions-, Erkennungs- und Gesamtlaufzeit werden getrennt angezeigt.
- OCR-Ergebnisse aus Scanner-/Prototyp-Debug-JSON können in den Editor importiert werden.
- Eine kombinierte OCR-Zeile wie `D562707978 / 0001` kann mit einem Klick gleichzeitig Batch und Fassnummer zugeordnet werden.
- Importierte OCR-Polygone werden automatisch auf die Größe des geladenen Masterbilds skaliert.



# Änderungen 0.5.4

- Profileditor verwendet wieder einen einzelnen PaddleOCR-Web-Worker.
- OCR-Pfad entspricht dem bereits schnellen Scanner: Canvas direkt, Recognition-Batch 8, WASM/SIMD.
- Kein Hauptfensterbetrieb und kein automatischer Timeout-Fallback.
- Laufzeit wird sekundengenau angezeigt.
- „Analyse abbrechen“ beendet den Worker; anschließend kann das Modell manuell neu geladen werden.
- Masterbilder und OCR-Ergebnisse bleiben weiterhin je Profil getrennt.



# Änderungen 0.5.3

- Ursache des Editor-Hängers beseitigt: Ein `Promise.race`-Timeout hatte nur das Warten beendet, nicht den laufenden PaddleOCR-Worker.
- Keine Worker-zu-Hauptfenster-Umschaltung mehr im Profileditor.
- Der Profileditor verwendet genau eine PaddleOCR-Instanz im Hauptfenster.
- Das verkleinerte Masterbild wird als JPEG-Blob an PaddleOCR übergeben.
- Kein automatischer Parallel-Neustart während ein alter OCR-Auftrag noch laufen könnte.
- Scanner bleibt unverändert im bewährten Worker-Modus.
- Masterbilder und OCR-Ergebnisse bleiben weiterhin strikt pro Profil getrennt.



# Version 0.5.2

## Profileditor

- Nach dem Modellladen wird ein echter kleiner OCR-Auftrag ausgeführt.
- Ein Worker, der nur „bereit“ meldet, aber bei `predict()` nicht antwortet, wird automatisch erkannt.
- Automatischer Wechsel auf PaddleOCR im Hauptfenster.
- Worker-Zeitlimit bei Masterbildern: 30 Sekunden.
- Ein fehlgeschlagener Worker-Auftrag wird automatisch einmal im Hauptfenster wiederholt.
- Status zeigt den tatsächlich geprüften Ausführungsmodus an.
- Getrennte Masterbilder und OCR-Zustände je Profil aus Version 0.5.1 bleiben bestehen.



# LabelCheck PaddleOCR 0.5.1

## Behoben

- PaddleOCR-Analysen im Profileditor besitzen jetzt ein festes Zeitlimit von 60 Sekunden.
- Ein hängender OCR-Worker wird verworfen, statt den Editor dauerhaft bei „analysiert …“ zu blockieren.
- Neue Schaltfläche „Analyse abbrechen“ mit anschließendem Modellneustart.
- Der Editor verarbeitet Masterbilder mit der bereits erfolgreich getesteten Maximalgröße von 1800 Pixeln.
- Masterbild, OCR-Ergebnis und aktuelle OCR-Auswahl werden getrennt pro Profil im Browser gehalten.
- Beim Profilwechsel wird nur das zu diesem Profil gehörende Masterbild angezeigt.
- Neue Schaltfläche „Masterbild entfernen“ löscht ausschließlich das Bild des ausgewählten Profils.

## Hinweise

- Masterbilder bleiben weiterhin nur flüchtig im Browser und werden nicht in `label-profiles.json` exportiert.
- Nach einem Neuladen der Webseite müssen die Masterbilder erneut ausgewählt werden.



# 0.5.0

- PaddleOCR-Profileditor als zweite GitHub-Pages-Seite ergänzt.
- Multi-Page-Vite-Build für Scanner und Editor.
- Direkte Bearbeitung von Anker- und Feldzonen.
- Feldregeln und Bereinigungen im Editor konfigurierbar.
- Fassnummern-Erkennung neben bzw. nach dem Produkt-Batch.
- `/0001` und OCR-Variante `10001` werden zu `0001` normalisiert.
- Fassnummer in Protokoll und Excel ergänzt.



# 0.3.1

- Fehler `Unsupported lang/ocrVersion combination: lang="de", ocrVersion="PP-OCRv5"` behoben.
- Sprachkürzel-basierte Modellauswahl entfernt.
- Offizielle eingebaute Modellnamen `PP-OCRv5_mobile_det` und `PP-OCRv5_mobile_rec` werden direkt verwendet.
- Oberfläche auf eine eindeutige Standardmodell-Option reduziert.
- Test ergänzt, der verhindert, dass erneut `lang: de` in die Browserkonfiguration gelangt.

## 0.6.3
- Automatischer OCR-Crash-Recovery-Modus für verwaltete Firmengeräte.
- Bleibt während einer Inferenz ein Crash-Marker stehen, startet LabelCheck beim nächsten Laden automatisch im Kompatibilitätsmodus.
- Kompatibilitätsmodus: WASM statt WebGPU, 1 Thread, Recognition-Batch 1, max. 1200 px, Detektorlimit 640 px.
- Kamerafotos werden im Kompatibilitätsmodus nach Möglichkeit bereits beim `createImageBitmap`-Decode verkleinert, um große RGBA-Zwischenpuffer zu vermeiden.
- Manueller Schalter für den Kompatibilitätsmodus im Scanner.
- Android/iOS werden nicht mehr unterschiedlich behandelt.
- Layoutprofil wird bei jedem neuen Foto weiterhin auf „Automatisch“ zurückgesetzt.
