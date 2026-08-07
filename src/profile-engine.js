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
    if (!profilePassesDetection(items, profile)) continue;
    const anchorMatch = findProfileAnchor(items, profile);
    const score = anchorMatch ? anchorMatch.matchScore : 0;
    if (!best || score > best.score) best = { profile, anchorMatch, score };
  }
  if (role === "product" && eligible.length === 1 && (!best || best.score < 0.35)) {
    return { profile: eligible[0], anchorMatch: null, score: 0, manual: true };
  }
  return best?.score >= 0.55 ? best : null;
}

export function extractProfileFields(items, profile, imageSize) {
  if (!profile) return emptyExtraction();
  const anchorMatch = findProfileAnchor(items, profile);
  if (!anchorMatch) {
    return { ...emptyExtraction(), profile, warning: "Profilanker wurde nicht erkannt." };
  }

  const transform = buildTransform(anchorMatch.referencePoly || profile.anchor.poly, anchorMatch.item.poly, imageSize);
  const fields = {};
  const candidates = {};
  const expectedPolys = {};
  const overlays = [{ key: "anchor", label: "ANKER", poly: normalizePoly(anchorMatch.item.poly), item: anchorMatch.item }];

  for (const field of profile.fields || []) {
    const expected = transformPoly(field.poly, transform, imageSize);
    expectedPolys[field.key] = expected;
    const candidate = chooseCandidate(items, expected, field);
    if (candidate) candidates[field.key] = candidate;
  }

  for (const field of profile.fields || []) {
    const expected = expectedPolys[field.key];
    let candidate = candidates[field.key] || null;
    let source = candidate ? "ocr" : "missing";

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
  if (!profile) return emptyExtraction();
  const fields = {};
  for (const field of profile.fields || []) {
    const raw = String(qrMatch?.parsed?.fields?.[field.key] || "");
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
      poly: qrMatch?.poly || []
    };
  }
  return {
    profile,
    anchorMatch: null,
    transform: null,
    fields,
    overlays: qrMatch?.poly?.length
      ? [{ key: "anchor", label: "QR", poly: qrMatch.poly, item: null }]
      : [],
    warning: qrMatch?.parsed ? "" : "QR-Code des gewählten Profils wurde nicht erkannt.",
    qr: qrMatch?.parsed ? { parser: qrMatch.parsed.parser, raw: qrMatch.raw } : null
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
  if (normalizer === "digits") return text.replace(/\D/g, "");
  if (normalizer === "weight") {
    return text.replace(/,/g, ".").replace(/\bKGM\b/g, "KG").replace(/\s+/g, " ");
  }
  return text;
}

export function normalizedWeight(value) {
  const match = String(value || "").toUpperCase().replace(/,/g, ".").match(/(\d+(?:\.\d+)?)\s*(KG|KGM|G|L|LTR)?/);
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
  const primary = profile?.anchor || {};
  const anchors = [primary, ...(Array.isArray(primary.fallbacks) ? primary.fallbacks : [])];
  let best = null;
  const strongThreshold = anchors.length > 1 ? 0.62 : 0.55;

  for (let index = 0; index < anchors.length; index += 1) {
    const anchor = anchors[index];
    const match = findAnchor(items, anchor?.aliases || [], anchor);
    if (!match) continue;
    const enriched = {
      ...match,
      referencePoly: anchor.poly,
      anchorIndex: index,
      fallback: index > 0
    };
    // Der Hauptanker wird bevorzugt. Fallbacks greifen nur, wenn der jeweils
    // vorherige Anker nicht hinreichend sicher erkannt wurde. So bleibt die
    // Geometrie auch bei mehreren möglichen Beschriftungen deterministisch.
    if (enriched.matchScore >= strongThreshold) return enriched;
    if (!best || enriched.matchScore > best.matchScore) best = enriched;
  }
  return best;
}

function profilePassesDetection(items, profile) {
  const detection = profile?.detection;
  if (!detection) return true;
  const minScore = Number(detection.minScore || 0.62);

  for (const alias of detection.excludeAliases || []) {
    const match = findAnchor(items, [alias], { localizeAlias: true });
    if (match?.matchScore >= minScore) return false;
  }

  const evidenceAliases = detection.evidenceAliases || [];
  if (!evidenceAliases.length) return true;
  let matches = 0;
  for (const alias of evidenceAliases) {
    const match = findAnchor(items, [alias], { localizeAlias: true });
    if (match?.matchScore >= minScore) matches += 1;
  }
  return matches >= Number(detection.minEvidenceMatches || 1);
}

function findAnchor(items, aliases, anchorOptions = {}) {
  let best = null;
  for (const sourceItem of anchorCandidates(items)) {
    for (const alias of aliases) {
      const target = normalizeText(alias);
      if (!target) continue;
      const item = anchorOptions?.localizeAlias === true
        ? localizeAnchorAlias(sourceItem, alias) || sourceItem
        : sourceItem;
      const text = normalizeText(item.text);
      const similarity = anchorSimilarity(text, target);
      const score = similarity * 0.8 + Number(item.score || 0) * 0.2;
      if (!best || score > best.matchScore) best = { item, alias, matchScore: score };
    }
  }
  return best;
}

// PaddleOCR fasst bei langen H-Satz-Zeilen gelegentlich alles zu einer einzigen
// Textbox zusammen, z. B. "H-Sätze ... H334 Stor.Cl./WPC 11 /1". Würden wir
// die komplette Box als Anker verwenden, läge deren Mittelpunkt viel zu weit
// links und sämtliche Feldzonen würden verschoben. Liegt der Alias als Teiltext
// in einer längeren OCR-Zeile, schneiden wir deshalb virtuell nur den Alias aus
// und verwenden dessen angenäherte Geometrie als Anker.
function localizeAnchorAlias(item, alias) {
  const raw = String(item?.text || "");
  if (!raw || !item?.poly) return null;
  const source = normalizeTextWithMap(raw);
  const target = normalizeText(alias);
  if (!target || source.normalized === target) return null;
  const normalizedStart = source.normalized.indexOf(target);
  if (normalizedStart < 0) return null;
  const normalizedEnd = normalizedStart + target.length - 1;
  const start = source.map[normalizedStart]?.start ?? 0;
  const end = source.map[normalizedEnd]?.end ?? raw.length;
  return {
    ...item,
    text: raw.slice(start, end),
    poly: approximateTextFragmentPoly(item.poly, raw.length, start, end),
    sourceText: raw,
    anchorFragment: true
  };
}

function normalizeTextWithMap(value) {
  const raw = String(value || "");
  let normalized = "";
  const map = [];
  for (let index = 0; index < raw.length; index += 1) {
    const upper = raw[index].toUpperCase().normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]/g, "");
    for (const char of upper) {
      normalized += char;
      map.push({ start: index, end: index + 1 });
    }
  }
  return { normalized, map };
}

// PaddleOCR trennt kurze Beschriftungen gelegentlich in zwei Boxen, z. B.
// "Stor.Cl." + "/ WPC" oder "Alte" + "Materialnummer". Für die
// Profilerkennung bilden wir deshalb zusätzlich benachbarte Textboxen derselben
// Zeile zu einem virtuellen Ankerkandidaten zusammen.
function anchorCandidates(items) {
  const source = (items || []).filter((item) => item?.text && normalizePoly(item.poly).length >= 4);
  const candidates = [...source];
  const pairs = [];
  for (let i = 0; i < source.length; i += 1) {
    for (let j = 0; j < source.length; j += 1) {
      if (i === j || !canJoinAnchorItems(source[i], source[j])) continue;
      const pair = joinAnchorItems(source[i], source[j]);
      pairs.push(pair);
      candidates.push(pair);
    }
  }

  // Auch drei kleine Boxen zulassen, falls z. B. "Stor.Cl.", "/" und "WPC"
  // getrennt erkannt werden.
  for (const pair of pairs) {
    for (const item of source) {
      if (pair.sourceItems?.includes(item) || !canJoinAnchorItems(pair, item)) continue;
      candidates.push(joinAnchorItems(pair, item));
    }
  }
  return candidates;
}

function canJoinAnchorItems(left, right) {
  const a = boundsFromPoly(left.poly);
  const b = boundsFromPoly(right.poly);
  if (b.x < a.x) return false;
  const verticalDistance = Math.abs((a.y + a.height / 2) - (b.y + b.height / 2));
  const lineTolerance = Math.max(10, Math.max(a.height, b.height) * 0.75);
  if (verticalDistance > lineTolerance) return false;
  const gap = b.x - (a.x + a.width);
  const maxGap = Math.max(42, Math.max(a.height, b.height) * 4.5);
  return gap >= -Math.max(a.height, b.height) * 0.35 && gap <= maxGap;
}

function joinAnchorItems(left, right) {
  const a = boundsFromPoly(left.poly);
  const b = boundsFromPoly(right.poly);
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.width, b.x + b.width);
  const y2 = Math.max(a.y + a.height, b.y + b.height);
  return {
    text: `${left.text} ${right.text}`,
    score: (Number(left.score || 0) + Number(right.score || 0)) / 2,
    poly: [[x1,y1],[x2,y1],[x2,y2],[x1,y2]],
    joined: true,
    sourceItems: [...(left.sourceItems || [left]), ...(right.sourceItems || [right])]
  };
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

function buildTransform(referenceAnchorPoly, liveAnchorPoly, imageSize) {
  const ref = polyGeometry(scaleNormalizedPoly(referenceAnchorPoly, imageSize));
  const live = polyGeometry(liveAnchorPoly);

  // Die Breite einer OCR-Textbox hängt stark vom erkannten Text ab. Beim VW-
  // Master steht z. B. "Volkswagen Sachsen GmbH", auf einem anderen Werk aber
  // nur "Volkswagen AG". Würden wir die Boxbreite als globalen Maßstab nutzen,
  // würden sämtliche Feldpositionen zusammengestaucht. Die Schrift-/Zeilenhöhe
  // ist dagegen weitgehend unabhängig von der Textlänge und ist deshalb der
  // robustere Skalierungsanker.
  let scale = live.height / Math.max(ref.height, 1);
  if (!Number.isFinite(scale) || scale <= 0) scale = 1;
  scale = Math.max(0.35, Math.min(3, scale));
  return { refCenter: ref.center, liveCenter: live.center, scale, rotation: live.angle - ref.angle };
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

function chooseCandidate(items, expectedPoly, field) {
  const expected = boundsFromPoly(expectedPoly);
  const cx = expected.x + expected.width / 2;
  const cy = expected.y + expected.height / 2;
  const radius = Math.max(expected.width, expected.height) * Number(field.searchRadius || 1.8) + 28;
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
      if (distance > radius && overlap <= 0) continue;
      const proximity = Math.max(0, 1 - distance / radius);
      const score = overlap * 0.55 + proximity * 0.25 + Number(fragment.score || 0) * 0.2;
      if (!best || score > best.selectionScore) best = { ...fragment, selectionScore: score };
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

  add(0, text.length);

  const words = Array.from(text.matchAll(/\S+/g));
  for (let startIndex = 0; startIndex < words.length; startIndex += 1) {
    for (let count = 1; count <= 3 && startIndex + count <= words.length; count += 1) {
      const first = words[startIndex];
      const last = words[startIndex + count - 1];
      add(first.index, last.index + last[0].length);
    }
  }

  // Zusätzliche atomare Teile erlauben Werte aus kombinierten Zeilen wie
  // "D561001475:00001" oder "13023444 3103560".
  for (const part of text.matchAll(/[A-Z0-9]+(?:[.,-][A-Z0-9]+)*/gi)) {
    add(part.index, part.index + part[0].length);
  }

  // VW und ähnliche Etiketten werden von OCR gelegentlich als eine einzige
  // Ziffernfolge ohne Leerzeichen erkannt (z. B. 130234443103560). Wir bilden
  // deshalb aus längeren Ziffernfolgen kurze Teilkandidaten. add() lässt nur
  // diejenigen durch, die zum jeweiligen Feld-RegEx passen; die Geometrie
  // entscheidet anschließend zwischen Lieferscheinnummer und IDH.
  for (const run of text.matchAll(/\d+/g)) {
    const digits = run[0];
    if (digits.length <= 8) continue;
    const maxLength = Math.min(12, digits.length);
    for (let length = 4; length <= maxLength; length += 1) {
      for (let offset = 0; offset + length <= digits.length; offset += 1) {
        add(run.index + offset, run.index + offset + length);
      }
    }
  }

  return fragments;
}

function approximateTextFragmentPoly(poly, textLength, start, end) {
  const bounds = boundsFromPoly(poly);
  if (!bounds.width || !textLength || (start === 0 && end >= textLength)) return normalizePoly(poly);
  const left = bounds.x + bounds.width * (start / textLength);
  const right = bounds.x + bounds.width * (end / textLength);
  return [
    [left, bounds.y],
    [right, bounds.y],
    [right, bounds.y + bounds.height],
    [left, bounds.y + bounds.height]
  ];
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
