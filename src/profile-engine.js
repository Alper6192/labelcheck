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

  const transform = buildTransform(anchorMatch.referencePoly, anchorMatch.item.poly, imageSize);
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

function buildTransform(referenceAnchorPoly, liveAnchorPoly, imageSize) {
  const ref = polyGeometry(scaleNormalizedPoly(referenceAnchorPoly, imageSize));
  const live = polyGeometry(liveAnchorPoly);
  const scale = live.width / Math.max(ref.width, 1);
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
  return {
    center: [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2],
    width: Math.hypot(c[0] - a[0], c[1] - a[1]) || bounds.width,
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
