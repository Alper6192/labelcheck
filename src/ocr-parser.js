const ANCHORS = {
  batch: /\b(batch|charge|chargen?nr|lot|lot\s*no)\b/i,
  idh: /\b(idh|material(?:nummer|nr)?|artikel(?:nummer|nr)?|part\s*(?:number|no))\b/i,
  weight: /\b(net(?:to)?\s*(?:weight|gewicht)?|gewicht|weight|menge|quantity|qty)\b/i,
  drum: /\b(fass(?:nummer|nr)?|drum(?:\s*no)?)\b/i,
  deliveryNote: /\b(lieferschein(?:nummer|nr)?|delivery\s*note|delivery\s*no)\b/i,
};

const VALUE_PATTERNS = {
  batch: /\bD[\s\-]?[0-9]{6,14}\b/i,
  idh: /\b[0-9]{6,8}\b/,
  weight: /\b([0-9]{1,6}(?:[.,][0-9]{1,3})?)\s*(KG|KGS|G|L|LTR|LITER)\b/i,
  drum: /\b[0-9]{1,6}\b/,
  deliveryNote: /\b[0-9]{5,16}\b/,
};

export function parseFlorenceOcr(result) {
  const payload = result?.["<OCR_WITH_REGION>"] || result || {};
  const labels = Array.isArray(payload.labels) ? payload.labels : [];
  const boxes = Array.isArray(payload.quad_boxes) ? payload.quad_boxes : [];
  const entries = labels.map((text, index) => createEntry(text, boxes[index], index));

  return {
    fields: {
      batch: extractField("batch", entries),
      idh: extractField("idh", entries),
      weight: extractField("weight", entries),
      drum: extractField("drum", entries),
      deliveryNote: extractField("deliveryNote", entries),
    },
    entries,
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

function extractField(key, entries) {
  const anchorRegex = ANCHORS[key];
  const pattern = VALUE_PATTERNS[key];
  const candidates = [];

  for (const entry of entries) {
    if (!anchorRegex.test(entry.normalized)) continue;

    const inline = matchValue(key, entry.normalized, pattern);
    if (inline) candidates.push(candidate(key, inline, 100, "Beschriftung und Wert in einem Textblock", entry));

    for (const neighbor of rankedNeighbors(entry, entries)) {
      const value = matchValue(key, neighbor.normalized, pattern);
      if (!value) continue;
      const score = neighbor.relative === "right" ? 92 : 86;
      candidates.push(candidate(key, value, score - Math.min(20, neighbor.distance / 40), `Wert ${neighbor.relative === "right" ? "rechts" : "unterhalb"} der Beschriftung`, neighbor.entry));
    }
  }

  if (key === "batch" || key === "weight") {
    for (const entry of entries) {
      const value = matchValue(key, entry.normalized, pattern);
      if (value) candidates.push(candidate(key, value, key === "batch" ? 72 : 66, "Struktureller Fallback ohne Beschriftung", entry));
    }
  }

  const deduplicated = new Map();
  for (const item of candidates) {
    const existing = deduplicated.get(item.value);
    if (!existing || item.score > existing.score) deduplicated.set(item.value, item);
  }

  const ranked = [...deduplicated.values()].sort((a, b) => b.score - a.score);
  return ranked[0] || emptyField();
}

function rankedNeighbors(anchor, entries) {
  const output = [];
  for (const entry of entries) {
    if (entry.index === anchor.index || !entry.text) continue;
    const verticalOverlap = overlap(anchor.top, anchor.bottom, entry.top, entry.bottom) / Math.max(1, Math.min(anchor.height, entry.height));
    const horizontalOverlap = overlap(anchor.left, anchor.right, entry.left, entry.right) / Math.max(1, Math.min(anchor.width, entry.width));

    if (entry.left >= anchor.right - anchor.width * 0.1 && verticalOverlap > 0.35) {
      const distance = Math.max(0, entry.left - anchor.right) + Math.abs(entry.centerY - anchor.centerY) * 0.5;
      if (distance < Math.max(450, anchor.width * 4)) output.push({ entry, distance, relative: "right", normalized: entry.normalized });
    }

    if (entry.top >= anchor.bottom - anchor.height * 0.1 && horizontalOverlap > 0.2) {
      const distance = Math.max(0, entry.top - anchor.bottom) + Math.abs(entry.centerX - anchor.centerX) * 0.35;
      if (distance < Math.max(320, anchor.height * 8)) output.push({ entry, distance, relative: "below", normalized: entry.normalized });
    }
  }
  return output.sort((a, b) => a.distance - b.distance).slice(0, 6);
}

function matchValue(key, text, pattern) {
  const match = String(text || "").match(pattern);
  if (!match) return "";
  if (key === "weight") return normalizeWeight(`${match[1]} ${match[2]}`);
  const value = match[0];
  if (key === "batch") return value.toUpperCase().replace(/[\s-]/g, "");
  return value.replace(/\s+/g, "");
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
  const match = String(value || "").toUpperCase().replace(/,/g, ".").match(/([0-9]+(?:\.[0-9]+)?)\s*(KG|KGS|G|L|LTR|LITER)/);
  if (!match) return String(value || "").trim().toUpperCase();
  const unit = match[2] === "KGS" ? "KG" : match[2] === "LITER" || match[2] === "LTR" ? "L" : match[2];
  return `${Number(match[1])} ${unit}`;
}

export function normalizeOcrText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[|]/g, "I")
    .replace(/\s+/g, " ")
    .trim();
}

function overlap(a1, a2, b1, b2) {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}
