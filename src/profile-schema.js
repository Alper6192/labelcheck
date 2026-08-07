import { clamp, normalizePoly } from "./utils.js";

export const FIELD_ORDER = ["batch", "drum_number", "idh", "weight", "delivery_note"];

export const FIELD_PRESETS = {
  batch: {
    key: "batch",
    label: "Batch",
    required: true,
    compare: true,
    regex: "^D\\d{8,10}$",
    sourceRegex: "^D\\d{8,10}(?:\\s*[/|I1]\\s*\\d{4})?$",
    normalizer: "batch"
  },
  drum_number: {
    key: "drum_number",
    label: "Fassnummer",
    required: true,
    compare: false,
    regex: "^\\d{4}$",
    sourceRegex: "^(?:[/|I1]?\\s*)?\\d{4}$",
    normalizer: "last_digits",
    digits: 4,
    adjacentTo: "batch"
  },
  idh: {
    key: "idh",
    label: "IDH",
    required: true,
    compare: true,
    regex: "^\\d{6,8}$",
    sourceRegex: "^\\d{6,8}$",
    normalizer: "digits"
  },
  weight: {
    key: "weight",
    label: "Gewicht",
    required: true,
    compare: true,
    regex: "^\\d+(?:[.,]\\d+)?(?:\\s*(?:KG|KGM|G|L|LTR))?$",
    sourceRegex: "^\\d+(?:[.,]\\d+)?(?:\\s*(?:KG|KGM|G|L|LTR))?$",
    normalizer: "weight"
  },
  delivery_note: {
    key: "delivery_note",
    label: "Lieferscheinnummer",
    required: false,
    compare: false,
    regex: "^\\d{7,12}$",
    sourceRegex: "^\\d{7,12}$",
    normalizer: "digits"
  }
};

export function createProfile(role = "vda", index = 1) {
  const stamp = String(index).padStart(3, "0");
  return {
    id: role === "product" ? `PRODUCT_${stamp}` : `VDA_${stamp}`,
    name: role === "product" ? `Produktprofil ${stamp}` : `VDA-Profil ${stamp}`,
    role,
    active: true,
    anchor: { aliases: [], poly: [] },
    fields: []
  };
}

export function createField(key, poly = []) {
  const preset = FIELD_PRESETS[key];
  if (!preset) throw new Error(`Unbekanntes Feld: ${key}`);
  return { ...structuredCloneSafe(preset), poly: normalizeNormalizedPoly(poly) };
}

export function normalizeProfileConfig(raw, appVersion = "") {
  const profiles = Array.isArray(raw?.profiles) ? raw.profiles : [];
  return {
    schemaVersion: 2,
    appVersion: appVersion || String(raw?.appVersion || ""),
    exportedAt: raw?.exportedAt || null,
    profiles: profiles.map((profile, index) => normalizeProfile(profile, index))
  };
}

export function normalizeProfile(profile, index = 0) {
  const role = profile?.role === "product" ? "product" : "vda";
  const fallback = createProfile(role, index + 1);
  const fields = Array.isArray(profile?.fields) ? profile.fields : [];
  return {
    id: String(profile?.id || fallback.id),
    name: String(profile?.name || fallback.name),
    role,
    active: profile?.active !== false,
    source: normalizeProfileSource(profile?.source) || undefined,
    detection: normalizeProfileDetection(profile?.detection) || undefined,
    anchor: normalizeAnchor(profile?.anchor),
    fields: fields
      .filter((field) => FIELD_PRESETS[field?.key])
      .map((field) => ({
        ...structuredCloneSafe(FIELD_PRESETS[field.key]),
        ...field,
        key: field.key,
        label: String(field.label || FIELD_PRESETS[field.key].label),
        required: Boolean(field.required),
        compare: Boolean(field.compare),
        digits: field.digits == null ? FIELD_PRESETS[field.key].digits : Number(field.digits),
        poly: normalizeNormalizedPoly(field.poly)
      }))
  };
}

export function rectToPoly(rect) {
  const normalized = normalizeRect(rect);
  const { x, y, width, height } = normalized;
  return [[x, y], [x + width, y], [x + width, y + height], [x, y + height]];
}

export function polyToRect(poly) {
  const points = normalizeNormalizedPoly(poly);
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return normalizeRect({
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  });
}

export function normalizeRect(rect) {
  const x1 = clamp(Number(rect?.x || 0), 0, 1);
  const y1 = clamp(Number(rect?.y || 0), 0, 1);
  const x2 = clamp(x1 + Number(rect?.width || 0), 0, 1);
  const y2 = clamp(y1 + Number(rect?.height || 0), 0, 1);
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1)
  };
}

export function expandPoly(poly, paddingRatio = 0.18) {
  const rect = polyToRect(poly);
  const px = rect.width * Number(paddingRatio || 0);
  const py = rect.height * Number(paddingRatio || 0);
  return rectToPoly({
    x: clamp(rect.x - px, 0, 1),
    y: clamp(rect.y - py, 0, 1),
    width: clamp(rect.width + px * 2, 0, 1),
    height: clamp(rect.height + py * 2, 0, 1)
  });
}

export function findField(profile, key) {
  return profile?.fields?.find((field) => field.key === key) || null;
}

export function upsertField(profile, field) {
  const index = profile.fields.findIndex((entry) => entry.key === field.key);
  if (index >= 0) profile.fields[index] = field;
  else profile.fields.push(field);
  profile.fields.sort((a, b) => FIELD_ORDER.indexOf(a.key) - FIELD_ORDER.indexOf(b.key));
  return field;
}

export function validateRegex(pattern) {
  if (!String(pattern || "").trim()) return { valid: true, message: "" };
  try {
    new RegExp(pattern, "i");
    return { valid: true, message: "" };
  } catch (error) {
    return { valid: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export function safeProfileId(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "PROFILE";
}


function normalizeAnchor(anchor) {
  const normalized = {
    aliases: Array.isArray(anchor?.aliases)
      ? anchor.aliases.map((value) => String(value).trim()).filter(Boolean)
      : [],
    poly: normalizeNormalizedPoly(anchor?.poly),
    localizeAlias: anchor?.localizeAlias === true,
    fallbacks: Array.isArray(anchor?.fallbacks)
      ? anchor.fallbacks.map((fallback) => ({
          aliases: Array.isArray(fallback?.aliases)
            ? fallback.aliases.map((value) => String(value).trim()).filter(Boolean)
            : [],
          poly: normalizeNormalizedPoly(fallback?.poly),
          localizeAlias: fallback?.localizeAlias === true
        })).filter((fallback) => fallback.aliases.length && fallback.poly.length >= 4)
      : []
  };
  return normalized;
}

function normalizeProfileDetection(detection) {
  if (!detection || typeof detection !== "object") return null;
  const evidenceAliases = Array.isArray(detection.evidenceAliases)
    ? detection.evidenceAliases.map((value) => String(value).trim()).filter(Boolean)
    : [];
  const excludeAliases = Array.isArray(detection.excludeAliases)
    ? detection.excludeAliases.map((value) => String(value).trim()).filter(Boolean)
    : [];
  const minEvidenceMatches = Math.max(0, Number(detection.minEvidenceMatches || 0));
  const minScore = Number(detection.minScore);
  if (!evidenceAliases.length && !excludeAliases.length && !Number.isFinite(minScore)) return null;
  return {
    evidenceAliases,
    minEvidenceMatches,
    excludeAliases,
    ...(Number.isFinite(minScore) ? { minScore: clamp(minScore, 0, 1) } : {})
  };
}

function normalizeProfileSource(source) {
  if (source?.type !== "qr") return null;
  return {
    type: "qr",
    parser: String(source?.parser || "").trim(),
    region: String(source?.region || "").trim()
  };
}

function normalizeNormalizedPoly(poly) {
  return normalizePoly(poly).map(([x, y]) => [clamp(x, 0, 1), clamp(y, 0, 1)]);
}

function structuredCloneSafe(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
