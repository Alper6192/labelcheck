import { boundsFromPoly, normalizePoly } from "./utils.js";

const FIELD_KEYS = ["batch", "idh", "weight", "delivery_note", "drum_number"];

export async function loadProfiles() {
  const response = await fetch(new URL("./config/label-profiles.json", window.location.href));
  if (!response.ok) throw new Error(`Profile konnten nicht geladen werden (${response.status}).`);
  const config = await response.json();
  if (!Array.isArray(config.profiles)) throw new Error("Ungültige Profilkonfiguration.");
  return config.profiles.filter((profile) => profile.active !== false);
}

export function autoSelectProfile(items, profiles, role) {
  const eligible = profiles.filter((profile) => profile.role === role);
  let best = null;
  for (const profile of eligible) {
    const anchorMatch = findAnchor(items, profile.anchor?.aliases || []);
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
  const anchorMatch = findAnchor(items, profile.anchor?.aliases || []);
  if (!anchorMatch) {
    return { ...emptyExtraction(), profile, warning: "Profilanker wurde nicht erkannt." };
  }
  const transform = buildTransform(profile.anchor.poly, anchorMatch.item.poly, imageSize);
  const fields = {};
  const overlays = [{ key: "anchor", label: "ANKER", poly: normalizePoly(anchorMatch.item.poly), item: anchorMatch.item }];
  for (const field of profile.fields || []) {
    const expected = transformPoly(field.poly, transform, imageSize);
    const candidate = chooseCandidate(items, expected, field);
    fields[field.key] = {
      key: field.key,
      label: field.label || field.key,
      value: candidate ? normalizeFieldValue(field.key, candidate.text) : "",
      raw: candidate?.text || "",
      confidence: Number(candidate?.score || 0),
      valid: Boolean(candidate && validateField(candidate.text, field.regex)),
      required: Boolean(field.required),
      compare: Boolean(field.compare),
      source: candidate ? "ocr" : "missing",
      poly: candidate?.poly || expected
    };
    overlays.push({ key: field.key, label: field.label || field.key, poly: candidate?.poly || expected, item: candidate || null });
  }
  return { profile, anchorMatch, transform, fields, overlays, warning: "" };
}

export function applyManualValue(extraction, key, value) {
  const field = extraction?.fields?.[key];
  if (!field) return;
  field.value = normalizeFieldValue(key, value);
  field.raw = value;
  field.source = "manual";
  field.valid = field.value.length > 0;
}

export function normalizeFieldValue(key, value) {
  const text = String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  if (key === "batch") return text.replace(/\s/g, "").split("/")[0].replace(/[^A-Z0-9-]/g, "");
  if (["idh", "delivery_note", "drum_number"].includes(key)) return text.replace(/\D/g, "");
  if (key === "weight") return text.replace(/,/g, ".").replace(/\s+/g, " ");
  return text;
}

export function normalizedWeight(value) {
  const match = String(value || "").toUpperCase().replace(/,/g, ".").match(/(\d+(?:\.\d+)?)\s*(KG|G|L|LTR)/);
  if (!match) return null;
  const number = Number(match[1]);
  const unit = match[2] === "LTR" ? "L" : match[2];
  if (!Number.isFinite(number)) return null;
  return { number, unit, base: unit === "KG" ? number * 1000 : number };
}

function emptyExtraction() { return { profile: null, anchorMatch: null, transform: null, fields: {}, overlays: [], warning: "" }; }

function findAnchor(items, aliases) {
  let best = null;
  for (const item of items || []) {
    const text = normalizeText(item.text);
    for (const alias of aliases) {
      const target = normalizeText(alias);
      if (!target) continue;
      const exact = text === target;
      const contains = text.includes(target) || target.includes(text);
      const similarity = exact ? 1 : contains ? Math.min(text.length, target.length) / Math.max(text.length, target.length) : dice(text, target);
      const score = similarity * 0.8 + Number(item.score || 0) * 0.2;
      if (!best || score > best.matchScore) best = { item, alias, matchScore: score };
    }
  }
  return best;
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
  const cx = expected.x + expected.width / 2, cy = expected.y + expected.height / 2;
  const radius = Math.max(expected.width, expected.height) * 1.8 + 28;
  let best = null;
  for (const item of items || []) {
    if (!validateField(item.text, field.regex)) continue;
    const b = boundsFromPoly(item.poly);
    const ix = Math.max(0, Math.min(expected.x + expected.width, b.x + b.width) - Math.max(expected.x, b.x));
    const iy = Math.max(0, Math.min(expected.y + expected.height, b.y + b.height) - Math.max(expected.y, b.y));
    const overlap = (ix * iy) / Math.max(1, Math.min(expected.width * expected.height, b.width * b.height));
    const dx = (b.x + b.width / 2) - cx, dy = (b.y + b.height / 2) - cy;
    const distance = Math.hypot(dx, dy);
    if (distance > radius && overlap <= 0) continue;
    const proximity = Math.max(0, 1 - distance / radius);
    const score = overlap * 0.55 + proximity * 0.25 + Number(item.score || 0) * 0.2;
    if (!best || score > best.selectionScore) best = { ...item, selectionScore: score };
  }
  return best;
}

function validateField(value, regex) {
  if (!regex) return Boolean(String(value || "").trim());
  try { return new RegExp(regex, "i").test(String(value || "").trim()); }
  catch { return false; }
}

function scaleNormalizedPoly(poly, size) { return normalizePoly(poly).map(([x,y]) => [x * size.width, y * size.height]); }
function polyGeometry(poly) {
  const p = normalizePoly(poly); const b = boundsFromPoly(p);
  const a = p[0] || [b.x,b.y], c = p[1] || [b.x+b.width,b.y];
  return { center:[b.x+b.width/2,b.y+b.height/2], width:Math.hypot(c[0]-a[0],c[1]-a[1]) || b.width, angle:Math.atan2(c[1]-a[1],c[0]-a[0]) };
}
function normalizeText(value) { return String(value || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, ""); }
function dice(a,b) { if (!a || !b) return 0; const pairs=s=>new Set(Array.from({length:Math.max(0,s.length-1)},(_,i)=>s.slice(i,i+2))); const A=pairs(a),B=pairs(b); let hit=0; for(const p of A) if(B.has(p)) hit++; return (2*hit)/Math.max(1,A.size+B.size); }
