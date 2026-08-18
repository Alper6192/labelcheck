const LANGUAGE_KEY = "labelcheck.editor.language.v1";

const TEXT = {
  title: ["LabelCheck Profileditor", "LabelCheck Profile Editor"],
  subtitle: ["Profile, Erkennungsregeln und Feldzonen konfigurieren und als JSON exportieren.", "Configure profiles, recognition rules and field zones and export them as JSON."],
  scannerLink: ["Zum Scanner", "Open scanner"],
  configuration: ["Konfiguration", "Configuration"],
  loading: ["wird geladen …", "loading …"],
  importJson: ["JSON importieren", "Import JSON"],
  exportJson: ["Alle Profile als JSON exportieren", "Export all profiles as JSON"],
  newProfile: ["Neues Profil", "New profile"],
  duplicateProfile: ["Profil duplizieren", "Duplicate profile"],
  deleteProfile: ["Profil löschen", "Delete profile"],
  profiles: ["Profile", "Profiles"],
  profileBasics: ["Profil", "Profile"],
  profileId: ["Profil-ID", "Profile ID"],
  profileName: ["Name", "Name"],
  profileRole: ["Rolle", "Role"],
  productLabel: ["Produktlabel", "Product label"],
  vdaLabel: ["VDA-/TA-Label", "VDA/TA label"],
  profileActive: ["Profil aktiv", "Profile active"],
  recognitionSource: ["Erkennungsquelle", "Recognition source"],
  ocrLayout: ["Text / Layout", "Text / layout"],
  qrCode: ["QR-Code", "QR code"],
  anchorSection: ["Anker und Layoutausrichtung", "Anchor and layout alignment"],
  anchorAliases: ["Anker-Aliase", "Anchor aliases"],
  localizeAlias: ["Alias innerhalb längerer Textzeile lokalisieren", "Locate alias inside a longer text line"],
  scaleLayout: ["Skalierung des Layouts", "Layout scaling"],
  scaleWidth: ["über Ankerbreite", "by anchor width"],
  scaleHeight: ["über Ankerhöhe", "by anchor height"],
  alignment: ["Ausrichtung", "Alignment"],
  anchorCenter: ["Ankermitte", "anchor center"],
  anchorLeft: ["linke Ankerkante", "left anchor edge"],
  profileDetection: ["Profilerkennung", "Profile detection"],
  evidenceAliases: ["Zusätzliche Erkennungsmerkmale", "Additional recognition features"],
  minEvidence: ["Mindestens erkannte Merkmale", "Minimum recognized features"],
  excludeAliases: ["Ausschlussmerkmale", "Exclusion features"],
  detectionMinScore: ["Mindest-Ankerquote für Profilauswahl", "Minimum anchor score for profile selection"],
  validation: ["Labelvalidierung", "Label validation"],
  validationMinAnchor: ["Mindest-Ankerquote für gültiges Label", "Minimum anchor score for a valid label"],
  validFields: ["Diese Felder müssen für ein gültiges Label vorhanden sein", "These fields must be present for a valid label"],
  errorMessage: ["Fehlermeldung bei ungültigem Label", "Error message for invalid label"],
  batch: ["Batch", "Batch"],
  drum: ["Fassnummer", "Drum number"],
  idh: ["IDH", "IDH"],
  weight: ["Gewicht", "Weight"],
  deliveryNote: ["Lieferscheinnummer", "Delivery note number"],
  qrRegions: ["QR-Suchbereiche", "QR search regions"],
  qrRegionHint: ["Werte sind relativ zum Bild: 0 = links/oben, 1 = rechts/unten. Ein zweiter Bereich ist optional.", "Values are relative to the image: 0 = left/top, 1 = right/bottom. A second region is optional."],
  useSelectionQr: ["Aktuelle Auswahl als ersten QR-Bereich übernehmen", "Use current selection as first QR region"],
  qrFieldRules: ["QR-Feldregeln", "QR field rules"],
  testQr: ["QR-Regeln am Masterbild testen", "Test QR rules on master image"],
  masterOcr: ["Masterbild und Erkennung", "Master image and recognition"],
  ocrPreparing: ["Erkennung wird vorbereitet …", "Preparing recognition …"],
  loadMaster: ["Masterbild laden", "Load master image"],
  runOcr: ["Masterbild analysieren", "Analyze master image"],
  exportOcr: ["Analyseergebnis exportieren", "Export analysis result"],
  cancelAnalysis: ["Analyse abbrechen", "Cancel analysis"],
  hideOcr: ["Erkennungsbereiche ausblenden", "Hide recognition areas"],
  removeMaster: ["Masterbild entfernen", "Remove master image"],
  firstStartModel: ["Die Erkennung wird beim ersten Start vorbereitet.", "Recognition is prepared on first use."],
  selectOcrBox: ["Erkannten Bereich auswählen", "Select recognized area"],
  drawFreeZone: ["Freie Zone zeichnen", "Draw free zone"],
  editAssignment: ["Zuordnung verschieben/ändern", "Move/edit assignment"],
  anchorButton: ["Kunden-/Produktanker", "Customer/product anchor"],
  masterHint: ["Masterbild laden. Dann die Bildanalyse starten oder direkt eine freie Zone zeichnen.", "Load a master image. Then start image analysis or draw a free zone directly."],
  noMaster: ["Noch kein Masterbild", "No master image yet"],
  currentSelection: ["Aktuelle Auswahl", "Current selection"],
  noSelection: ["Kein erkannter Bereich und keine freie Zone ausgewählt.", "No recognized area or free zone selected."],
  properties: ["Eigenschaften", "Properties"],
  noAssignment: ["keine Zuordnung", "no assignment"],
  chooseAssignment: ["Wähle einen Anker oder ein Feld aus.", "Select an anchor or a field."],
  valueRules: ["Wert und Format", "Value and format"],
  finalRegex: ["Regex für den fertigen Wert", "Regex for final value"],
  sourceRegex: ["Regex für erkannten Rohtext", "Regex for recognized raw text"],
  cleanup: ["Bereinigung", "Cleanup"],
  lastDigitsCount: ["Anzahl der letzten Ziffern", "Number of trailing digits"],
  normalText: ["Text unverändert", "Keep text"],
  normalDigits: ["Nur Ziffern", "Digits only"],
  normalBatch: ["Batch übernehmen", "Extract batch"],
  normalWeight: ["Einheit anpassen", "Normalize unit"],
  normalNetWeight: ["Netto-Gewicht (rechter Wert)", "Net weight (right value)"],
  normalDeliveryPair: ["Lieferscheinnummer aus Kombizeile", "Delivery number from combined line"],
  normalLastDigits: ["Letzte Ziffern übernehmen", "Keep trailing digits"],
  positionSearch: ["Positionssuche", "Position search"],
  searchRadius: ["Suchradius-Faktor", "Search radius factor"],
  minOverlap: ["Mindest-Überlappung", "Minimum overlap"],
  preferRightmost: ["rechten Kandidaten bevorzugen", "Prefer rightmost candidate"],
  preferUnit: ["Kandidaten mit Einheit bevorzugen", "Prefer candidates with unit"],
  neighborSection: ["Nachbarfeld", "Neighbor field"],
  useNeighbor: ["Nachbarfeld zur Erkennung verwenden", "Use neighboring field for recognition"],
  neighborTarget: ["Bezugsfeld", "Reference field"],
  neighborDirections: ["Erlaubte Position des aktuellen Feldes", "Allowed position of current field"],
  neighborLeft: ["links", "left"],
  neighborRight: ["rechts", "right"],
  neighborAbove: ["oben", "above"],
  neighborBelow: ["unten", "below"],
  neighborMaxDistance: ["Max. Abstand", "Max. distance"],
  strategySection: ["Spezielle Erkennungsstrategie", "Special recognition strategy"],
  strategy: ["Strategie", "Strategy"],
  strategyStandard: ["Standard: Zone / Nähe", "Standard: zone / proximity"],
  strategyUnitWeight: ["Gewicht nur mit Einheit", "Weight only with unit"],
  strategyNetPair: ["Netto aus Zahlenpaar / rechter Wert", "Net from number pair / right value"],
  strategyNumericPair: ["Große Zahlen-Kombizeile", "Large combined number line"],
  strategyQuantity: ["Quantity-Gewicht mit bevorzugter Einheit", "Quantity weight with preferred unit"],
  strategyUnits: ["Strategie-Einheiten", "Strategy units"],
  fallbackStrategy: ["Fallback-Strategie", "Fallback strategy"],
  noFallback: ["keine", "none"],
  fallbackNetPair: ["Zahlenpaar Gross/Net", "Gross/net number pair"],
  pairLeftMin: ["Linke Zahl min. Stellen", "Left number min. digits"],
  pairLeftMax: ["Linke Zahl max. Stellen", "Left number max. digits"],
  tailDigits: ["Rechter Anteil / Tail", "Right part / tail"],
  combinedMin: ["Kombizeile min. Stellen", "Combined line min. digits"],
  locatorSection: ["Locator – Wert relativ zu einer Feldbeschriftung", "Locator – value relative to a field caption"],
  locatorAliases: ["Locator-Aliase", "Locator aliases"],
  locatorDirection: ["Richtung", "Direction"],
  belowOrRight: ["unterhalb oder rechts", "below or right"],
  below: ["unterhalb", "below"],
  right: ["rechts", "right"],
  locatorMaxDistance: ["Max. Abstand", "Max. distance"],
  minAliasScore: ["Mindest-Aliasquote", "Minimum alias score"],
  locatorStrict: ["nur Locator-Treffer zulassen", "allow locator matches only"],
  locatorPreferRight: ["rechten Locator-Wert bevorzugen", "prefer right locator value"],
  locatorPreferLeft: ["linken Locator-Wert bevorzugen", "prefer left locator value"],
  locatorPreferUnit: ["Locator-Wert mit Einheit bevorzugen", "prefer locator value with unit"],
  locatorPreferBatch: ["Batchformat bevorzugen", "prefer batch format"],
  fieldValidation: ["Feldverhalten", "Field behavior"],
  requiredField: ["Pflichtfeld", "Required field"],
  compareField: ["Produkt und VDA vergleichen", "Compare product and VDA"],
  deleteAssignment: ["Diese Zuordnung löschen", "Delete this assignment"],
  primaryQrRegion: ["Primärer QR-Bereich", "Primary QR region"],
  fallbackQrRegion: ["Fallback-QR-Bereich (optional)", "Fallback QR region (optional)"],
  width: ["Breite", "Width"],
  height: ["Höhe", "Height"],
  qrReadField: ["Feld aus QR lesen", "Read field from QR"],
  qrRequired: ["für QR-Profilerkennung erforderlich", "required for QR profile recognition"],
  primaryRegex: ["Primär-RegEx", "Primary regex"],
  captureGroup: ["Capture-Gruppe", "Capture group"],
  template: ["Template", "Template"],
  secondaryRegex: ["Sekundär-RegEx (optional)", "Secondary regex (optional)"],
  secondaryGroup: ["Sekundär-Gruppe", "Secondary group"],
  secondaryDefault: ["Fallback Sekundärwert", "Fallback secondary value"],
  replacements: ["Ersetzungen, eine pro Zeile", "Replacements, one per line"],
  openFieldProperties: ["Feldeigenschaften öffnen", "Open field properties"]
};

const HELP = {
  profileId: ["Eindeutige technische Kennung des Profils. Sie sollte nur aus Buchstaben, Zahlen und Unterstrichen bestehen.", "Unique technical identifier of the profile. It should use letters, numbers and underscores only."],
  profileName: ["Anzeigename des Labels im Editor und bei der Profilauswahl.", "Display name of the label in the editor and profile selection."],
  profileRole: ["Legt fest, ob dieses Profil das Produktlabel oder ein VDA-/TA-Label beschreibt.", "Defines whether this profile describes the product label or a VDA/TA label."],
  profileActive: ["Nur aktive Profile werden vom Scanner automatisch verwendet.", "Only active profiles are used automatically by the scanner."],
  recognitionSource: ["Text/ Layout wertet erkannte Inhalte und deren Position aus. QR liest einen QR-Code nach den hinterlegten Regeln.", "Text / layout evaluates recognized content and its position. QR reads a QR code using the configured rules."],
  anchorAliases: ["Texte, die denselben Anker kennzeichnen dürfen. Ein Alias pro Zeile.", "Texts that may identify the same anchor. One alias per line."],
  localizeAlias: ["Wenn die Texterkennung eine längere Zeile erkennt, wird nur der Teilbereich des Alias als Anker benutzt. Hilfreich bei 'Prüflos 12345'.", "If text recognition detects a longer line, only the alias portion is used as the anchor. Useful for 'Inspection Lot 12345'."],
  scaleLayout: ["Bestimmt, ob Größenänderungen des Labels anhand der Ankerbreite oder Ankerhöhe berechnet werden.", "Defines whether label scale changes are calculated from anchor width or anchor height."],
  alignment: ["Bestimmt, ob das Layout an der Ankermitte oder an der linken Ankerkante ausgerichtet wird.", "Defines whether the layout is aligned to the anchor center or its left edge."],
  evidenceAliases: ["Zusätzliche Texte, die helfen, dieses Profil eindeutig zu erkennen. Ein Merkmal pro Zeile.", "Additional texts that help identify this profile. One feature per line."],
  minEvidence: ["Wie viele der zusätzlichen Erkennungsmerkmale mindestens gefunden werden müssen. 0 deaktiviert diese Zusatzbedingung.", "How many additional recognition features must be found. 0 disables this extra condition."],
  excludeAliases: ["Wenn einer dieser Texte erkannt wird, wird dieses Profil ausgeschlossen.", "If any of these texts is recognized, this profile is excluded."],
  detectionMinScore: ["Mindestähnlichkeit zwischen erkanntem Ankertext und Anker-Alias, damit das Profil überhaupt ausgewählt werden darf.", "Minimum similarity between recognized anchor text and anchor alias before the profile may be selected."],
  validationMinAnchor: ["Mindest-Ankerquote, damit ein bereits gewähltes Textprofil als gültiges Label akzeptiert wird.", "Minimum anchor score for an already selected text profile to be accepted as a valid label."],
  validFields: ["Diese Felder müssen nach der Erkennung gültig vorhanden sein, damit das Foto als gültiges Label gilt.", "These fields must be present and valid after recognition for the photo to count as a valid label."],
  errorMessage: ["Text, der dem Bediener angezeigt wird, wenn die Labelvalidierung fehlschlägt.", "Message shown to the operator when label validation fails."],
  qrRegions: ["Bereiche, in denen nach einem QR-Code gesucht wird. Ein kleiner Bereich ist schneller und reduziert Fehlinterpretationen.", "Areas in which a QR code is searched. A smaller region is faster and reduces false matches."],
  finalRegex: ["Prüft den bereits bereinigten Endwert. Nur Werte, die diesem Muster entsprechen, gelten als gültig.", "Validates the cleaned final value. Only values matching this pattern are valid."],
  sourceRegex: ["Filtert den erkannten Rohtext, bevor Bereinigung und weitere Strategien angewendet werden.", "Filters recognized raw text before cleanup and other strategies are applied."],
  cleanup: ["Wandelt den gefundenen Text in den endgültigen Feldwert um. Die verfügbaren Optionen hängen vom Feldtyp ab.", "Converts recognized text into the final field value. Available options depend on the field type."],
  lastDigitsCount: ["Anzahl der Ziffern, die bei 'Letzte Ziffern übernehmen' vom Ende des erkannten Textes genommen werden.", "Number of digits taken from the end when 'Keep trailing digits' is selected."],
  searchRadius: ["Wie weit um die erwartete Feldzone herum nach einem passenden erkannten Kandidaten gesucht werden darf. Standard ist 1,8.", "How far around the expected field zone matching recognized candidates may be searched. Default is 1.8."],
  minOverlap: ["Mindestanteil, mit dem ein erkannter Bereich die erwartete Feldzone überlappen muss. 0 erlaubt auch nahe Kandidaten ohne Überlappung.", "Minimum fraction by which a recognized area must overlap the expected field zone. 0 also allows nearby candidates without overlap."],
  preferRightmost: ["Gibt bei mehreren gültigen Kandidaten weiter rechts liegenden Werten einen Bewertungsbonus. Es ist keine harte Sperre.", "Gives a scoring bonus to farther-right valid candidates. It is not a hard restriction."],
  preferUnit: ["Gibt Kandidaten mit einer Gewicht-/Mengeneinheit wie KG, KGM oder LTR einen Bewertungsbonus.", "Gives candidates containing a weight/quantity unit such as KG, KGM or LTR a scoring bonus."],
  useNeighbor: ["Nutzt die Position eines bereits erkannten anderen Feldes als zusätzliche Orientierung für dieses Feld.", "Uses the position of another recognized field as an additional reference for this field."],
  neighborTarget: ["Das bereits erkannte Feld, relativ zu dem der aktuelle Wert gesucht werden soll.", "The already recognized field relative to which the current value should be searched."],
  neighborDirections: ["Markiere, wo der aktuelle Wert relativ zum Bezugsfeld liegen darf. Mehrere Richtungen können erlaubt werden.", "Select where the current value may lie relative to the reference field. Multiple directions can be allowed."],
  neighborMaxDistance: ["Maximaler Abstand zwischen aktuellem Wert und Bezugsfeld, relativ zur Größe des Bezugsfeldes.", "Maximum distance between current value and reference field, relative to the size of the reference field."],
  strategy: ["Aktiviert eine spezielle Suchlogik. Nur Strategien, die zum aktuellen Feldtyp passen, werden angeboten.", "Enables special search logic. Only strategies appropriate for the current field type are offered."],
  strategyUnits: ["Einheiten, die eine spezielle Gewichtsstrategie beim Zusammensetzen oder Bewerten von erkannten Kandidaten bevorzugt, z. B. KGM, LTR.", "Units a special weight strategy should prefer when combining or scoring recognized candidates, e.g. KGM, LTR."],
  fallbackStrategy: ["Optionaler Plan B, falls die normale/Locator-Suche keinen Wert findet.", "Optional fallback if normal/locator search finds no value."],
  pairLeftMin: ["Bei einer Kombizeile muss der linke Rest mindestens so viele Ziffern besitzen. Die Trennstelle wird nicht hier, sondern durch den rechten Tail festgelegt.", "For a combined line, the remaining left part must contain at least this many digits. The split point is defined by the right tail, not here."],
  pairLeftMax: ["Bei einer Kombizeile darf der linke Rest höchstens so viele Ziffern besitzen.", "For a combined line, the remaining left part may contain at most this many digits."],
  tailDigits: ["Anzahl der Ziffern, die bei einer durchgehenden Kombizeile vom Ende als rechter Wert abgetrennt werden.", "Number of digits taken from the end of a continuous combined line as the right-hand value."],
  combinedMin: ["Mindestgesamtlänge, ab der eine Ziffernfolge überhaupt als Kombizeile interpretiert wird.", "Minimum total length before a digit sequence is considered a combined line."],
  locatorAliases: ["Gedruckte Feldbeschriftungen, relativ zu denen der Wert gesucht werden soll, z. B. 'Quantity'. Ein Alias pro Zeile. Leer deaktiviert den Locator.", "Printed field captions relative to which the value is searched, e.g. 'Quantity'. One alias per line. Empty disables the locator."],
  locatorDirection: ["Legt fest, wo der Wert relativ zur gedruckten Feldbeschriftung liegen darf.", "Defines where the value may lie relative to the printed field caption."],
  locatorMaxDistance: ["Wie weit der Wert von der gefundenen Feldbeschriftung entfernt sein darf.", "How far the value may be from the detected field caption."],
  minAliasScore: ["Mindestähnlichkeit zwischen erkanntem Text und einem Locator-Alias.", "Minimum similarity between recognized text and a locator alias."],
  locatorStrict: ["Wenn aktiv, wird ohne passenden Locator-Treffer kein Wert aus der normalen Feldzone als Ersatz akzeptiert.", "When enabled, no value from the normal field zone is accepted as a substitute if no locator match exists."],
  locatorPreferRight: ["Bevorzugt bei mehreren Locator-Kandidaten den weiter rechts liegenden Wert.", "Prefers the farther-right value among multiple locator candidates."],
  locatorPreferLeft: ["Bevorzugt bei mehreren Locator-Kandidaten den weiter links liegenden Wert.", "Prefers the farther-left value among multiple locator candidates."],
  locatorPreferUnit: ["Bevorzugt beim Locator Werte, die eine Einheit wie KG, KGM oder LTR enthalten.", "Prefers locator values containing a unit such as KG, KGM or LTR."],
  locatorPreferBatch: ["Bevorzugt beim Locator Kandidaten, die dem typischen Batchformat D + 8–10 Ziffern ähneln.", "Prefers locator candidates resembling the usual batch format D + 8–10 digits."],
  requiredField: ["Metadatenkennzeichen für das Feld. Für die eigentliche Gültigkeit des Labels ist zusätzlich die Labelvalidierung links maßgeblich.", "Metadata flag for the field. Actual label validity is additionally controlled by Label validation on the left."],
  compareField: ["Kennzeichnet, dass dieses Feld grundsätzlich zwischen Produkt- und VDA-/TA-Seite gegenübergestellt werden kann. Die Freigabeentscheidung folgt weiterhin den globalen Vergleichsregeln.", "Marks this field as generally comparable between product and VDA/TA sides. Release still follows the global comparison rules."],
  qrReadField: ["Aktiviert die QR-Parserregel für dieses Feld.", "Enables the QR parser rule for this field."],
  qrRequired: ["Der QR-Code gilt nur dann als passendes Profil, wenn dieses Feld erfolgreich ausgelesen wurde.", "The QR code matches this profile only if this field was parsed successfully."],
  primaryRegex: ["Regulärer Ausdruck, der den primären Wert aus dem QR-Rohtext extrahiert.", "Regular expression extracting the primary value from the QR raw text."],
  captureGroup: ["Nummer der RegEx-Capture-Gruppe, die übernommen wird. 0 bedeutet der komplette Treffer.", "Number of the regex capture group to use. 0 means the full match."],
  template: ["Setzt Primär- und optionalen Sekundärwert zusammen, z. B. {primary}/{secondary}.", "Combines primary and optional secondary values, e.g. {primary}/{secondary}."],
  secondaryRegex: ["Optionaler zweiter regulärer Ausdruck für einen weiteren Bestandteil des Feldes.", "Optional second regular expression for another part of the field."],
  secondaryGroup: ["Capture-Gruppe des sekundären RegEx.", "Capture group of the secondary regex."],
  secondaryDefault: ["Wert, der verwendet wird, wenn der sekundäre RegEx nichts liefert.", "Value used when the secondary regex returns nothing."],
  replacements: ["Ersetzt feste Textbestandteile nach der QR-Auswertung. Format: ALT => NEU.", "Replaces fixed text parts after QR parsing. Format: OLD => NEW."]
};

export function getEditorLanguage() {
  try {
    return globalThis.localStorage?.getItem(LANGUAGE_KEY) === "en" ? "en" : "de";
  } catch {
    return "de";
  }
}

export function setEditorLanguage(language) {
  const normalized = language === "en" ? "en" : "de";
  try { globalThis.localStorage?.setItem(LANGUAGE_KEY, normalized); } catch {}
  return normalized;
}

export function text(key, language = getEditorLanguage()) {
  const pair = TEXT[key];
  if (!pair) return key;
  return pair[language === "en" ? 1 : 0];
}

export function help(key, language = getEditorLanguage()) {
  const pair = HELP[key];
  if (!pair) return "";
  return pair[language === "en" ? 1 : 0];
}

export function localText(de, en, language = getEditorLanguage()) {
  return language === "en" ? en : de;
}

export function applyEditorTranslations(root = document, language = getEditorLanguage()) {
  root.documentElement.lang = language === "en" ? "en" : "de";
  root.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = text(node.dataset.i18n, language);
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.setAttribute("placeholder", text(node.dataset.i18nPlaceholder, language));
  });
  root.querySelectorAll("[data-help-key]").forEach((node) => {
    let icon = node.querySelector(":scope > .field-title > .help-icon, :scope > .help-icon");
    let title = node.querySelector(":scope > .field-title");
    if (!title && node.matches("label")) {
      const firstTextNode = Array.from(node.childNodes).find((child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim());
      if (firstTextNode) {
        title = document.createElement("span");
        title.className = "field-title";
        title.textContent = firstTextNode.textContent.trim();
        node.replaceChild(title, firstTextNode);
      }
    }
    if (!title && node.matches("label")) {
      const candidate = node.querySelector(":scope > [data-i18n]");
      if (candidate) {
        title = document.createElement("span");
        title.className = "field-title";
        candidate.replaceWith(title);
        title.append(candidate);
      }
    }
    if (!icon) {
      icon = document.createElement("span");
      icon.className = "help-icon";
      icon.tabIndex = 0;
      icon.textContent = "?";
      if (title) title.append(icon);
      else node.append(icon);
    }
    const tooltip = help(node.dataset.helpKey, language);
    icon.dataset.tooltip = tooltip;
    icon.setAttribute("aria-label", tooltip);
  });
}
