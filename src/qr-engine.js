import jsQR from "jsqr";
import { parseQrPayload } from "./qr-parser.js";

/**
 * Prüft ausschließlich Profile, die source.type === "qr" verwenden.
 * Für Tesla wird zuerst gezielt der linke untere Bereich untersucht, damit der
 * deutlich größere QR-Code rechts nicht versehentlich gewählt wird.
 */
export function detectQrProfile(canvas, profiles, role = "vda") {
  if (!canvas?.width || !canvas?.height) return null;
  const eligible = (profiles || []).filter((profile) =>
    profile.role === role && profile.active !== false && profile.source?.type === "qr"
  );

  for (const profile of eligible) {
    const regions = regionsForProfile(profile);
    for (const region of regions) {
      const decoded = decodeRegion(canvas, region);
      if (!decoded?.data) continue;
      const parsed = parseQrPayload(profile.source?.parser, decoded.data);
      if (!parsed) continue;
      return {
        profile,
        parsed,
        raw: decoded.data,
        poly: decoded.poly,
        region
      };
    }
  }
  return null;
}

export function decodeRegion(canvas, region) {
  const rect = normalizedRegion(region, canvas.width, canvas.height);
  if (rect.width < 8 || rect.height < 8) return null;

  const crop = document.createElement("canvas");
  crop.width = rect.width;
  crop.height = rect.height;
  const context = crop.getContext("2d", { willReadFrequently: true });
  context.drawImage(canvas, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  const image = context.getImageData(0, 0, rect.width, rect.height);
  const result = jsQR(image.data, rect.width, rect.height, { inversionAttempts: "attemptBoth" });

  crop.width = 1;
  crop.height = 1;
  if (!result?.data) return null;

  const loc = result.location;
  const points = [loc?.topLeftCorner, loc?.topRightCorner, loc?.bottomRightCorner, loc?.bottomLeftCorner]
    .filter(Boolean)
    .map((point) => [Number(point.x) + rect.x, Number(point.y) + rect.y]);

  return { data: result.data, poly: points };
}

function regionsForProfile(profile) {
  const region = String(profile.source?.region || "").toLowerCase();
  if (region === "lower-left") {
    return [
      { x: 0, y: 0.48, width: 0.42, height: 0.48 },
      { x: 0, y: 0.34, width: 0.58, height: 0.66 }
    ];
  }
  return [{ x: 0, y: 0, width: 1, height: 1 }];
}

function normalizedRegion(region, width, height) {
  const x = clamp01(region?.x ?? 0);
  const y = clamp01(region?.y ?? 0);
  const right = clamp01(x + Number(region?.width ?? 1));
  const bottom = clamp01(y + Number(region?.height ?? 1));
  return {
    x: Math.floor(x * width),
    y: Math.floor(y * height),
    width: Math.max(1, Math.ceil((right - x) * width)),
    height: Math.max(1, Math.ceil((bottom - y) * height))
  };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value || 0)));
}
