export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizePoly(poly) {
  if (!Array.isArray(poly)) return [];

  if (poly.length && Array.isArray(poly[0])) {
    return poly
      .map((point) => [Number(point?.[0]), Number(point?.[1])])
      .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  }

  const result = [];
  for (let index = 0; index + 1 < poly.length; index += 2) {
    const x = Number(poly[index]);
    const y = Number(poly[index + 1]);
    if (Number.isFinite(x) && Number.isFinite(y)) result.push([x, y]);
  }
  return result;
}

export function boundsFromPoly(poly) {
  const points = normalizePoly(poly);
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function sortOcrItems(items) {
  return [...(items || [])].sort((left, right) => {
    const a = boundsFromPoly(left.poly);
    const b = boundsFromPoly(right.poly);
    const rowTolerance = Math.max(12, Math.min(a.height || 20, b.height || 20) * 0.8);
    if (Math.abs(a.y - b.y) <= rowTolerance) return a.x - b.x;
    return a.y - b.y;
  });
}

export function formatMilliseconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "–";
  if (number < 1000) return `${Math.round(number)} ms`;
  return `${(number / 1000).toFixed(2)} s`;
}

export function safeError(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function serializableResult(result) {
  if (!result) return null;
  return {
    image: result.image || null,
    items: (result.items || []).map((item) => ({
      text: String(item.text ?? ""),
      score: Number(item.score ?? 0),
      poly: normalizePoly(item.poly)
    })),
    metrics: result.metrics || null,
    runtime: result.runtime || null
  };
}
