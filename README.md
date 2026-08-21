# LabelCheck 1.0.3

LabelCheck prüft weiterhin immer **ein Produktlabel** gegen **ein VDA-/TA-Label**. Die Bedienoberfläche, Freigabelogik, Kamera, Bedienerprüfung, Scanprotokoll und CSV-Funktion bleiben wie in 0.16.22. Seit 0.17.0 ist die Profilarchitektur vollständig konfigurationsgesteuert: **alle labelabhängigen Erkennungsregeln liegen in `public/config/label-profiles.json` und können vollständig im erweiterten Profileditor gepflegt werden.**

## Profileditor 1.0.3
Der erweiterte Profileditor ist jetzt auf Deutsch und Englisch umschaltbar, logisch gruppiert und mit kontextbezogenen ?-Hilfen versehen. Technische Alt-Funktionen wurden aus der Oberfläche entfernt. Feldspezifische Bereinigung und Strategien werden nur dort angeboten, wo sie fachlich sinnvoll sind. Nachbarfelder können generisch relativ zu Batch, Fassnummer, IDH oder Gewicht mit den Richtungen links/rechts/oben/unten konfiguriert werden. Feldzonen erhalten beim Übernehmen fest 10 % Rand.

## Editor-Stabilität 0.17.1

Der Profileditor verwendet für **„Masterbild analysieren“** absichtlich einen stabilen WASM-Web-Worker mit einem Thread und einem auf 1000 px begrenzten Analyse-Arbeitsbild. Das gespeicherte Masterbild selbst bleibt in voller Editorauflösung erhalten. Diese Editor-Policy verändert die Performance-Einstellungen des eigentlichen Scanners nicht. Der zuletzt ausgewählte Profil-Eintrag wird lokal gemerkt, damit nach einem Browser-Neustart wieder dasselbe Profil samt lokal gespeichertem Masterbild geöffnet wird.


## Architektur

Die Scanner-App ist eine generische Engine. Sie kennt keine einzelnen Kunden-/Labelprofile mehr als Sonderfall im JavaScript. Ein Profil beschreibt in der JSON:

- Rolle: Produktlabel oder VDA-/TA-Label
- Quelle: Text/Layout oder QR-Code
- Profilanker und alternative Anker
- zusätzliche Erkennungs- und Ausschlussmerkmale
- Mindestquoten für Profilerkennung und Labelvalidierung
- feste LabelCheck-Felder: Batch, IDH, Gewicht, Lieferscheinnummer, Fassnummer
- Feldzonen, Regex, Normalizer und Pflicht-/Vergleichsstatus
- Locator-Regeln relativ zu Feldbeschriftungen
- Erkennungsstrategien und deren Parameter
- QR-Suchbereiche und QR-Parserregeln
- Pflichtfelder und profilspezifische Fehlermeldung

Damit kann ein neues Text- oder QR-Label über den Editor angelegt werden, ohne `index.html`, `main.js` oder `profile-engine.js` anzupassen.

## Globale Regeln

Regeln, die für alle Standorte und Labels identisch sind, bleiben zentral in der App. Dazu gehören insbesondere:

- Workflow Produktlabel → VDA/TA → Batchvergleich
- Freigabe ausschließlich über die Batchnummer
- Bedienerprüfung bei manueller Korrektur oder Erkennungsquote unter 60 %
- keine identische Doppelbelegung zweier Felder innerhalb desselben Labels
- Gewicht maximal fünf Ziffern vor dem Dezimaltrennzeichen
- Querformatprüfung nach der Fotoaufnahme
- Scanprotokoll, Exportstatus und CSV-Verhalten

## Erweiterter Profileditor

Der Editor ist bewusst als erweiterter Modus ausgelegt. Typischer Ablauf für ein neues Text-Label:

1. Neues Profil anlegen und Rolle wählen.
2. `Text / Layout` als Erkennungsquelle wählen.
3. Masterbild laden und die Bildanalyse ausführen.
4. Profilanker markieren und Aliase festlegen.
5. Batch, IDH, Gewicht, Lieferscheinnummer und/oder Fassnummer zuordnen.
6. Für jedes Feld Regex, Normalizer, Suchbereich und bei Bedarf eine Erkennungsstrategie einstellen.
7. Profilerkennung, Ausschlussmerkmale, Pflichtfelder und Mindestquoten einstellen.
8. Konfiguration als `label-profiles.json` exportieren und unter `public/config/` ablegen.

### Allgemeine Erkennungsstrategien

Die bisher im Code eingebauten Sonderlogiken wurden in allgemeine, im Editor wählbare Strategien überführt:

- **Standard: Zone / Nähe** – normale Feldsuche um die markierte Sollposition
- **Gewicht nur mit Einheit** – akzeptiert nur Gewichtswerte mit Einheit und verbindet bei Bedarf getrennte Zahl-/Einheitsboxen
- **Netto aus Zahlenpaar / rechter Wert** – verarbeitet Gross-/Netto-Zeilen und toleriert typische Erkennungsfehler der Gewichtseinheit
- **Große Zahlen-Kombizeile** – teilt kombinierte Zahlenzeilen in linken und rechten Wert
- **Quantity-Gewicht mit bevorzugter Einheit** – sucht Mengenwerte mit konfigurierbaren Einheiten

Zusätzlich lassen sich Suchradius, Mindestüberlappung, bevorzugte Position/Einheit, Tail-Länge, Kombizeilenlänge und Locator-Regeln einstellen. Die bestehende produktive Konfiguration wurde auf diese Strategien migriert, sodass die bisherige Erkennungsleistung erhalten bleibt.

## QR-Profile ohne Codeänderung

QR-Profile sind ebenfalls vollständig konfigurationsgesteuert. Im Editor können eingestellt werden:

- primärer und optionaler Fallback-Suchbereich im Bild
- welche der fünf LabelCheck-Felder aus dem QR gelesen werden
- Primär-RegEx und Capture-Gruppe
- optionaler Sekundär-RegEx, z. B. für eine Einheit
- Fallbackwert für den Sekundärteil
- Template zur Zusammensetzung des Feldwerts
- einfache Ersetzungen
- Pflichtfelder, die erfüllt sein müssen, damit der QR zu diesem Profil gehört

Über **„QR-Regeln am Masterbild testen“** kann die Konfiguration direkt im Editor geprüft werden.

## Bedienerprüfung

Wenn die Analyse `ÜBERPRÜFEN` liefert, muss der Bediener die Werte kontrollieren und **„Überprüft“** drücken. Erst danach wird die endgültige Batchentscheidung sichtbar und der Datensatz kann übernommen werden. Bei Batchabweichung bleibt das Ergebnis rot `NICHT FREIGEGEBEN`; bei gleicher Batch wird es grün `FREIGEGEBEN`.

## Scanprotokoll und CSV

Das Protokoll liegt lokal in IndexedDB. „Neue Teile senden“ hält die zu diesem Export gehörenden Datensätze fest, bis der Bediener den erfolgreichen OneDrive-Upload bestätigt. Neue Scans werden nicht in einen bereits versendeten Export gemischt. „Gesamtes Protokoll senden“ exportiert den vollständigen lokalen Verlauf. Bereits bestätigte Einträge können separat über „Gesendete leeren“ entfernt werden.

Dateiname: `Labelcheck_YYYY-MM-DD_HH-MM-SS.csv`.

Die Spalte `Manuell korrigiert` enthält die konkret bearbeiteten Felder, z. B. `Gewicht Produkt, IDH VDA`.

## Kamera und Erkennungslaufzeit

Die Bediener-App verwendet einen geführten Vollbild-Kameramodus mit Rückkamera. Nach „Labelprüfung starten“ wird zuerst das Produktlabel und direkt danach ohne Zwischenbestätigung das VDA-/TA-Label fotografiert. Die Aufnahme ist nur im Querformat möglich; nach Abschluss können einzelne Fotos gezielt neu aufgenommen werden.

Mobilgeräte verwenden standardmäßig den stabilen Erkennungsmodus, Desktop/Notebook den schnellen AUTO-Modus. Die Erkennungsmodelle werden beim Build in die Pages-Site kopiert und same-origin geladen.

## Deployment

```bash
npm install
npm test
npm run build
```

GitHub Pages veröffentlicht anschließend den erzeugten `dist`-Ordner über den enthaltenen GitHub-Actions-Workflow.

## Feldsicherheit ab 1.0.2

Automatisch erkannte Feldwerte werden erst ab einer Erkennungsquote von 80 % übernommen. Unterhalb dieser Grenze oder bei fehlender Erkennung bleibt das konfigurierte Feld leer und wird orange markiert. Der Bediener muss einen gültigen Wert manuell eintragen; erst danach kann eine erforderliche Bedienerprüfung bestätigt und der Datensatz übernommen werden. Nicht angelegte Felder sind davon nicht betroffen.
