import { clamp, normalizePoly } from "./utils.js";

export const PROFILE_SCHEMA_VERSION = 3;
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
    neighbor: { field: "batch", directions: ["right"], maxDistance: 6 }
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

export const FIELD_STRATEGIES = [
  "",
  "unit_required_weight",
  "net_pair_weight",
  "numeric_pair",
  "quantity_weight"
];

export function createProfile(role = "vda", index = 1) {
  const stamp = String(index).padStart(3, "0");
  const product = role === "product";
  return {
    id: product ? `PRODUCT_${stamp}` : `VDA_${stamp}`,
    name: product ? `Produktprofil ${stamp}` : `VDA-Profil ${stamp}`,
    role: product ? "product" : "vda",
    active: true,
    source: { type: "ocr" },
    detection: {
      evidenceAliases: [],
      minEvidenceMatches: 0,
      excludeAliases: [],
      minScore: 0.55
    },
    validation: {
      minAnchorScore: 0.55,
      requiredValidFields: [],
      errorMessage: product
        ? "Kein gültiges Produktlabel erkannt. Bitte das Produktlabel vollständig und gut lesbar fotografieren."
        : ""
    },
    anchor: {
      aliases: [],
      poly: [],
      localizeAlias: false,
      scaleFrom: "width",
      alignFrom: "center",
      fallbacks: []
    },
    fields: []
  };
}

export function createField(key, poly = []) {
  const preset = FIELD_PRESETS[key];
  if (!preset) throw new Error(`Unbekanntes Feld: ${key}`);
  return { ...structuredCloneSafe(preset), poly: normalizeNormalizedPoly(poly) };
}

export function createQrFieldRule() {
  return {
    primaryRegex: "",
    primaryGroup: 1,
    secondaryRegex: "",
    secondaryGroup: 1,
    secondaryDefault: "",
    template: "{primary}",
    replacements: []
  };
}

export function normalizeProfileConfig(raw, appVersion = "") {
  const profiles = Array.isArray(raw?.profiles) ? raw.profiles : [];
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    appVersion: appVersion || String(raw?.appVersion || ""),
    exportedAt: raw?.exportedAt || null,
    profiles: profiles.map((profile, index) => normalizeProfile(profile, index))
  };
}

export function normalizeProfile(profile, index = 0) {
  const role = profile?.role === "product" ? "product" : "vda";
  const fallback = createProfile(role, index + 1);
  const fields = (Array.isArray(profile?.fields) ? profile.fields : [])
    .filter((field) => FIELD_PRESETS[field?.key])
    .map((field) => normalizeField(field));
  const fieldKeys = new Set(fields.map((field) => field.key));
  const source = normalizeProfileSource(profile?.source);
  return {
    id: String(profile?.id || fallback.id),
    name: String(profile?.name || fallback.name),
    role,
    active: profile?.active !== false,
    source,
    detection: normalizeProfileDetection(profile?.detection),
    validation: normalizeProfileValidation(profile?.validation, role, fieldKeys),
    anchor: normalizeAnchor(profile?.anchor),
    fields: fields.map((field) => normalizeFieldReferences(field, fieldKeys))
  };
}

function normalizeField(field) {
  const preset = FIELD_PRESETS[field.key];
  const locator = normalizeLocator(field.locator);
  const strategy = String(field.strategy || "").trim();
  const strategyUnits = Array.isArray(field.strategyUnits)
    ? field.strategyUnits.map((value) => String(value).trim().toUpperCase()).filter(Boolean)
    : [];
  return {
    ...structuredCloneSafe(preset),
    ...field,
    key: field.key,
    label: String(field.label || preset.label),
    required: Boolean(field.required),
    compare: Boolean(field.compare),
    regex: String(field.regex ?? preset.regex ?? ""),
    sourceRegex: String(field.sourceRegex ?? field.regex ?? preset.sourceRegex ?? preset.regex ?? ""),
    normalizer: String(field.normalizer || preset.normalizer || "text"),
    digits: field.digits == null ? preset.digits : Math.max(1, Number(field.digits || 1)),
    neighbor: normalizeNeighbor(field.neighbor, field.adjacentTo),
    strategy: strategy || undefined,
    fallbackStrategy: field.fallbackStrategy ? String(field.fallbackStrategy) : undefined,
    strategyUnits: strategyUnits.length ? strategyUnits : undefined,
    searchRadius: finiteOrUndefined(field.searchRadius),
    minOverlap: finiteOrUndefined(field.minOverlap),
    preferRightmost: field.preferRightmost === true || undefined,
    preferUnit: field.preferUnit === true || undefined,
    pairLeftMinDigits: finiteOrUndefined(field.pairLeftMinDigits),
    pairLeftMaxDigits: finiteOrUndefined(field.pairLeftMaxDigits),
    tailDigits: finiteOrUndefined(field.tailDigits),
    combinedMinDigits: finiteOrUndefined(field.combinedMinDigits),
    locator: locator || undefined,
    poly: normalizeNormalizedPoly(field.poly)
  };
}

function normalizeNeighbor(neighbor, legacyAdjacentTo) {
  const source = neighbor && typeof neighbor === "object" ? neighbor : null;
  const field = String(source?.field || legacyAdjacentTo || "").trim();
  if (!FIELD_PRESETS[field]) return undefined;
  const allowed = new Set(["left", "right", "above", "below"]);
  let directions = Array.isArray(source?.directions)
    ? source.directions.map((value) => String(value)).filter((value) => allowed.has(value))
    : [];
  if (!directions.length && legacyAdjacentTo) directions = ["right"];
  if (!directions.length) directions = ["right"];
  return {
    field,
    directions: Array.from(new Set(directions)),
    maxDistance: Math.max(0.5, Number(source?.maxDistance || 6))
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
  return {
    aliases: linesOrArray(anchor?.aliases),
    poly: normalizeNormalizedPoly(anchor?.poly),
    localizeAlias: anchor?.localizeAlias === true,
    scaleFrom: anchor?.scaleFrom === "height" ? "height" : "width",
    alignFrom: anchor?.alignFrom === "left" ? "left" : "center",
    fallbacks: Array.isArray(anchor?.fallbacks)
      ? anchor.fallbacks.map((fallback) => ({
          aliases: linesOrArray(fallback?.aliases),
          poly: normalizeNormalizedPoly(fallback?.poly),
          localizeAlias: fallback?.localizeAlias === true,
          scaleFrom: fallback?.scaleFrom === "height" ? "height" : "width",
          alignFrom: fallback?.alignFrom === "left" ? "left" : "center"
        })).filter((fallback) => fallback.aliases.length && fallback.poly.length >= 4)
      : []
  };
}

function normalizeFieldReferences(field, fieldKeys) {
  const normalized = { ...field };
  if (normalized.neighbor?.field && !fieldKeys.has(normalized.neighbor.field)) {
    normalized.neighbor = undefined;
  }
  if (normalized.adjacentTo && !fieldKeys.has(normalized.adjacentTo)) {
    normalized.adjacentTo = undefined;
  }
  return normalized;
}

function normalizeProfileDetection(detection) {
  const value = detection && typeof detection === "object" ? detection : {};
  const minScore = Number(value.minScore);
  return {
    evidenceAliases: linesOrArray(value.evidenceAliases),
    minEvidenceMatches: Math.max(0, Math.floor(Number(value.minEvidenceMatches || 0))),
    excludeAliases: linesOrArray(value.excludeAliases),
    minScore: Number.isFinite(minScore) ? clamp(minScore, 0, 1) : 0.55
  };
}

function normalizeProfileValidation(validation, role, fieldKeys = new Set()) {
  const value = validation && typeof validation === "object" ? validation : {};
  const minAnchorScore = Number(value.minAnchorScore);
  const requiredValidFields = Array.isArray(value.requiredValidFields)
    ? value.requiredValidFields.filter((key) => FIELD_PRESETS[key] && fieldKeys.has(key))
    : [];
  return {
    minAnchorScore: Number.isFinite(minAnchorScore) ? clamp(minAnchorScore, 0, 1) : 0.55,
    requiredValidFields,
    errorMessage: String(value.errorMessage || (role === "product"
      ? "Kein gültiges Produktlabel erkannt. Bitte das Produktlabel vollständig und gut lesbar fotografieren."
      : ""))
  };
}

function normalizeProfileSource(source) {
  if (source?.type === "qr") {
    const regions = normalizeQrRegions(source);
    return {
      type: "qr",
      regions,
      parser: normalizeQrParser(source.parser)
    };
  }
  return { type: "ocr" };
}

function normalizeQrRegions(source) {
  if (Array.isArray(source?.regions) && source.regions.length) {
    return source.regions.map(normalizeRect).filter((rect) => rect.width > 0 && rect.height > 0);
  }
  const legacy = String(source?.region || "").toLowerCase();
  if (legacy === "lower-left") {
    return [
      { x: 0, y: 0.48, width: 0.42, height: 0.48 },
      { x: 0, y: 0.34, width: 0.58, height: 0.66 }
    ];
  }
  return [{ x: 0, y: 0, width: 1, height: 1 }];
}

function normalizeQrParser(parser) {
  const value = parser && typeof parser === "object" ? parser : {};
  const fields = {};
  for (const key of FIELD_ORDER) {
    const rule = value.fields?.[key];
    if (!rule || typeof rule !== "object") continue;
    fields[key] = normalizeQrFieldRule(rule);
  }
  return {
    requiredFields: Array.isArray(value.requiredFields)
      ? value.requiredFields.filter((key) => FIELD_PRESETS[key] && fields[key])
      : [],
    fields
  };
}

function normalizeQrFieldRule(rule) {
  const replacements = Array.isArray(rule.replacements)
    ? rule.replacements.map((entry) => ({
        from: String(entry?.from || ""),
        to: String(entry?.to || "")
      })).filter((entry) => entry.from)
    : [];
  return {
    primaryRegex: String(rule.primaryRegex || ""),
    primaryGroup: Math.max(0, Math.floor(Number(rule.primaryGroup ?? 1))),
    secondaryRegex: String(rule.secondaryRegex || ""),
    secondaryGroup: Math.max(0, Math.floor(Number(rule.secondaryGroup ?? 1))),
    secondaryDefault: String(rule.secondaryDefault || ""),
    template: String(rule.template || "{primary}"),
    replacements
  };
}

function normalizeLocator(locator) {
  if (!locator || typeof locator !== "object") return null;
  const aliases = linesOrArray(locator.aliases);
  if (!aliases.length) return null;
  return {
    aliases,
    direction: ["below", "right", "below_or_right"].includes(locator.direction)
      ? locator.direction
      : "below_or_right",
    maxDistance: Math.max(0.1, Number(locator.maxDistance || 7)),
    minAliasScore: clamp(Number(locator.minAliasScore ?? 0.72), 0, 1),
    strict: locator.strict === true,
    preferRightmost: locator.preferRightmost === true,
    preferLeftmost: locator.preferLeftmost === true,
    preferUnit: locator.preferUnit === true,
    preferBatch: locator.preferBatch === true
  };
}

function normalizeNormalizedPoly(poly) {
  return normalizePoly(poly).map(([x, y]) => [clamp(x, 0, 1), clamp(y, 0, 1)]);
}

function linesOrArray(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  return String(value || "").split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
}

function finiteOrUndefined(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function structuredCloneSafe(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
