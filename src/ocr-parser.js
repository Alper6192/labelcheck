const ANCHORS = {
  batch: /\b(?:batch(?:\s*(?:no|nr|number))?|charge(?:n)?(?:\s*[-/:]?\s*(?:nr|no|number))?|lot(?:\s*(?:no|nr|number))?|1t)\b/i,
  idh: /\b(?:idh|material(?:\s*[-/]?\s*(?:nummer|nr|no))?|artikel(?:\s*[-/]?\s*(?:nummer|nr|no))?|part(?:\s*(?:number|no|nr))?|sach(?:\s*[-/]?\s*(?:nummer|nr))(?:\s*(?:lieferant|supplier))?|supplier\s*part(?:\s*(?:number|no|nr))?|product(?:\s*(?:number|no|nr)))\b/i,
  weight: /\b(?:net(?:to)?\s*(?:weight|gewicht)?|net\s*wt|gewicht|weight|füllmenge|fuellmenge|menge|quantity|qty|fill\s*quantity)\b/i,
  drum: /\b(?:fass(?:\s*[-/]?\s*(?:nummer|nr))?|drum(?:\s*(?:no|nr|number))?|packstück(?:\s*[-/]?\s*(?:nummer|nr))?)\b/i,
  deliveryNote: /\b(?:lieferschein(?:\s*[-/]?\s*(?:nummer|nr))?|delivery\s*(?:note|no|number))\b/i,
};

const FIELD_KEYS = ["batch", "idh", "weight", "drum", "deliveryNote"];

export function parseFlorenceOcr(result, options = {}) {
  const context = normalizeOptions(options);
  const payload = result?.["<OCR_WITH_REGION>"] || result || {};
  const labels = Array.isArray(payload.labels) ? payload.labels : [];
  const boxes = Array.isArray(payload.quad_boxes) ? payload.quad_boxes : [];
  const entries = labels.map((text, index) => createEntry(text, boxes[index], index));
  context.bounds = deriveBounds(entries, context.imageSize);

  return {
    fields: Object.fromEntries(FIELD_KEYS.map((key) => [key, extractField(key, entries, context)])),
    entries,
    refinedEntries: [],
    role: context.role,
  };
}

export function mergeParsedResults(primary, refined) {
  const fields = {};
  for (const key of FIELD_KEYS) {
    fields[key] = chooseBetterField(key, primary?.fields?.[key], refined?.fields?.[key]);
  }
  return {
    fields,
    entries: primary?.entries || [],
    refinedEntries: refined?.entries || [],
    role: primary?.role || refined?.role || "",
    refinementUsed: true,
  };
}

export function needsRefinement(parsed) {
  return ["batch", "idh", "weight"].some((key) => {
    const field = parsed?.fields?.[key];
    return !field?.value || Number(field.score || 0) < 88;
  });
}

function normalizeOptions(options) {
  if (typeof options === "string") return { role: options, imageSize: null, bounds: null };
  return {
    role: options?.role || "",
    imageSize: Array.isArray(options?.imageSize) ? options.imageSize : null,
    bounds: null,
  };
}

function createEntry(text, box, index) {
  const points = Array.isArray(box) && box.length >= 8 ? box.map(Number) : [0, 0, 0, 0, 0, 0, 0, 0];
  const xs = [points[0], points[2], points[4], points[6]];
  const ys = [points[1], points[3], points[5], points[7]];
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return {
    index,
    text: String(text || "").trim(),
    normalized: normalizeOcrText(text),
    box: points,
    left,
    right,
    top,
    bottom,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function extractField(key, entries, context) {
  const anchorRegex = ANCHORS[key];
  const candidates = [];

  for (const entry of entries) {
    if (!anchorRegex.test(entry.normalized)) continue;

    for (const value of matchValues(key, entry.normalized)) {
      candidates.push(candidate(key, value, 118 + structureScore(key, value, entry, context), "Beschriftung und Wert in einem Textblock", entry));
    }

    for (const neighbor of rankedNeighbors(entry, entries)) {
      for (const value of matchValues(key, neighbor.normalized)) {
        const base = neighbor.relative === "right" ? 108 : 101;
        const distancePenalty = Math.min(28, neighbor.distance / 36);
        candidates.push(candidate(
          key,
          value,
          base - distancePenalty + structureScore(key, value, neighbor.entry, context),
          `Wert ${neighbor.relative === "right" ? "rechts" : "unterhalb"} der Beschriftung`,
          neighbor.entry,
        ));
      }
    }
  }

  const allowFallback = ["batch", "weight", "idh"].includes(key);
  if (allowFallback) {
    for (const entry of entries) {
      for (const value of matchValues(key, entry.normalized)) {
        const base = key === "batch" ? 63 : key === "weight" ? 44 : 32;
        const score = base + structureScore(key, value, entry, context);
        candidates.push(candidate(key, value, score, "Struktureller Fallback ohne Beschriftung", entry));
      }
    }
  }

  const deduplicated = new Map();
  for (const item of candidates) {
    const existing = deduplicated.get(item.value);
    if (!existing || compareCandidates(key, item, existing) < 0) deduplicated.set(item.value, item);
  }

  const ranked = [...deduplicated.values()].sort((a, b) => compareCandidates(key, a, b));
  return ranked[0] || emptyField();
}

function rankedNeighbors(anchor, entries) {
  const output = [];
  for (const entry of entries) {
    if (entry.index === anchor.index || !entry.text) continue;
    const verticalOverlap = overlap(anchor.top, anchor.bottom, entry.top, entry.bottom) / Math.max(1, Math.min(anchor.height, entry.height));
    const horizontalOverlap = overlap(anchor.left, anchor.right, entry.left, entry.right) / Math.max(1, Math.min(anchor.width, entry.width));

    if (entry.left >= anchor.right - anchor.width * 0.12 && verticalOverlap > 0.28) {
      const distance = Math.max(0, entry.left - anchor.right) + Math.abs(entry.centerY - anchor.centerY) * 0.55;
      if (distance < Math.max(520, anchor.width * 5)) output.push({ entry, distance, relative: "right", normalized: entry.normalized });
    }

    if (entry.top >= anchor.bottom - anchor.height * 0.12 && horizontalOverlap > 0.15) {
      const distance = Math.max(0, entry.top - anchor.bottom) + Math.abs(entry.centerX - anchor.centerX) * 0.38;
      if (distance < Math.max(420, anchor.height * 10)) output.push({ entry, distance, relative: "below", normalized: entry.normalized });
    }
  }
  return output.sort((a, b) => a.distance - b.distance).slice(0, 8);
}

function matchValues(key, text) {
  const source = String(text || "").toUpperCase();

  if (key === "batch") {
    const values = [];
    const regex = /\bD[\s\-:/.]*([0-9OQ]{7,14})\b/g;
    for (const match of source.matchAll(regex)) values.push(`D${match[1].replace(/[OQ]/g, "0")}`);
    return values;
  }

  if (key === "weight") {
    const values = [];
    const regex = /\b([0-9OQ]{1,6}(?:[.,][0-9OQ]{1,3})?)\s*(KG[S5]?|K6|G|L|LTR|LITER)\b/g;
    for (const match of source.matchAll(regex)) {
      const number = match[1].replace(/[OQ]/g, "0");
      const unit = match[2] === "K6" ? "KG" : match[2];
      values.push(normalizeWeight(`${number} ${unit}`));
    }
    return values;
  }

  if (key === "idh") {
    const values = [];
    const regex = /\b[0-9OQ]{6,9}\b/g;
    for (const match of source.matchAll(regex)) values.push(match[0].replace(/[OQ]/g, "0"));
    return values;
  }

  if (key === "drum") {
    const match = source.match(/\b[0-9]{1,6}\b/);
    return match ? [match[0]] : [];
  }

  if (key === "deliveryNote") {
    const match = source.match(/\b[0-9]{5,16}\b/);
    return match ? [match[0]] : [];
  }

  return [];
}

function structureScore(key, value, entry, context) {
  const text = entry.normalized.toUpperCase();
  const compact = text.replace(/\s+/g, "");
  const valueCompact = String(value).replace(/\s+/g, "");
  const mostlyValue = compact === valueCompact || compact.replace(/[^A-Z0-9.,]/g, "") === valueCompact.replace(/[^A-Z0-9.,]/g, "");
  let score = mostlyValue ? 9 : 0;

  if (key === "batch") {
    const digits = value.replace(/\D/g, "").length;
    score += digits >= 9 && digits <= 10 ? 18 : digits === 8 ? 13 : digits > 10 ? 8 : 2;
    if (/^D\d+$/.test(value)) score += 5;
  }

  if (key === "weight") {
    const parsed = parseWeightValue(value);
    if (parsed) {
      if (parsed.unit === "KG") score += 20;
      if (parsed.amount >= 10) score += 8;
      if (parsed.amount >= 100) score += 7;
      if (parsed.unit === "G" && parsed.amount <= 5) score -= 35;
      if (parsed.amount === 0) score -= 30;
    }
  }

  if (key === "idh") {
    const length = value.length;
    score += length === 7 ? 22 : length === 8 ? 14 : length === 6 ? 8 : 1;
    const { width, height } = context.bounds || {};
    if (width && height) {
      const x = entry.centerX / width;
      const y = entry.centerY / height;
      if (context.role === "product") {
        if (x > 0.48) score += 7;
        if (y < 0.58) score += 6;
      } else if (context.role === "vda") {
        if (x > 0.42) score += 5;
        if (y > 0.22 && y < 0.78) score += 5;
      }
    }
  }

  const { height } = context.bounds || {};
  if (height && entry.height / height > 0.025) score += 3;
  return score;
}

function chooseBetterField(key, primary = emptyField(), refined = emptyField()) {
  if (!primary.value) return refined;
  if (!refined.value) return primary;
  const comparison = compareCandidates(key, refined, primary);
  return comparison < 0 ? { ...refined, source: `${refined.source} · Detailpass` } : primary;
}

function compareCandidates(key, a, b) {
  const scoreDifference = Number(b.score || 0) - Number(a.score || 0);
  if (scoreDifference) return scoreDifference;

  if (key === "batch") {
    const lengthDifference = b.value.replace(/\D/g, "").length - a.value.replace(/\D/g, "").length;
    if (lengthDifference) return lengthDifference;
  }

  if (key === "weight") {
    const pa = parseWeightValue(a.value);
    const pb = parseWeightValue(b.value);
    if (pa && pb) {
      if (pa.unit === "KG" && pb.unit !== "KG") return -1;
      if (pb.unit === "KG" && pa.unit !== "KG") return 1;
      if (pa.amount !== pb.amount) return pb.amount - pa.amount;
    }
  }

  return a.entryIndex - b.entryIndex;
}

function candidate(key, value, score, source, entry) {
  return {
    value,
    score: Math.max(0, Math.round(score)),
    source,
    raw: entry.text,
    entryIndex: entry.index,
    semantic: key,
    manual: false,
  };
}

function emptyField() {
  return { value: "", score: 0, source: "Nicht erkannt", raw: "", entryIndex: -1, manual: false };
}

export function normalizeWeight(value) {
  const parsed = parseWeightValue(value);
  if (!parsed) return String(value || "").trim().toUpperCase();
  const unit = parsed.unit === "KGS" ? "KG" : parsed.unit === "LITER" || parsed.unit === "LTR" ? "L" : parsed.unit;
  return `${Number(parsed.amount)} ${unit}`;
}

function parseWeightValue(value) {
  const match = String(value || "").toUpperCase().replace(/,/g, ".").match(/([0-9]+(?:\.[0-9]+)?)\s*(KG|KGS|G|L|LTR|LITER)/);
  if (!match) return null;
  return { amount: Number(match[1]), unit: match[2] };
}

export function normalizeOcrText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[|]/g, "I")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveBounds(entries, imageSize) {
  const widthFromImage = Number(imageSize?.[0]);
  const heightFromImage = Number(imageSize?.[1]);
  if (widthFromImage > 0 && heightFromImage > 0) return { width: widthFromImage, height: heightFromImage };
  return {
    width: Math.max(1, ...entries.map((entry) => entry.right)),
    height: Math.max(1, ...entries.map((entry) => entry.bottom)),
  };
}

function overlap(a1, a2, b1, b2) {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}
