import { clamp } from "./utils.js";
import { normalizeRect, polyToRect, rectToPoly } from "./profile-schema.js";

export function pointerToNormalized(event, canvas) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: clamp((event.clientX - bounds.left) / Math.max(1, bounds.width), 0, 1),
    y: clamp((event.clientY - bounds.top) / Math.max(1, bounds.height), 0, 1)
  };
}

export function rectFromPoints(start, end) {
  return normalizeRect({
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  });
}

export function hitTestRect(point, rect, handleRadius = 0.018) {
  const normalized = normalizeRect(rect);
  const corners = {
    nw: [normalized.x, normalized.y],
    ne: [normalized.x + normalized.width, normalized.y],
    se: [normalized.x + normalized.width, normalized.y + normalized.height],
    sw: [normalized.x, normalized.y + normalized.height]
  };
  for (const [handle, [x, y]] of Object.entries(corners)) {
    if (Math.hypot(point.x - x, point.y - y) <= handleRadius) return { type: "resize", handle };
  }
  const inside = point.x >= normalized.x && point.x <= normalized.x + normalized.width
    && point.y >= normalized.y && point.y <= normalized.y + normalized.height;
  return inside ? { type: "move" } : null;
}

export function applyRectDrag(originalRect, startPoint, currentPoint, interaction) {
  const rect = normalizeRect(originalRect);
  const dx = currentPoint.x - startPoint.x;
  const dy = currentPoint.y - startPoint.y;
  if (interaction.type === "move") {
    return normalizeRect({
      x: clamp(rect.x + dx, 0, 1 - rect.width),
      y: clamp(rect.y + dy, 0, 1 - rect.height),
      width: rect.width,
      height: rect.height
    });
  }

  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;
  if (interaction.handle.includes("w")) left = clamp(left + dx, 0, right - 0.004);
  if (interaction.handle.includes("e")) right = clamp(right + dx, left + 0.004, 1);
  if (interaction.handle.includes("n")) top = clamp(top + dy, 0, bottom - 0.004);
  if (interaction.handle.includes("s")) bottom = clamp(bottom + dy, top + 0.004, 1);
  return normalizeRect({ x: left, y: top, width: right - left, height: bottom - top });
}

export function polyFromPixelPoly(poly, width, height) {
  return (poly || []).map(([x, y]) => [x / Math.max(1, width), y / Math.max(1, height)]);
}

export function scaledPoly(poly, width, height) {
  return (poly || []).map(([x, y]) => [x * width, y * height]);
}

export function assignmentRect(assignment) {
  return polyToRect(assignment?.poly || []);
}

export function updateAssignmentRect(assignment, rect) {
  assignment.poly = rectToPoly(rect);
  return assignment;
}
