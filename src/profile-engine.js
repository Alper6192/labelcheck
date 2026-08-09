import { boundsFromPoly, normalizePoly } from "./utils.js";
import { normalizeProfileConfig } from "./profile-schema.js";

export async function loadProfileConfig() {
  const response = await fetch(new URL(`./config/label-profiles.json?t=${Date.now()}`, window.location.href), { cache: "no-store" });
  if (!response.ok) throw new Error(`Profile konnten nicht geladen werden (${response.status}).`);
  return normalizeProfileConfig(await response.json());
}

export async function loadProfiles() {
  const config = await loadProfileConfig();
  return config.profiles.filter((profile) => profile.active !== false);
}

export function autoSelectProfile(items, profiles, role) {
  const eligible = profiles.filter((profile) => profile.role === role && profile.source?.type !== "qr");
  let best = null;
  for (const profile of eligible) {
    const detection = evaluateProfileDetection(items, profile);
    if (!detection.allowed) continue;

    const anchorMatch = findProfileAnchor(items, profile);
    const score = anchorMatch ? anchorMatch.matchScore : 0;
    const minScore = Math.max(0.55, Number(profile.detection?.minScore || 0));
    if (score < minScore) continue;
    if (!best || score > best.score) best = { profile, anchorMatch, score, detection };
  }
  if (role === "product" && eligible.length === 1 && !best) {
    return { profile: eligible[0], anchorMatch: null, score: 0, manual: true };
  }
  return best;
}

export function extractProfileFields(items, profile, imageSize) {
  if (!profile) return emptyExtraction();

  const excluded = findExcludedAlias(items, profile.detection?.excludeAliases || []);
  if (excluded) {
    return { ...emptyExtraction(), profile, warning: `Profil ausgeschlossen: „${excluded.alias}“ wurde erkannt.` };
  }

  const anchorMatch = findProfileAnchor(items, profile);
  const minAnchorScore = 0.55;
  if (!anchorMatch || anchorMatch.matchScore < minAnchorScore) {
    return { ...emptyExtraction(), profile, warning: "Profilanker wurde nicht sicher erkannt." };
  }

  const transform = buildTransform(anchorMatch.referencePoly, anchorMatch.item.poly, imageSize, anchorMatch.scaleFrom, anchorMatch.alignFrom);
  const fields = {};
  const candidates = {};
  const expectedPolys = {};
  const overlays = [{ key: "anchor", label: "ANKER", poly: normalizePoly(anchorMatch.item.poly), item: anchorMatch.item }];

  for (const field of profile.fields || []) {
    const expected = transformPoly(field.poly, transform, imageSize);
    expectedPolys[field.key] = expected;
    const candidate = chooseCandidate(items, expected, field, profile);
    if (candidate) candidates[field.key] = candidate;
  }

  for (const field of profile.fields || []) {
    const expected = expectedPolys[field.key];
    let candidate = candidates[field.key] || null;
    let source = candidate ? (candidate.source || "ocr") : "missing";

    if (field.key === "drum_number") {
      const derived = deriveDrumCandidate(items, candidates.batch, field, expected);
      if (!candidate || (derived && derived.selectionScore > Number(candidate.selectionScore || 0))) {
        candidate = derived || candidate;
        source = derived ? derived.source || "ocr-neighbor" : source;
      }
    }

    const raw = candidate?.text || "";
    const value = normalizeFieldValue(field.key, raw, field);
    const valid = Boolean(value && validateField(value, field.regex));
    fields[field.key] = {
      key: field.key,
      label: field.label || field.key,
      value,
      raw,
      confidence: Number(candidate?.score || 0),
      valid,
      required: Boolean(field.required),
      compare: Boolean(field.compare),
      source,
      poly: candidate?.poly || expected
    };
    overlays.push({ key: field.key, label: field.label || field.key, poly: candidate?.poly || expected, item: candidate || null });
  }

  return { profile, anchorMatch, transform, fields, overlays, warning: "" };
}

export function extractQrProfileFields(profile, qrMatch) {
  if (!profile || !qrMatch?.parsed) return emptyExtraction();
  const fields = {};
  for (const field of profile.fields || []) {
    const raw = String(qrMatch.parsed.fields?.[field.key] || "");
    const value = normalizeFieldValue(field.key, raw, field);
    fields[field.key] = {
      key: field.key,
      label: field.label || field.key,
      value,
      raw,
      confidence: raw ? 1 : 0,
      valid: Boolean(value && validateField(value, field.regex)),
      required: Boolean(field.required),
      compare: Boolean(field.compare),
      source: raw ? "qr" : "missing",
      poly: qrMatch.poly || []
    };
  }
  return {
    profile,
    anchorMatch: null,
    transform: null,
    fields,
    overlays: qrMatch.poly?.length
      ? [{ key: "anchor", label: "QR", poly: qrMatch.poly, item: null }]
      : [],
    warning: "",
    qr: { parser: qrMatch.parsed.parser, raw: qrMatch.raw }
  };
}

export function applyManualValue(extraction, key, value) {
  const field = extraction?.fields?.[key];
  if (!field) return;
  const configField = extraction.profile?.fields?.find((entry) => entry.key === key) || {};
  field.value = normalizeFieldValue(key, value, configField);
  field.raw = value;
  field.source = "manual";
  field.valid = Boolean(field.value && validateField(field.value, configField.regex));
}

export function normalizeFieldValue(key, value, field = {}) {
  const text = String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  const normalizer = field.normalizer || defaultNormalizer(key);

  if (normalizer === "batch") {
    const compact = text.replace(/\s+/g, "");
    const direct = compact.match(/D\d{8,10}/i);
    if (direct) return direct[0].toUpperCase();
    return compact.split(/[\/|I:;]/)[0].replace(/[^A-Z0-9-]/g, "");
  }
  if (normalizer === "last_digits") {
    const digits = text.replace(/\D/g, "");
    const count = Math.max(1, Number(field.digits || 4));
    return digits.length >= count ? digits.slice(-count) : digits;
  }
  if (normalizer === "leading_delivery_digits") {
    const groups = text.match(/\d+/g) || [];
    if (groups.length >= 2) return groups[0];
    const digits = text.replace(/\D/g, "");
    const tailDigits = Math.max(1, Number(field.tailDigits || 7));
    const combinedMinDigits = Math.max(tailDigits + 7, Number(field.combinedMinDigits || 14));
    return digits.length >= combinedMinDigits ? digits.slice(0, -tailDigits) : digits;
  }
  if (normalizer === "digits") return text.replace(/\D/g, "");
  if (normalizer === "weight") {
    return text
      .replace(/,/g, ".")
      .replace(/\bKGM\b/g, "KG")
      .replace(/\bK\b/g, "KG")
      .replace(/\s+/g, " ");
  }
  if (normalizer === "net_weight") {
    // Scania kann die Einheit gelegentlich nur als "K" statt "KG" erkennen.
    // Für die weitere Verarbeitung behandeln wir K und KGM eindeutig als KG.
    const normalized = text
      .replace(/,/g, ".")
      .replace(/\bKGM\b/g, "KG")
      .replace(/\bK\b/g, "KG")
      .replace(/\s+/g, " ");
    const values = Array.from(normalized.matchAll(/(\d+(?:\.\d+)?)(?:\s*(KG|G|L|LTR))?/g));
    if (!values.length) return normalized;
    const match = values[values.length - 1];
    const unit = match[2] === "LTR" ? "L" : (match[2] || (normalized.includes("KG") ? "KG" : ""));
    return `${match[1]}${unit ? ` ${unit}` : ""}`;
  }
  return text;
}

export function normalizedWeight(value) {
  const prepared = String(value || "")
    .toUpperCase()
    .replace(/,/g, ".")
    .replace(/\bKGM\b/g, "KG")
    .replace(/\bK\b/g, "KG");
  const match = prepared.match(/(\d+(?:\.\d+)?)\s*(KG|G|L|LTR)?/);
  if (!match) return null;
  const number = Number(match[1]);
  let unit = match[2] || "KG";
  if (unit === "LTR") unit = "L";
  if (unit === "KGM") unit = "KG";
  if (!Number.isFinite(number)) return null;
  return { number, unit, base: unit === "KG" ? number * 1000 : number };
}

export function validateField(value, regex) {
  if (!regex) return Boolean(String(value || "").trim());
  try { return new RegExp(regex, "i").test(String(value || "").trim()); }
  catch { return false; }
}

function emptyExtraction() {
  return { profile: null, anchorMatch: null, transform: null, fields: {}, overlays: [], warning: "" };
}

function findProfileAnchor(items, profile) {
  const anchors = [profile?.anchor, ...(profile?.anchor?.fallbacks || [])].filter((anchor) =>
    Array.isArray(anchor?.aliases) && anchor.aliases.length && Array.isArray(anchor?.poly) && anchor.poly.length >= 4
  );
  let best = null;
  for (let index = 0; index < anchors.length; index += 1) {
    const anchor = anchors[index];
    const match = findAnchor(items, anchor.aliases, { localizeAlias: anchor.localizeAlias === true });
    if (!match) continue;
    const candidate = {
      ...match,
      referencePoly: anchor.poly,
      scaleFrom: anchor.scaleFrom === "height" ? "height" : "width",
      alignFrom: anchor.alignFrom === "left" ? "left" : "center",
      fallback: index > 0,
      anchorIndex: index
    };
    if (!best || candidate.matchScore > best.matchScore) best = candidate;
  }
  return best;
}

function findAnchor(items, aliases, options = {}) {
  let best = null;
  for (const item of items || []) {
    const text = normalizeText(item.text);
    for (const alias of aliases) {
      const target = normalizeText(alias);
      if (!target) continue;
      const similarity = anchorSimilarity(text, target);
      const score = similarity * 0.8 + Number(item.score || 0) * 0.2;
      let matchedItem = item;
      if (options.localizeAlias && similarity >= 0.9) {
        const range = findAliasRange(item.text, alias);
        if (range) {
          matchedItem = {
            ...item,
            text: String(item.text || "").slice(range.start, range.end).trim() || String(alias),
            poly: approximateTextFragmentPoly(item.poly, String(item.text || "").length, range.start, range.end),
            sourceText: String(item.text || "")
          };
        }
      }
      if (!best || score > best.matchScore) best = { item: matchedItem, alias, matchScore: score };
    }
  }
  return best;
}

function evaluateProfileDetection(items, profile) {
  const detection = profile?.detection;
  if (!detection) return { allowed: true, evidenceMatches: 0, excluded: null };

  const excluded = findExcludedAlias(items, detection.excludeAliases || []);
  if (excluded) return { allowed: false, evidenceMatches: 0, excluded };

  const aliases = detection.evidenceAliases || [];
  const evidenceMatches = aliases.filter((alias) => hasAliasEvidence(items, alias)).length;
  const minEvidenceMatches = Math.max(0, Number(detection.minEvidenceMatches || 0));
  return {
    allowed: evidenceMatches >= minEvidenceMatches,
    evidenceMatches,
    excluded: null
  };
}

function findExcludedAlias(items, aliases) {
  for (const alias of aliases || []) {
    if (hasAliasEvidence(items, alias)) return { alias };
  }
  return null;
}

function hasAliasEvidence(items, alias) {
  const target = normalizeText(alias);
  if (!target) return false;
  return (items || []).some((item) => anchorSimilarity(normalizeText(item?.text), target) >= 0.75);
}

function anchorSimilarity(text, target) {
  if (!text || !target) return 0;
  if (text === target) return 1;

  // Ein vollständiger Alias innerhalb einer längeren OCR-Zeile ist ein starker
  // Treffer: Alias BMW darf z. B. "BMW (UK) Manufacturing Ltd" erkennen.
  if (target.length >= 3 && text.includes(target)) return 0.95;

  // Umgekehrt darf ein verkürzter OCR-Text nicht den längeren Alias ersetzen.
  // "Materialnummer" reicht deshalb nicht für "Alte Materialnummer".
  if (target.includes(text)) {
    const coverage = text.length / Math.max(1, target.length);
    return dice(text, target) * coverage * 0.25;
  }

  return dice(text, target);
}

function buildTransform(referenceAnchorPoly, liveAnchorPoly, imageSize, scaleFrom = "width", alignFrom = "center") {
  const ref = polyGeometry(scaleNormalizedPoly(referenceAnchorPoly, imageSize));
  const live = polyGeometry(liveAnchorPoly);
  // Einige Profile besitzen bewusst verschieden lange Textvarianten desselben
  // Ankers (z. B. "Volkswagen Sachsen GmbH" vs. "Volkswagen AG"). In diesem
  // Fall darf die Textbreite weder den Maßstab noch die horizontale Verschiebung
  // des gesamten Labels bestimmen. Mit scaleFrom=height + alignFrom=left wird
  // deshalb an Buchstabenhöhe und linker Textkante ausgerichtet.
  const scale = scaleFrom === "height"
    ? live.height / Math.max(ref.height, 1)
    : live.width / Math.max(ref.width, 1);
  const refOrigin = alignFrom === "left" ? ref.leftCenter : ref.center;
  const liveOrigin = alignFrom === "left" ? live.leftCenter : live.center;
  return { refCenter: refOrigin, liveCenter: liveOrigin, scale, rotation: live.angle - ref.angle, scaleFrom, alignFrom };
}

function transformPoly(normalized, transform, imageSize) {
  const source = scaleNormalizedPoly(normalized, imageSize);
  const cos = Math.cos(transform.rotation), sin = Math.sin(transform.rotation);
  return source.map(([x, y]) => {
    const dx = (x - transform.refCenter[0]) * transform.scale;
    const dy = (y - transform.refCenter[1]) * transform.scale;
    return [transform.liveCenter[0] + dx * cos - dy * sin, transform.liveCenter[1] + dx * sin + dy * cos];
  });
}

function chooseCandidate(items, expectedPoly, field, profile = null) {
  // Henkel-Produktlabel: Eine reine Zahl darf nie als Gewicht gelten.
  // Besonders die 4-stellige Fassnummer (z. B. 0007) liegt nahe am Batch
  // und konnte bisher wegen der optionalen Einheit als Gewicht gewinnen.
  // Für Produktgewicht ist deshalb eine echte Einheit zwingend; getrennte
  // OCR-Boxen wie "25" + "KG" werden gezielt zusammengesetzt.
  if (String(profile?.id || "").toUpperCase() === "HENKEL" && field?.key === "weight") {
    return chooseHenkelProductWeightCandidate(items, expectedPoly, field);
  }

  // Scania ist ein fester Profil-Sonderfall. Er darf NICHT von einem optionalen
  // Config-Schlüssel abhängen, weil eine im Editor neu exportierte Konfiguration
  // solche Engine-Hinweise verändern oder entfernen kann. Sobald Profil + Feld
  // eindeutig SCANIA/weight sind, wird die robuste Netto-Auswahl verwendet.
  if (String(profile?.id || "").toUpperCase() === "SCANIA" && field?.key === "weight") {
    const net = chooseScaniaNetWeightCandidate(items, expectedPoly, field);
    if (net) return net;
    return null;
  }

  // Scania: Gross und Net werden von PaddleOCR je nach Foto als eine gemeinsame
  // Box oder in mehrere Boxen zerlegt (z. B. "1550", "1300", "KG").
  // Deshalb wird das Nettogewicht hier gezielt aus der rechten Zahl mit K/KG
  // zusammengesetzt. Eine einheitenlose Bruttozahl kann nie gewinnen.
  if (field?.strategy === "scania_net_weight") {
    const net = chooseScaniaNetWeightCandidate(items, expectedPoly, field);
    if (net) return net;
  }

  // VW: Die große unterste Zeile besteht aus Lieferscheinnummer + IDH. Diese
  // Zahlenzeile ist deutlich zuverlässiger als die sehr kleine Beschriftung
  // "Delivery number / IDH". Deshalb wird sie direkt erkannt und für beide
  // Felder verwendet; die jeweilige Normalisierung trennt links/rechts.
  if (field?.strategy === "vw_delivery_pair") {
    const pair = chooseVwDeliveryPairCandidate(items);
    if (pair) return pair;
  }

  // VW: Das gewünschte Gewicht ist die obere Quantity-Angabe. Auf diesen
  // Labels trägt sie KGM oder LTR, während Gross/Net unten typischerweise KG
  // verwendet. Die Einheit ist damit ein sehr stabiler inhaltlicher Filter.
  if (field?.strategy === "quantity_weight") {
    const quantity = chooseQuantityWeightCandidate(items, expectedPoly, field);
    if (quantity) return quantity;
  }

  // Für Layouts mit stabilen gedruckten Feldbezeichnungen ist die Beziehung
  // "Wert unter/rechts von Beschriftung" robuster als eine große globale
  // Suchzone. Das verhindert insbesondere Verwechslungen zwischen ähnlich
  // formatierten Nummern (Supplier ID, Referenzbeleg, Lieferschein usw.).
  if (field?.locator?.aliases?.length) {
    const located = chooseCandidateByLocator(items, field);
    if (located) return located;
    if (field.fallbackStrategy === "net_pair") {
      const patternCandidate = chooseNetPairCandidate(items);
      if (patternCandidate) return patternCandidate;
    }
    if (field.locator.strict === true) return null;
  }

  const expected = boundsFromPoly(expectedPoly);
  const cx = expected.x + expected.width / 2;
  const cy = expected.y + expected.height / 2;
  const radius = Math.max(expected.width, expected.height) * Number(field.searchRadius || 1.8) + 28;
  const minOverlap = Math.max(0, Math.min(1, Number(field.minOverlap || 0)));
  const sourceRegex = field.sourceRegex || field.regex;
  let best = null;
  for (const item of items || []) {
    for (const fragment of matchingFieldFragments(item, sourceRegex)) {
      const b = boundsFromPoly(fragment.poly);
      const ix = Math.max(0, Math.min(expected.x + expected.width, b.x + b.width) - Math.max(expected.x, b.x));
      const iy = Math.max(0, Math.min(expected.y + expected.height, b.y + b.height) - Math.max(expected.y, b.y));
      const overlap = (ix * iy) / Math.max(1, Math.min(expected.width * expected.height, b.width * b.height));
      const dx = (b.x + b.width / 2) - cx;
      const dy = (b.y + b.height / 2) - cy;
      const distance = Math.hypot(dx, dy);
      if (overlap < minOverlap) continue;
      if (distance > radius && overlap <= 0) continue;
      const proximity = Math.max(0, 1 - distance / radius);
      let score = overlap * 0.55 + proximity * 0.25 + Number(fragment.score || 0) * 0.2;

      // Bei Gross/Net-Zeilen steht der Nettowert rechts. OCR kann die Zeile als
      // einen Text oder als zwei getrennte Texte liefern. Profile können deshalb
      // gezielt den rechten Kandidaten und einen Kandidaten mit Einheit bevorzugen.
      if (field.preferRightmost) {
        const rightness = Math.max(0, Math.min(1, 0.5 + dx / Math.max(1, radius * 2)));
        score += rightness * 0.22;
      }
      if (field.preferUnit && /\b(?:KG|KGM|G|L|LTR)\b/i.test(String(fragment.text || ""))) {
        score += 0.35;
      }

      if (!best || score > best.selectionScore) best = { ...fragment, selectionScore: score };
    }
  }
  return best;
}

function chooseCandidateByLocator(items, field) {
  const locator = field?.locator || {};
  const aliases = Array.isArray(locator.aliases) ? locator.aliases.filter(Boolean) : [];
  if (!aliases.length) return null;

  const minAliasScore = Math.max(0, Math.min(1, Number(locator.minAliasScore || 0.72)));
  const labels = [];
  for (const item of items || []) {
    for (const alias of aliases) {
      const similarity = anchorSimilarity(normalizeText(item?.text), normalizeText(alias));
      if (similarity < minAliasScore) continue;
      const range = findAliasRange(item?.text, alias);
      const localized = range ? {
        ...item,
        text: String(item?.text || "").slice(range.start, range.end).trim() || alias,
        poly: approximateTextFragmentPoly(item?.poly, String(item?.text || "").length, range.start, range.end),
        sourceText: String(item?.text || "")
      } : item;
      labels.push({ item: localized, alias, similarity });
    }
  }
  if (!labels.length) return null;

  const sourceRegex = field.sourceRegex || field.regex;
  const fragments = [];
  for (const item of items || []) {
    for (const fragment of matchingFieldFragments(item, sourceRegex)) fragments.push(fragment);
  }
  if (!fragments.length) return null;

  const direction = String(locator.direction || "below_or_right");
  const maxDistanceFactor = Math.max(1, Number(locator.maxDistance || 7));
  let best = null;

  for (const label of labels) {
    const lb = boundsFromPoly(label.item.poly);
    const lcx = lb.x + lb.width / 2;
    const lcy = lb.y + lb.height / 2;
    const unit = Math.max(12, lb.height || 0);
    const maxDistance = maxDistanceFactor * unit + 24;

    for (const fragment of fragments) {
      const b = boundsFromPoly(fragment.poly);
      const fcx = b.x + b.width / 2;
      const fcy = b.y + b.height / 2;
      const belowGap = b.y - (lb.y + lb.height);
      const rightGap = b.x - (lb.x + lb.width);
      const horizontalGap = b.x > lb.x + lb.width
        ? b.x - (lb.x + lb.width)
        : lb.x > b.x + b.width
          ? lb.x - (b.x + b.width)
          : 0;
      const verticalGap = b.y > lb.y + lb.height
        ? b.y - (lb.y + lb.height)
        : lb.y > b.y + b.height
          ? lb.y - (b.y + b.height)
          : 0;

      let allowed = false;
      let relationDistance = Infinity;
      if (direction === "below") {
        allowed = fcy >= lcy + unit * 0.15 && belowGap <= maxDistance;
        relationDistance = Math.hypot(horizontalGap * 0.75, Math.max(0, belowGap));
      } else if (direction === "right") {
        allowed = fcx >= lcx + unit * 0.15 && rightGap <= maxDistance;
        relationDistance = Math.hypot(Math.max(0, rightGap), verticalGap * 0.75);
      } else {
        const isBelow = fcy >= lcy + unit * 0.15 && belowGap <= maxDistance;
        const isRight = fcx >= lcx + unit * 0.15 && rightGap <= maxDistance;
        allowed = isBelow || isRight;
        const belowDistance = isBelow ? Math.hypot(horizontalGap * 0.75, Math.max(0, belowGap)) : Infinity;
        const rightDistance = isRight ? Math.hypot(Math.max(0, rightGap), verticalGap * 0.75) : Infinity;
        relationDistance = Math.min(belowDistance, rightDistance);
      }
      if (!allowed || relationDistance > maxDistance) continue;

      let score = Math.max(0, 1 - relationDistance / maxDistance) * 0.55
        + Number(fragment.score || 0) * 0.25
        + label.similarity * 0.20;

      if (locator.preferRightmost === true) {
        score += Math.max(0, Math.min(0.55, (fcx - lcx) / Math.max(1, maxDistance) * 0.55));
      }
      if (locator.preferLeftmost === true) {
        score += Math.max(0, Math.min(0.55, (lcx - fcx) / Math.max(1, maxDistance) * 0.55 + 0.28));
      }
      if (locator.preferUnit === true && /\b(?:KG|KGM|G|L|LTR)\b/i.test(String(fragment.text || ""))) {
        score += 0.35;
      }
      if (locator.preferBatch === true && /^D\d{8,10}/i.test(String(fragment.text || ""))) {
        score += 0.35;
      }

      if (!best || score > best.selectionScore) {
        best = { ...fragment, selectionScore: score, source: "ocr-locator", locatorAlias: label.alias };
      }
    }
  }
  return best;
}


function chooseVwDeliveryPairCandidate(items) {
  let best = null;

  const consider = (left, right, poly, score, sourceText = "") => {
    const delivery = String(left || "").replace(/\D/g, "");
    const idh = String(right || "").replace(/\D/g, "");
    if (!/^\d{7,10}$/.test(delivery) || !/^\d{7}$/.test(idh)) return;
    const bounds = boundsFromPoly(poly);
    // Die untere VW-Zeile ist groß gedruckt. Die Texthöhe hilft, sie von
    // kleineren Nummernzeilen im oberen Labelbereich zu unterscheiden.
    const sizeBonus = Math.min(0.8, Math.max(0, bounds.height) / 45);
    const candidate = {
      text: `${delivery} ${idh}`,
      poly: normalizePoly(poly),
      score: Number(score || 0),
      selectionScore: Number(score || 0) + sizeBonus,
      source: "ocr-vw-pair",
      sourceText: String(sourceText || `${delivery} ${idh}`)
    };
    if (!best || candidate.selectionScore > best.selectionScore) best = candidate;
  };

  // Häufig liefert PaddleOCR die komplette große Zeile als ein Element.
  for (const item of items || []) {
    const original = String(item?.text || "").trim();
    if (!original) continue;
    const cleaned = original
      .replace(/DELIVERY\s*NUMBER\s*\/?\s*IDH/ig, " ")
      .replace(/[^0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) continue;

    const groups = cleaned.match(/\d+/g) || [];
    if (groups.length === 2) {
      consider(groups[0], groups[1], item.poly, item.score, original);
      continue;
    }
    if (groups.length === 1 && /^\d{14,17}$/.test(groups[0])) {
      const digits = groups[0];
      consider(digits.slice(0, -7), digits.slice(-7), item.poly, item.score, original);
    }
  }

  // Je nach Foto kann PaddleOCR die beiden großen Nummern getrennt erkennen.
  const numeric = [];
  for (const item of items || []) {
    const raw = String(item?.text || "").trim();
    const compact = raw.replace(/\s+/g, "");
    if (!/^\d{7,10}$/.test(compact)) continue;
    const b = boundsFromPoly(item.poly);
    numeric.push({ item, digits: compact, bounds: b, cx: b.x + b.width / 2, cy: b.y + b.height / 2 });
  }

  for (const left of numeric) {
    for (const right of numeric) {
      if (left === right || !/^\d{7}$/.test(right.digits)) continue;
      if (right.cx <= left.cx) continue;
      const h = Math.max(8, left.bounds.height, right.bounds.height);
      if (Math.abs(left.cy - right.cy) > h * 0.8 + 5) continue;
      const gap = right.bounds.x - (left.bounds.x + left.bounds.width);
      if (gap > h * 8 + 40) continue;
      if (gap < -h * 0.8) continue;

      const x1 = Math.min(left.bounds.x, right.bounds.x);
      const y1 = Math.min(left.bounds.y, right.bounds.y);
      const x2 = Math.max(left.bounds.x + left.bounds.width, right.bounds.x + right.bounds.width);
      const y2 = Math.max(left.bounds.y + left.bounds.height, right.bounds.y + right.bounds.height);
      const poly = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
      consider(
        left.digits,
        right.digits,
        poly,
        (Number(left.item.score || 0) + Number(right.item.score || 0)) / 2,
        `${left.item.text} ${right.item.text}`
      );
    }
  }

  return best;
}

function chooseScaniaNetWeightCandidate(items, expectedPoly, field) {
  const expected = boundsFromPoly(expectedPoly);
  const cx = expected.x + expected.width / 2;
  const cy = expected.y + expected.height / 2;
  const scale = Math.max(20, expected.height || 0, expected.width * 0.22 || 0);
  let best = null;

  const normalizeUnit = (unit) => {
    const value = String(unit || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    // Typische PaddleOCR-Verwechslungen bei kleinem "KG" auf Scania-Labels.
    if (["K", "KG", "K6", "KC", "KO", "K0", "KQ", "K9"].includes(value)) return "KG";
    return "";
  };

  const nearExpectedRow = (poly, factor = 6.5) => {
    const b = boundsFromPoly(poly);
    const bx = b.x + b.width / 2;
    const by = b.y + b.height / 2;
    // Die im Editor gespeicherte Box kann oberhalb der realen Wertzeile liegen.
    // Deshalb nur grob auf die rechte Labelhälfte / Gewichtszeile begrenzen.
    const dx = Math.abs(bx - cx);
    const dy = Math.abs(by - cy);
    return dx <= scale * factor + expected.width && dy <= scale * factor + 70;
  };

  const consider = (number, poly, score = 0, sourceText = "", pairGap = null, inferred = false) => {
    const numeric = String(number || "").trim().replace(/,/g, ".");
    if (!/^\d{3,5}(?:\.\d+)?$/.test(numeric)) return;
    if (!nearExpectedRow(poly)) return;

    const b = boundsFromPoly(poly);
    const bx = b.x + b.width / 2;
    const by = b.y + b.height / 2;
    const dx = bx - cx;
    const dy = by - cy;
    const distance = Math.hypot(dx, dy);
    const proximity = 1 / (1 + distance / Math.max(1, scale * 2.5));
    const rightness = Math.max(0, Math.min(1, 0.5 + dx / Math.max(1, scale * 6)));
    const gapBonus = pairGap == null ? 0.12 : 0.32 / (1 + Math.max(0, pairGap) / Math.max(1, scale));
    const inferredBonus = inferred ? 0.24 : 0.34;
    const selectionScore = proximity * 0.24 + Number(score || 0) * 0.20 + rightness * 0.20 + gapBonus + inferredBonus;

    const candidate = {
      text: `${numeric} KG`,
      poly,
      score: Number(score || 0),
      selectionScore,
      source: inferred ? "ocr-scania-pair" : "ocr-scania-net",
      sourceText: String(sourceText || `${numeric} KG`)
    };
    if (!best || candidate.selectionScore > best.selectionScore) best = candidate;
  };

  // 1) Gross/Net bereits in EINER OCR-Box. Für Scania reicht die Struktur
  // "Zahl / Zahl" (oder auch nur zwei Zahlen in derselben kurzen Zeile) aus;
  // die Einheit darf von OCR fehlerhaft oder gar nicht erkannt worden sein.
  // Beispiel: "1550 / 1300 KG", "1550 / 1300 K6", "1550 1300" -> 1300 KG.
  for (const item of items || []) {
    const raw = String(item?.text || "").trim();
    if (!raw) continue;
    const groups = Array.from(raw.matchAll(/\d{3,5}(?:[.,]\d+)?/g));
    if (groups.length < 2) continue;

    // Nur die letzten beiden plausiblen kurzen Werte betrachten. Damit fallen
    // Batch-, IDH- und Barcode-Zeilen mit langen Nummern automatisch heraus.
    const left = groups[groups.length - 2];
    const right = groups[groups.length - 1];
    const between = raw.slice(Number(left.index || 0) + String(left[0]).length, Number(right.index || 0));
    const tail = raw.slice(Number(right.index || 0) + String(right[0]).length);
    const hasSeparator = /[\/|I\\]/i.test(between);
    const unitLike = tail.match(/\b(KG|K6|KC|KO|K0|KQ|K9|K)\b/i);

    // Ohne Separator/Einheit nur akzeptieren, wenn es eine kurze OCR-Zeile ist
    // und sie räumlich in der Scania-Gewichtsregion liegt.
    if (!hasSeparator && !unitLike && raw.length > 24) continue;
    if (!nearExpectedRow(item.poly, 7.5)) continue;

    const start = Number(right.index || 0);
    const end = start + String(right[0]).length + (unitLike ? String(unitLike[0]).length + 1 : 0);
    const poly = approximateTextFragmentPoly(item.poly, raw.length, start, Math.min(raw.length, end));
    consider(right[0], poly, item.score, raw, 0, !normalizeUnit(unitLike?.[1]));
  }

  // 2) Nettowert und Einheit in derselben OCR-Box, z. B. "1300 KG" oder
  // OCR-Verwechslungen wie "1300 K6" / "1300 KC".
  for (const item of items || []) {
    const raw = String(item?.text || "");
    const pattern = /(\d{3,5}(?:[.,]\d+)?)\s*(KG|K6|KC|KO|K0|KQ|K9|K)(?=$|[^A-Z0-9])/ig;
    for (const match of raw.matchAll(pattern)) {
      const start = Number(match.index || 0);
      const end = start + String(match[0] || "").length;
      const poly = approximateTextFragmentPoly(item.poly, raw.length, start, end);
      consider(match[1], poly, item.score, raw, 0, false);
    }
  }

  // 3) PaddleOCR zerlegt die Gross/Net-Zeile in mehrere Boxen. Zuerst werden
  // reine 3–5-stellige Zahlen gesammelt. Wenn zwei davon horizontal auf einer
  // Zeile stehen, ist bei Scania die rechte Zahl der Nettowert. Die Einheit ist
  // für diese Paarentscheidung NICHT erforderlich.
  const numbers = [];
  const units = [];
  for (const item of items || []) {
    const raw = String(item?.text || "").trim();
    const upper = raw.toUpperCase();
    const b = boundsFromPoly(item.poly);

    const unit = normalizeUnit(upper);
    if (unit) {
      units.push({ item, text: unit, bounds: b, cx: b.x + b.width / 2, cy: b.y + b.height / 2 });
    }

    if (/^\d{3,5}(?:[.,]\d+)?$/.test(raw)) {
      numbers.push({ item, text: raw, poly: item.poly, bounds: b, cx: b.x + b.width / 2, cy: b.y + b.height / 2 });
    }
  }

  // 3a) Zahl + separate Einheit. Das bleibt der stärkste Split-Fall.
  for (const unit of units) {
    const plausible = [];
    for (const number of numbers) {
      const h = Math.max(8, number.bounds.height, unit.bounds.height);
      const vertical = Math.abs(number.cy - unit.cy);
      if (vertical > h * 1.35 + 9) continue;
      const gap = unit.bounds.x - (number.bounds.x + number.bounds.width);
      if (gap < -h * 0.4 || gap > h * 8 + 70) continue;
      if (!nearExpectedRow(number.poly, 7.5)) continue;
      plausible.push({ number, gap });
    }
    plausible.sort((a, b) => a.gap - b.gap);
    const chosen = plausible[0];
    if (!chosen) continue;
    const { number, gap } = chosen;
    const x1 = Math.min(number.bounds.x, unit.bounds.x);
    const y1 = Math.min(number.bounds.y, unit.bounds.y);
    const x2 = Math.max(number.bounds.x + number.bounds.width, unit.bounds.x + unit.bounds.width);
    const y2 = Math.max(number.bounds.y + number.bounds.height, unit.bounds.y + unit.bounds.height);
    const poly = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
    const pairScore = (Number(number.item.score || 0) + Number(unit.item.score || 0)) / 2;
    consider(number.text, poly, pairScore, `${number.item.text} ${unit.item.text}`, gap, false);
  }

  // 3b) Gross und Net als zwei reine Zahlenboxen, Einheit von OCR fehlt völlig.
  // Es werden nur eng benachbarte horizontale Paare in der erwarteten Region
  // akzeptiert. Der rechte Wert wird als KG inferiert.
  for (const left of numbers) {
    for (const right of numbers) {
      if (left === right || right.cx <= left.cx) continue;
      const h = Math.max(8, left.bounds.height, right.bounds.height);
      if (Math.abs(left.cy - right.cy) > h * 1.15 + 8) continue;
      const gap = right.bounds.x - (left.bounds.x + left.bounds.width);
      if (gap < -h * 0.25 || gap > h * 7 + 65) continue;
      if (!nearExpectedRow(left.poly, 7.5) || !nearExpectedRow(right.poly, 7.5)) continue;

      const x1 = Math.min(left.bounds.x, right.bounds.x);
      const y1 = Math.min(left.bounds.y, right.bounds.y);
      const x2 = Math.max(left.bounds.x + left.bounds.width, right.bounds.x + right.bounds.width);
      const y2 = Math.max(left.bounds.y + left.bounds.height, right.bounds.y + right.bounds.height);
      const poly = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
      const pairScore = (Number(left.item.score || 0) + Number(right.item.score || 0)) / 2;
      consider(right.text, poly, pairScore, `${left.item.text} / ${right.item.text}`, gap, true);
    }
  }

  return best;
}

function chooseHenkelProductWeightCandidate(items, expectedPoly, field) {
  const expected = boundsFromPoly(expectedPoly);
  const cx = expected.x + expected.width / 2;
  const cy = expected.y + expected.height / 2;
  const radius = Math.max(expected.width, expected.height) * Number(field.searchRadius || 2.4) + 45;
  const strictRegex = "^\\d+(?:[.,]\\d+)?\\s*(?:KG|KGM|G|L|LTR)$";
  let best = null;

  const consider = (candidate) => {
    if (!candidate?.text || !validateField(candidate.text, strictRegex)) return;
    const b = boundsFromPoly(candidate.poly);
    const dx = (b.x + b.width / 2) - cx;
    const dy = (b.y + b.height / 2) - cy;
    const distance = Math.hypot(dx, dy);
    if (distance > radius) return;
    const proximity = Math.max(0, 1 - distance / radius);
    const unit = String(candidate.text || "").match(/\b(KGM|KG|G|LTR|L)\b/i)?.[1]?.toUpperCase() || "";
    const unitBonus = unit ? 0.5 : 0;
    const score = proximity * 0.55 + Number(candidate.score || 0) * 0.30 + unitBonus;
    const enriched = { ...candidate, selectionScore: score, source: candidate.source || "ocr-product-weight" };
    if (!best || enriched.selectionScore > best.selectionScore) best = enriched;
  };

  // Wert + Einheit bereits gemeinsam erkannt, auch wenn noch weiterer Text
  // wie "Contents:" in derselben OCR-Zeile steht.
  for (const item of items || []) {
    const raw = String(item?.text || "");
    const pattern = /\d+(?:[.,]\d+)?\s*(?:KGM|KG|G|LTR|L)\b/ig;
    for (const match of raw.matchAll(pattern)) {
      const start = Number(match.index || 0);
      const end = start + String(match[0] || "").length;
      consider({
        ...item,
        text: String(match[0] || "").trim(),
        poly: approximateTextFragmentPoly(item.poly, raw.length, start, end),
        sourceText: raw,
        source: "ocr-product-weight"
      });
    }
  }

  // OCR kann Zahl und Einheit in zwei Boxen zerlegen. Nur sehr nahe Boxen
  // derselben Zeile werden verbunden; eine nackte Zahl allein bleibt ungültig.
  const numbers = [];
  const units = [];
  for (const item of items || []) {
    const text = String(item?.text || "").trim().toUpperCase();
    const b = boundsFromPoly(item.poly);
    if (/^\d+(?:[.,]\d+)?$/.test(text)) numbers.push({ item, text, bounds: b, cy: b.y + b.height / 2 });
    if (/^(?:KGM|KG|G|LTR|L)$/.test(text)) units.push({ item, text, bounds: b, cy: b.y + b.height / 2 });
  }
  for (const number of numbers) {
    for (const unit of units) {
      const h = Math.max(8, number.bounds.height, unit.bounds.height);
      if (Math.abs(number.cy - unit.cy) > h * 0.9 + 5) continue;
      const gap = unit.bounds.x - (number.bounds.x + number.bounds.width);
      if (gap < -h * 0.4 || gap > h * 4 + 28) continue;
      const x1 = Math.min(number.bounds.x, unit.bounds.x);
      const y1 = Math.min(number.bounds.y, unit.bounds.y);
      const x2 = Math.max(number.bounds.x + number.bounds.width, unit.bounds.x + unit.bounds.width);
      const y2 = Math.max(number.bounds.y + number.bounds.height, unit.bounds.y + unit.bounds.height);
      consider({
        text: `${number.text} ${unit.text}`,
        poly: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]],
        score: (Number(number.item.score || 0) + Number(unit.item.score || 0)) / 2,
        sourceText: `${number.item.text} ${unit.item.text}`,
        source: "ocr-product-weight"
      });
    }
  }

  return best;
}

function chooseQuantityWeightCandidate(items, expectedPoly, field) {
  const expected = boundsFromPoly(expectedPoly);
  const cx = expected.x + expected.width / 2;
  const cy = expected.y + expected.height / 2;
  const radius = Math.max(expected.width, expected.height) * Number(field.searchRadius || 2.2) + 40;
  const sourceRegex = field.sourceRegex || field.regex;
  let best = null;

  const consider = (candidate) => {
    if (!candidate?.text || !validateField(candidate.text, sourceRegex)) return;
    const b = boundsFromPoly(candidate.poly);
    const dx = (b.x + b.width / 2) - cx;
    const dy = (b.y + b.height / 2) - cy;
    const distance = Math.hypot(dx, dy);
    if (distance > radius) return;
    const proximity = Math.max(0, 1 - distance / radius);
    const unitBonus = /\b(?:KGM|LTR)\b/i.test(String(candidate.text || "")) ? 0.45 : 0;
    const score = proximity * 0.55 + Number(candidate.score || 0) * 0.30 + unitBonus;
    const enriched = { ...candidate, selectionScore: score, source: candidate.source || "ocr-quantity" };
    if (!best || enriched.selectionScore > best.selectionScore) best = enriched;
  };

  // Normalfall: Zahl und Einheit befinden sich in derselben OCR-Box.
  for (const item of items || []) {
    for (const fragment of matchingFieldFragments(item, sourceRegex)) consider({ ...fragment, source: "ocr-quantity" });
  }

  // Fallback: OCR trennt z. B. "1150" und "KGM" in zwei benachbarte Boxen.
  const numbers = [];
  const units = [];
  for (const item of items || []) {
    const text = String(item?.text || "").trim().toUpperCase();
    const b = boundsFromPoly(item.poly);
    if (/^\d+(?:[.,]\d+)?$/.test(text)) numbers.push({ item, text, bounds: b, cy: b.y + b.height / 2 });
    if (/^(?:KGM|LTR)$/.test(text)) units.push({ item, text, bounds: b, cy: b.y + b.height / 2 });
  }
  for (const number of numbers) {
    for (const unit of units) {
      const h = Math.max(8, number.bounds.height, unit.bounds.height);
      if (Math.abs(number.cy - unit.cy) > h * 0.8 + 4) continue;
      const gap = unit.bounds.x - (number.bounds.x + number.bounds.width);
      if (gap < -h * 0.5 || gap > h * 4 + 25) continue;
      const x1 = Math.min(number.bounds.x, unit.bounds.x);
      const y1 = Math.min(number.bounds.y, unit.bounds.y);
      const x2 = Math.max(number.bounds.x + number.bounds.width, unit.bounds.x + unit.bounds.width);
      const y2 = Math.max(number.bounds.y + number.bounds.height, unit.bounds.y + unit.bounds.height);
      consider({
        text: `${number.text} ${unit.text}`,
        poly: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]],
        score: (Number(number.item.score || 0) + Number(unit.item.score || 0)) / 2,
        sourceText: `${number.item.text} ${unit.item.text}`,
        source: "ocr-quantity"
      });
    }
  }

  return best;
}

function chooseNetPairCandidate(items) {
  let best = null;
  const pattern = /(\d+(?:[.,]\d+)?)\s*[/|I]\s*(\d+(?:[.,]\d+)?)\s*(KG|KGM|G|L|LTR)?/ig;
  for (const item of items || []) {
    const text = String(item?.text || "");
    for (const match of text.matchAll(pattern)) {
      const raw = String(match[0] || "").trim();
      if (!raw) continue;
      const start = Number(match.index || 0);
      const end = start + String(match[0] || "").length;
      const hasUnit = Boolean(match[3]);
      const candidate = {
        ...item,
        text: raw,
        poly: approximateTextFragmentPoly(item.poly, text.length, start, end),
        sourceText: text,
        source: "ocr-pattern",
        selectionScore: Number(item?.score || 0) + (hasUnit ? 0.35 : 0.15)
      };
      if (!best || candidate.selectionScore > best.selectionScore) best = candidate;
    }
  }
  return best;
}

function matchingFieldFragments(item, sourceRegex) {
  const text = String(item?.text || "").trim();
  if (!text) return [];
  const fragments = [];
  const seen = new Set();

  const add = (start, end) => {
    const raw = text.slice(start, end).trim();
    if (!raw || !validateField(raw, sourceRegex)) return;
    const key = `${start}:${end}:${raw}`;
    if (seen.has(key)) return;
    seen.add(key);
    fragments.push({
      ...item,
      text: raw,
      poly: approximateTextFragmentPoly(item.poly, text.length, start, end),
      sourceText: text
    });
  };

  // Wenn PaddleOCR den Feldwert bereits vollständig und gültig erkannt hat,
  // darf er nicht in kürzere Teilnummern zerlegt werden. Genau das führte z. B.
  // dazu, dass bei Lieferscheinnummern eine Ziffer am Anfang/Ende abgeschnitten
  // wurde, obwohl die vollständige Nummer korrekt im OCR-Ergebnis vorhanden war.
  add(0, text.length);
  if (fragments.length) return fragments;

  const words = Array.from(text.matchAll(/\S+/g));
  for (let startIndex = 0; startIndex < words.length; startIndex += 1) {
    for (let count = 1; count <= 3 && startIndex + count <= words.length; count += 1) {
      const first = words[startIndex];
      const last = words[startIndex + count - 1];
      add(first.index, last.index + last[0].length);
    }
  }

  // Atomare Teile bleiben erlaubt, damit kombinierte OCR-Zeilen wie
  // "D561001475:00001" oder "13023444 3103560" sauber getrennt werden.
  for (const part of text.matchAll(/[A-Z0-9]+(?:[.,-][A-Z0-9]+)*/gi)) {
    add(part.index, part.index + part[0].length);
  }

  // Keine beliebigen gleitenden Ziffernfenster mehr. Diese erzeugten aus einer
  // fremden 9-stelligen Nummer künstlich gültige 6- bis 8-stellige IDH-Werte.
  // Sonderfälle wie VW werden stattdessen explizit im Profil beschrieben.
  return fragments;
}

function approximateTextFragmentPoly(poly, textLength, start, end) {
  const points = normalizePoly(poly);
  if (!textLength || (start === 0 && end >= textLength) || points.length < 4) return points;
  const from = Math.max(0, Math.min(1, start / textLength));
  const to = Math.max(from, Math.min(1, end / textLength));
  const [topLeft, topRight, bottomRight, bottomLeft] = points;
  return [
    interpolatePoint(topLeft, topRight, from),
    interpolatePoint(topLeft, topRight, to),
    interpolatePoint(bottomLeft, bottomRight, to),
    interpolatePoint(bottomLeft, bottomRight, from)
  ];
}

function interpolatePoint(a, b, ratio) {
  return [
    Number(a?.[0] || 0) + (Number(b?.[0] || 0) - Number(a?.[0] || 0)) * ratio,
    Number(a?.[1] || 0) + (Number(b?.[1] || 0) - Number(a?.[1] || 0)) * ratio
  ];
}

function findAliasRange(source, alias) {
  const sourceMap = normalizedTextWithMap(source);
  const target = normalizeText(alias);
  if (!sourceMap.text || !target) return null;
  const normalizedStart = sourceMap.text.indexOf(target);
  if (normalizedStart < 0) return null;
  const normalizedEnd = normalizedStart + target.length - 1;
  const start = sourceMap.map[normalizedStart];
  const last = sourceMap.map[normalizedEnd];
  if (!Number.isInteger(start) || !Number.isInteger(last)) return null;
  return { start, end: last + 1 };
}

function normalizedTextWithMap(value) {
  const source = String(value || "");
  let text = "";
  const map = [];
  for (let index = 0; index < source.length; index += 1) {
    const normalized = source[index].toUpperCase().normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]/g, "");
    for (const char of normalized) {
      text += char;
      map.push(index);
    }
  }
  return { text, map };
}

function deriveDrumCandidate(items, batchCandidate, field, expectedPoly) {
  if (!batchCandidate) return null;
  const rawBatch = String(batchCandidate.text || "");
  const explicit = rawBatch.match(/[\/|I]\s*(\d{3,6})\b/i);
  if (explicit) {
    return {
      text: explicit[1],
      score: Number(batchCandidate.score || 0),
      poly: batchCandidate.poly,
      selectionScore: 1,
      source: "batch-suffix"
    };
  }

  if (field.adjacentTo !== "batch") return null;
  const batchBounds = boundsFromPoly(batchCandidate.poly);
  const expected = boundsFromPoly(expectedPoly || []);
  const sourceRegex = field.sourceRegex || "^(?:[/|I1]?\\s*)?\\d{4}$";
  let best = null;
  for (const item of items || []) {
    if (item === batchCandidate || !validateField(item.text, sourceRegex)) continue;
    const bounds = boundsFromPoly(item.poly);
    const verticalDistance = Math.abs((bounds.y + bounds.height / 2) - (batchBounds.y + batchBounds.height / 2));
    const gap = bounds.x - (batchBounds.x + batchBounds.width);
    if (verticalDistance > Math.max(18, batchBounds.height * 0.8)) continue;
    if (gap < -8 || gap > Math.max(170, batchBounds.width * 1.1)) continue;
    const expectedDistance = expected.width
      ? Math.hypot((bounds.x + bounds.width / 2) - (expected.x + expected.width / 2), (bounds.y + bounds.height / 2) - (expected.y + expected.height / 2))
      : 0;
    const score = 0.55 * Math.max(0, 1 - gap / Math.max(1, batchBounds.width * 1.1))
      + 0.25 * Math.max(0, 1 - verticalDistance / Math.max(1, batchBounds.height))
      + 0.15 * Number(item.score || 0)
      + 0.05 * Math.max(0, 1 - expectedDistance / 180);
    if (!best || score > best.selectionScore) best = { ...item, selectionScore: score, source: "ocr-neighbor" };
  }
  return best;
}

function defaultNormalizer(key) {
  if (key === "batch") return "batch";
  if (key === "weight") return "weight";
  if (["idh", "delivery_note", "drum_number"].includes(key)) return "digits";
  return "text";
}

function scaleNormalizedPoly(poly, size) {
  return normalizePoly(poly).map(([x, y]) => [x * size.width, y * size.height]);
}

function polyGeometry(poly) {
  const points = normalizePoly(poly);
  const bounds = boundsFromPoly(points);
  const a = points[0] || [bounds.x, bounds.y];
  const c = points[1] || [bounds.x + bounds.width, bounds.y];
  const d = points[3] || [bounds.x, bounds.y + bounds.height];
  return {
    center: [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2],
    leftCenter: [(a[0] + d[0]) / 2, (a[1] + d[1]) / 2],
    width: Math.hypot(c[0] - a[0], c[1] - a[1]) || bounds.width,
    height: Math.hypot(d[0] - a[0], d[1] - a[1]) || bounds.height,
    angle: Math.atan2(c[1] - a[1], c[0] - a[0])
  };
}

function normalizeText(value) {
  return String(value || "").toUpperCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

function dice(a, b) {
  if (!a || !b) return 0;
  const pairs = (value) => new Set(Array.from({ length: Math.max(0, value.length - 1) }, (_, index) => value.slice(index, index + 2)));
  const left = pairs(a);
  const right = pairs(b);
  let hits = 0;
  for (const pair of left) if (right.has(pair)) hits += 1;
  return (2 * hits) / Math.max(1, left.size + right.size);
}
