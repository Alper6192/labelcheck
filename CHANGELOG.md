# LabelCheck PaddleOCR 0.16.21

## 0.16.21

- Bedienerprüfung ändert eine echte Batch-Abweichung nicht mehr in einen neutralen Prüfstatus.
- Nach Klick auf „Überprüft“ bleibt eine abweichende Batch **rot** und wird als `NICHT FREIGEGEBEN` angezeigt.
- Der Hinweis `✓ Vom Bediener überprüft` wird zusätzlich angezeigt.
- Beim Speichern/CSV-Export wird in diesem Fall ebenfalls der endgültige Status `NICHT FREIGEGEBEN` persistiert.


- Neuer Bedienerschritt „Überprüft“: Bei Status „ÜBERPRÜFEN“ ist die Datensatzübernahme gesperrt, bis der Bediener die Prüfung bestätigt.
- Erkennungsquote unter 60 % löst automatisch „ÜBERPRÜFEN“ aus und nennt die betroffenen Felder.
- Doppelte Feldinhalte innerhalb desselben Labels werden verhindert; derselbe Wert kann nicht gleichzeitig z. B. Lieferscheinnummer und Gewicht sein.
- Manuelle Eingaben werden ebenfalls gegen identische Doppelbelegungen geprüft.
- Gewicht profilübergreifend auf maximal fünf Ziffern vor dem Dezimaltrennzeichen begrenzt; Nachkommastellen bleiben zulässig.
- Unplausible Gewichte und verhinderte Doppelbelegungen werden als Prüfgrund gekennzeichnet.
- Profil-JSON bleibt byte-identisch zum freigegebenen 0.16.7-Master.

# LabelCheck PaddleOCR 0.16.19

- CSV-Spalte „Manuell korrigiert“ nennt jetzt konkret die manuell geänderten Felder statt nur Ja/Nein.
- Beispiele: „Gewicht Produkt“, „IDH VDA“ oder mehrere Einträge kommasepariert.
- Nicht korrigierte Datensätze lassen die Spalte leer; ältere gespeicherte Datensätze ohne Detailhistorie behalten bei Bedarf „Ja“.
- Profil-JSON bleibt unverändert gegenüber dem freigegebenen 0.16.7-Master.

# LabelCheck PaddleOCR 0.16.18

- Exportstatus wird vor dem Android-Share-Sheet persistent gespeichert.
- Kein Begriff „Stapel“ mehr in der Benutzeroberfläche.
- Nach dem Senden werden dieselben zwei Exportbuttons kontextbezogen zu „In OneDrive gespeichert“ und „CSV erneut senden“.
- Die OneDrive-Bestätigung erfolgt erst durch einen separaten, direkten Button-Klick und funktioniert dadurch auch nach Rückkehr aus dem mobilen Share-Sheet zuverlässig.
- Neue Scans nach einem Export warten getrennt auf den nächsten Export und werden nicht versehentlich mitbestätigt.
- Bestehende offene Exporte aus 0.16.17 werden automatisch als bestätigungsbereit übernommen.
- Gesendete Datensätze können weiterhin separat geleert werden.
- Profil-JSON bleibt unverändert gegenüber dem freigegebenen 0.16.7-Master.

# LabelCheck PaddleOCR 0.16.17

- Kamera darf auch bei hochkant gehaltenem Smartphone immer öffnen; Querformat wird erst nach der tatsächlichen Aufnahme geprüft.
- Exportlogik verfeinert: offener Stapel wird eindeutig als „Offenen Stapel senden“ dargestellt, neue Teile warten getrennt auf den nächsten Stapel.
- Nach bestätigtem Upload wird das Protokoll aus dem persistenten Speicher neu geladen, damit der Zähler sofort korrekt aktualisiert wird.
- „Gesendete leeren“ entfernt ausschließlich bereits als gesendet bestätigte Datensätze; neue/offene Teile sind nicht löschbar.
- Profil-JSON bleibt byte-identisch zum freigegebenen 0.16.7-Master.

# LabelCheck PaddleOCR 0.16.16

- Status unter dem Foto heißt während der Erkennung nur noch „Bild wird analysiert …“.
- Hochkantprüfung robust gegen EXIF-Rotation; Hochkantfotos werden vor OCR abgewiesen.
- Bereits vor dem nativen Kameraaufruf muss das Smartphone quer gehalten werden.
- Export wieder als echter Stapel: ein gestarteter „Neue Teile“-Stapel bleibt eingefroren, bis er bestätigt wurde.
- Später gescannte Teile warten auf den nächsten Stapel und werden nicht in einen offenen Export gemischt.
- Nur zwei Exportaktionen: „Neue Teile senden“ und „Gesamtes Protokoll senden“.
- Ungesendete Datensätze können in der Oberfläche nicht gelöscht werden.
- Profilkonfiguration unverändert gegenüber dem freigegebenen 0.16.7-Master.

# Änderungen

## 0.16.15
- Exportstatus vereinfacht: „Neue Einträge senden“ und „Gesamtes Protokoll senden“.
- Bereits bestätigte Einträge bleiben lokal sichtbar und werden als gesendet markiert.
- „Ungesendete löschen“ entfernt ausschließlich noch nicht bestätigte Datensätze.
- Kein eingefrorener „CSV erneut senden“-Stapel mehr; neue Einträge werden automatisch als neu erkannt.
- Hochkantfotos werden vor OCR mit dem Hinweis „Bitte das Label quer fotografieren“ abgewiesen.
- Rückkamera-Hinweis `capture=environment` wird bei jedem nativen Kamera-Aufruf erneut gesetzt.
- Profil-JSON bleibt byte-identisch zum freigegebenen 0.16.7-Master.

## 0.16.14 – Produktvalidierung, reduzierte Export-UI und Kamera-Input (2026-08-13)

- Produktfoto wird nur noch akzeptiert, wenn das Henkel-Produktprofil über den Anker sicher erkannt wird und eine gültige Batchnummer vorhanden ist; beliebige Fotos werden mit klarer Fehlermeldung abgewiesen.
- Automatische Produktprofil-Auswahl fällt nicht mehr auf das einzige vorhandene Produktprofil zurück, wenn kein Anker erkannt wurde.
- Feldhinweise zeigen „Erkennungsquote: … %“ statt „OCR … %“.
- „Analyse starten“ entfernt; die Analyse läuft weiterhin automatisch nach der Bildaufnahme.
- Analysebereich erhält den Text „Hier erscheint das Ergebnis des Labelchecks.“
- Export-UI auf einen einzigen Exportbutton plus „Protokoll leeren“ reduziert. Nach dem Teilen fragt die App per Bestätigungsdialog, ob die CSV wirklich in OneDrive gespeichert wurde; nur dann wird der eingefrorene Exportstapel archiviert.
- Produkt- und VDA-Kamera verwenden dauerhaft vorhandene native Datei-Inputs mit `capture="environment"` statt bei jedem Klick neu erzeugter Inputs.
- CSV-Share übergibt den Soll-Dateinamen zusätzlich als `title` und `text`.
- Profil-JSON bleibt byte-identisch zum freigegebenen 0.16.7-Master.

## 0.16.13 – Bestätigter Exportstapel ohne Microsoft-Anbindung (2026-08-13)

- CSV-Export friert die aktuell vorhandenen Protokolleinträge als ausstehenden Exportstapel ein.
- Neue Scans werden nicht in einen bereits erzeugten Stapel hineingemischt.
- Nach erfolgreichem Speichern in OneDrive bestätigt der Werker den Export ausdrücklich.
- Erst dann werden genau die enthaltenen Datensätze als exportiert markiert und aus dem aktiven Protokoll entfernt.
- Ausstehende Exporte bleiben über einen Browser-Neustart erhalten und können erneut geteilt/heruntergeladen werden.
- „Export zurücksetzen“ verwirft nur den Exportstatus; die Scandaten bleiben erhalten.
- Keine Microsoft-/Graph-Anbindung und kein Timer.

## 0.16.13 – Native Kamera-App und Android-Share-Hinweise (2026-08-13)

- Kamera-Popup im Browser entfernt; „Foto aufnehmen“ öffnet wieder die native Kamera-App.
- Für jeden Kamera-Aufruf wird ein frischer Datei-Input mit `capture="environment"` erzeugt, damit die Rückkamera erneut ausdrücklich angefordert wird.
- Galerie-Auswahl bleibt davon getrennt.
- CSV-Export bleibt `Labelcheck_YYYY-MM-DD_HH-MM-SS.csv`; die App selbst erzeugt keinen `share…`-Dateinamen.
- Profil-JSON bleibt byte-identisch zum 0.16.7-Master.

## 0.16.11 – CSV, feste Rückkamera und Batch-Freigabe (2026-08-13)

- Profilkonfiguration bewusst byte-identisch aus dem vom Nutzer hochgeladenen 0.16.7-Master übernommen.
- Export vollständig auf CSV vereinheitlicht.
- Dateiname beim Teilen/Download: `Labelcheck_YYYY-MM-DD_HH-MM-SS.csv`.
- CSV-Spalten `Nr.` und `Produktprofil` entfernt.
- Fotoaufnahme verwendet eine eigene Kameravorschau mit harter Rückkamera-Anforderung (`environment`); eine erkannte Frontkamera wird nicht angezeigt.
- Freigabe/Nicht-Freigabe basiert nur noch auf der Batchnummer. IDH und Gewicht bleiben sichtbar und werden gespeichert, beeinflussen die Freigabe aber nicht.

## 0.16.7 – Versionsupdate und Projektprüfung (2026-08-12)

- Projektversion auf 0.16.7 erhöht.
- App-Version in Runtime-Konfiguration und Profilkonfiguration auf 0.16.7 synchronisiert.
- Versionstest auf 0.16.7 angepasst.
- Projektprüfung: 96 Tests erfolgreich.

## 0.6.16 – Produktgewicht von Fassnummer getrennt (2026-08-09)

- Henkel-Produktgewicht akzeptiert keine einheitenlosen Zahlen mehr.
- Fassnummern wie `0007` können dadurch nicht mehr als Gewicht übernommen werden.
- Getrennte OCR-Boxen wie `25` + `KG` werden für das Produktgewicht zusammengesetzt.
- Falls kein Wert mit plausibler Einheit gefunden wird, bleibt Gewicht leer statt eine Fassnummer zu verwenden.
- Fassnummer aus Batch-Suffix wird in der Oberfläche als abgeleiteter OCR-Wert gekennzeichnet.
- Version auf 0.6.16 erhöht.

## 0.6.15 – Scania Gross/Net-Paar robust (2026-08-09)

- Scania-Gewicht hängt nicht mehr davon ab, dass PaddleOCR `KG` exakt erkennt.
- Eine Gross/Net-Zeile mit zwei 3–5-stelligen Werten liefert immer den rechten Wert als Netto.
- Funktioniert auch bei getrennten OCR-Boxen (`1550`, `/`, `1300`, `KG`) und bei OCR-Fehlern wie `K6`/`KC`.
- Eine einzelne einheitenlose Zahl wie `1550` bleibt weiterhin ausgeschlossen.
- Version auf 0.6.15 erhöht.

## 0.6.14 – Scania Engine-Fix (2026-08-09)

- Versionsnummer bei jeder funktionalen Änderung erhöht.
- Scania-Gewicht ist jetzt ein fester Engine-Sonderfall für Profil `SCANIA` + Feld `weight`; kein optionaler `strategy`-Schlüssel in der JSON mehr erforderlich.
- Einzelne Bruttozahlen ohne `K`/`KG` werden niemals als Scania-Gewicht akzeptiert.
- Aus `1550 / 1300 KG` wird gezielt `1300 KG` extrahiert.
- Getrennte OCR-Boxen `1300` + `KG`/`K` werden zeilenbasiert verbunden; die nächstliegende Zahl links der Einheit gewinnt.
- Die Sollbox dient bei Scania nur noch zum Ranking und verwirft einen rechts liegenden Nettowert nicht mehr.
- VW-Verhalten aus dem vorherigen Patch bleibt unverändert.

## 0.6.12 – Scania Split-OCR-Patch (2026-08-09)

- Scania: Nettogewicht wird jetzt auch dann erkannt, wenn PaddleOCR `1300` und `KG`/`K` in getrennte OCR-Boxen aufteilt.
- Scania: Bei `1550 / 1300 KG` wird ausschließlich die Zahl verwendet, an der die Einheit `K`/`KG` hängt; die einheitenlose Bruttozahl `1550` kann nicht gewinnen.
- Scania: Zusammengehörige Zahl- und Einheitenboxen werden nur auf derselben Zeile und bei kleinem horizontalem Abstand gekoppelt.
- VW-Fixes aus dem vorherigen 0.6.12-Patch bleiben unverändert.

# Changelog

## 0.6.12 – VW/Scania-Erkennungspatch (2026-08-09)

- Scania: Ein einzelner Gewichtskandidat ist nur noch gültig, wenn OCR direkt `K` oder `KG` erkennt. Bei `1550 / 1300 KG` liefert `net_weight` weiterhin zwingend den rechten Wert. `K` wird intern wie `KG` behandelt.
- VW: Lieferscheinnummer und IDH werden primär direkt aus der großen unteren Zahlenzeile gelesen. Die kleine Beschriftung `Delivery number / IDH` ist dafür nicht mehr erforderlich. Die IDH sind die letzten 7 Ziffern, der vordere Block ist die Lieferscheinnummer.
- VW: Gewicht wird aus der oberen Quantity-Angabe gewählt und muss im OCR-Rohtext `KGM` oder `LTR` enthalten. Die darunterliegende `Gross / Net weight`-Zeile mit `KG` wird für dieses Feld nicht mehr verwendet.
- VW: Auch getrennte OCR-Boxen (`1150` + `KGM` bzw. LSN + IDH) werden zusammengeführt.
- Profileditor: `net_weight` und `leading_delivery_digits` sind als Bereinigungsoptionen sichtbar, damit diese Regeln beim späteren Bearbeiten nicht versehentlich überschrieben werden.
- Zusätzliche Regressionstests für Scania und VW.

## 0.6.12

- Intern1/Intern2: Lieferscheinnummer wird auch erkannt, wenn `Transportauftrag - Position` und der Wert in derselben OCR-Zeile liegen.
- VW: Lieferscheinnummer wird robust aus der großen unteren Zeile `Delivery number / IDH` abgeleitet; links = LSN, letzte 7 Ziffern = IDH.
- VW: Gross/Net-Gewicht hat einen inhaltsbasierten Fallback auf reine `Brutto / Netto Einheit`-Muster, falls die kleine Feldbeschriftung von OCR nicht gelesen wird.
- Anzeige: OCR-Locator- und OCR-Pattern-Treffer werden wieder als OCR-Treffer mit Konfidenz angezeigt statt fälschlich als „nicht erkannt“.

# 0.6.11

- VW-Felder werden zusätzlich über ihre gedruckten Feldbezeichnungen lokalisiert (Delivery note, Delivery number / IDH, Gross / Net weight, Batch Nr.).
- VW-Anker richtet unterschiedlich lange Volkswagen-Namen an der linken Textkante aus; Textbreite verschiebt das Profil nicht mehr.
- INTERN1/INTERN2: Lieferscheinnummer wird ausschließlich unter „Transportauftrag - Position“ gesucht; Referenzbeleg ist kein LSN-Kandidat mehr.
- Locator-Regeln sind bewusst strikt: Wird die Feldbezeichnung nicht sicher gefunden, bleibt das Feld leer statt eine ähnlich formatierte falsche Nummer zu übernehmen.

# 0.6.10

- VW: Profilskalierung nutzt bei unterschiedlich langen Volkswagen-Ankern die Ankerhöhe statt der Textbreite.
- INTERN1/INTERN2: Lieferscheinnummer ist räumlich an den eingelernten unteren Bereich gebunden; Referenzbelegnummern oberhalb werden nicht mehr übernommen.
- Scania: Gross/Net-Zeile bevorzugt den rechten Nettowert und Kandidaten mit Gewichtseinheit; knapp außerhalb der Sollbox liegende Netto-Werte bleiben zulässig.

# 0.6.9

- Aktuelle Nutzerkonfiguration als Basis übernommen.
- INTERN2: ausschließlich `Prüflos` als Hauptanker; `Alte Materialnummer` schließt das Profil aus.
- Anker mit `localizeAlias` werden innerhalb längerer OCR-Zeilen geometrisch auf den Alias-Teilbereich zugeschnitten. Dadurch beeinflussen lange H-Sätze die INTERN2-Skalierung nicht mehr über die gesamte Zeilenbreite.
- Manuell gewählte Textprofile benötigen ebenfalls einen ausreichend sicheren Ankertreffer; beliebiger OCR-Text wird nicht mehr als Transformationsanker akzeptiert.
- Schema-Normalisierung erhält `detection`, `localizeAlias` und `fallbacks` aus der Profilkonfiguration.
- Bildqualität erzeugt nur einen nicht blockierenden Hinweis im Scanstatus.
- Tesla wird auch bei manueller Profilauswahl und bei erneuter Analyse über `detectQrProfile()` verarbeitet.
- Scanprotokoll von localStorage auf IndexedDB umgestellt; bestehende localStorage-Datensätze werden migriert, maximal 500 Einträge.
- Nach erfolgreichem Speichern wird `Datensatz übernehmen` bis zur nächsten relevanten Änderung deaktiviert.
- Extraktionswarnungen bzw. leere Extraktionen können nicht versehentlich als Freigabe gewertet werden.
- `onnxruntime-web` als direkte Build-Abhängigkeit ergänzt.

# 0.6.4

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
