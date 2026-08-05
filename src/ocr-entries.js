export function parseFlorenceEntries(result, imageSize = null) {
  const payload = result?.["<OCR_WITH_REGION>"] || result || {};
  const labels = Array.isArray(payload.labels) ? payload.labels : [];
  const boxes = Array.isArray(payload.quad_boxes) ? payload.quad_boxes : [];
  return labels.map((text, index) => createEntry(text, boxes[index], index, imageSize));
}

export function createEntry(text, box, index = 0, imageSize = null) {
  const points = Array.isArray(box) && box.length >= 8
    ? box.slice(0, 8).map((value) => Number(value) || 0)
    : [0, 0, 0, 0, 0, 0, 0, 0];
  const xs = [points[0], points[2], points[4], points[6]];
  const ys = [points[1], points[3], points[5], points[7]];
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  return {
    index,
    indices: [index],
    text: String(text || "").trim(),
    normalizedText: normalizeText(text),
    box: points,
    left,
    right,
    top,
    bottom,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
    width,
    height,
    imageSize,
  };
}

export function buildTextCandidates(entries, maxGroup = 3) {
  const valid = (entries || []).filter((entry) => entry?.text && entry.width > 0 && entry.height > 0);
  const output = [...valid];
  const sorted = [...valid].sort((a, b) => a.centerY - b.centerY || a.left - b.left);

  for (let start = 0; start < sorted.length; start += 1) {
    const line = [sorted[start]];
    for (let next = start + 1; next < sorted.length && line.length < maxGroup; next += 1) {
      const previous = line[line.length - 1];
      const candidate = sorted[next];
      const overlap = intervalOverlap(previous.top, previous.bottom, candidate.top, candidate.bottom)
        / Math.max(1, Math.min(previous.height, candidate.height));
      const gap = candidate.left - previous.right;
      const typicalHeight = Math.max(previous.height, candidate.height);
      if (overlap >= 0.35 && gap >= -typicalHeight * 0.35 && gap <= typicalHeight * 5.5) {
        line.push(candidate);
        output.push(mergeEntries(line));
      } else if (candidate.top > previous.bottom + typicalHeight * 1.3) {
        break;
      }
    }
  }

  return deduplicateCandidates(output);
}

export function mergeEntries(entries) {
  const ordered = [...entries].sort((a, b) => a.left - b.left);
  const left = Math.min(...ordered.map((entry) => entry.left));
  const right = Math.max(...ordered.map((entry) => entry.right));
  const top = Math.min(...ordered.map((entry) => entry.top));
  const bottom = Math.max(...ordered.map((entry) => entry.bottom));
  const text = ordered.map((entry) => entry.text).join(" ").replace(/\s+/g, " ").trim();
  return {
    index: ordered[0].index,
    indices: ordered.flatMap((entry) => entry.indices || [entry.index]),
    text,
    normalizedText: normalizeText(text),
    box: [left, top, right, top, right, bottom, left, bottom],
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

export function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Ä/g, "AE").replace(/Ö/g, "OE").replace(/Ü/g, "UE").replace(/ß/g, "SS")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactText(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function deduplicateCandidates(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.indices?.join(",")}|${entry.normalizedText}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function intervalOverlap(a1, a2, b1, b2) {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}
