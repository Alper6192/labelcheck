import { buildTextCandidates, compactText, normalizeText } from "./ocr-entries.js";

const FIELD_KEYS = ["batch", "idh", "weight", "drum", "deliveryNote"];

export function resolveLabelProfile(config, role, entries, imageSize, preferredProfileId = "") {
  const profiles = Object.values(config?.profiles || {}).filter((profile) =>
    profile?.active !== false && profile?.configured !== false && profile?.role === role
  );
  if (!profiles.length) return unresolved("Keine aktiven Profile für diese Etikettenrolle.");

  if (preferredProfileId) {
    const preferred = profiles.find((profile) => profile.id === preferredProfileId);
    if (preferred) return mapWithProfile(preferred, entries, imageSize, { forced: true });
  }

  if (role === "product" && config?.productProfileId) {
    const product = profiles.find((profile) => profile.id === config.productProfileId);
    if (product) return mapWithProfile(product, entries, imageSize, { forced: true });
  }

  const automatic = profiles
    .filter((profile) => !profile.manualOnly)
    .map((profile) => mapWithProfile(profile, entries, imageSize, { forced: false }))
    .filter((result) => result.anchor?.matched)
    .sort((a, b) => b.profileScore - a.profileScore);

  if (!automatic.length) {
    return unresolved("Kein Kundenanker sicher erkannt. Format bitte manuell auswählen.", profiles);
  }

  const best = automatic[0];
  const second = automatic[1];
  if (best.profileScore < 54 || (second && best.profileScore - second.profileScore < 6)) {
    return {
      ...best,
      resolved: false,
      warning: "Format nicht eindeutig. Bitte das erkannte Profil kontrollieren oder manuell auswählen.",
      alternatives: automatic.slice(0, 4).map((item) => ({ id: item.profile.id, name: item.profile.name, score: item.profileScore })),
    };
  }
  return best;
}

export function mapWithProfile(profile, entries, imageSize, options = {}) {
  const candidates = buildTextCandidates(entries);
  const anchor = findAnchor(profile, candidates);
  if (!anchor.matched) {
    return {
      resolved: false,
      profile,
      profileScore: options.forced ? 20 : 0,
      anchor,
      fields: emptyFields(),
      entries,
      warning: `Anker für ${profile.name} wurde nicht erkannt.`,
    };
  }

  const initialTransform = homographyFromAnchor(profile, anchor.entry, imageSize);
  if (!initialTransform) {
    return {
      resolved: false,
      profile,
      profileScore: 0,
      anchor,
      fields: emptyFields(),
      entries,
      warning: "Geometrische Transformation konnte nicht berechnet werden.",
    };
  }

  const refinement = refineWithAnonymousGeometry(profile, entries, imageSize, initialTransform);
  const transform = refinement?.matrix || initialTransform;
  const fields = {};
  let fieldScoreSum = 0;
  let fieldScoreCount = 0;

  for (const key of FIELD_KEYS) {
    const fieldProfile = (profile.fields || []).find((field) => field.key === key);
    if (!fieldProfile) {
      fields[key] = emptyField("Für dieses Profil nicht konfiguriert");
      continue;
    }
    const mapped = mapField(fieldProfile, candidates, profile, imageSize, transform);
    fields[key] = mapped;
    if (mapped.value) {
      fieldScoreSum += mapped.score;
      fieldScoreCount += 1;
    }
  }

  const geometryBonus = Math.min(14, Number(refinement?.inliers || 0) * 1.2);
  const fieldAverage = fieldScoreCount ? fieldScoreSum / fieldScoreCount : 0;
  const profileScore = Math.round(anchor.score * 0.72 + Math.min(100, fieldAverage) * 0.18 + geometryBonus);
  return {
    resolved: options.forced || profileScore >= 54,
    profile,
    profileScore,
    anchor,
    transform,
    refinement,
    fields,
    entries,
    warning: refinement?.rejected ? "Geometrische Feinjustierung wurde wegen zu großer Abweichung verworfen." : "",
  };
}

export function findAnchor(profile, candidates) {
  const aliases = (profile?.anchor?.aliases || []).map(normalizeText).filter(Boolean);
  if (!aliases.length) return { matched: false, score: 0, reason: "Keine Anker-Aliase konfiguriert." };

  let best = null;
  for (const entry of candidates) {
    for (const alias of aliases) {
      const score = textSimilarity(alias, entry.normalizedText);
      if (!best || score > best.score) best = { matched: score >= 46, score, alias, entry };
    }
  }
  return best || { matched: false, score: 0 };
}

export function mapField(field, candidates, profile, imageSize, transform) {
  const expectedQuad = transformRect(field.rect, profile.master, transform);
  const expectedBounds = quadBounds(expectedQuad);
  const expectedDiagonal = Math.max(12, Math.hypot(expectedBounds.width, expectedBounds.height));
  const ranked = [];

  for (const entry of candidates) {
    const geometry = geometryScore(entry, expectedBounds, expectedDiagonal);
    if (geometry < 4) continue;
    const parsedValues = extractValues(field, entry.text);
    if (parsedValues.length) {
      for (const parsed of parsedValues) {
        const valid = validatePattern(parsed.value, field.pattern);
        const score = geometry + (valid ? 18 : 2) + structureBonus(field.key, parsed.value);
        ranked.push({
          value: parsed.value,
          raw: entry.text,
          score: Math.max(0, Math.min(100, Math.round(score))),
          source: `Profil ${profile.name} · Positionszuordnung`,
          valid,
          entryIndices: entry.indices,
          expectedQuad,
          candidateBox: entry.box,
          distance: parsed.distance,
          manual: false,
        });
      }
    } else {
      ranked.push({
        value: "",
        raw: entry.text,
        score: Math.max(0, Math.min(79, Math.round(geometry - 8))),
        source: `Text im erwarteten Bereich, aber Format unplausibel`,
        valid: false,
        entryIndices: entry.indices,
        expectedQuad,
        candidateBox: entry.box,
        manual: false,
      });
    }
  }

  ranked.sort((a, b) => b.score - a.score || Number(b.valid) - Number(a.valid));
  const bestValid = ranked.find((item) => item.value && item.valid);
  const best = bestValid || ranked.find((item) => item.value) || ranked[0];
  if (!best) return { ...emptyField("Keine Florence-Textbox an der erwarteten Profilposition"), expectedQuad };
  if (!best.value) return { ...emptyField(best.source), raw: best.raw, score: best.score, expectedQuad, candidateBox: best.candidateBox };
  return best;
}

export function transformRect(rect, master, matrix) {
  const width = Number(master?.width || 1);
  const height = Number(master?.height || 1);
  const x1 = Number(rect?.x || 0) * width;
  const y1 = Number(rect?.y || 0) * height;
  const x2 = (Number(rect?.x || 0) + Number(rect?.width || 0)) * width;
  const y2 = (Number(rect?.y || 0) + Number(rect?.height || 0)) * height;
  const points = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]].map((point) => applyHomography(matrix, point));
  return points.flat();
}

export function homographyFromAnchor(profile, targetEntry) {
  const master = profile?.master || {};
  const sourceNormalized = profile?.anchor?.masterQuad;
  if (!Array.isArray(sourceNormalized) || sourceNormalized.length !== 8 || !Array.isArray(targetEntry?.box)) return null;
  const source = [];
  for (let index = 0; index < 8; index += 2) {
    source.push([sourceNormalized[index] * Number(master.width || 1), sourceNormalized[index + 1] * Number(master.height || 1)]);
  }
  const target = [];
  for (let index = 0; index < 8; index += 2) target.push([targetEntry.box[index], targetEntry.box[index + 1]]);
  return solveHomography(source, target);
}

export function solveHomography(source, target) {
  if (source?.length !== 4 || target?.length !== 4) return null;
  const matrix = [];
  const vector = [];
  for (let index = 0; index < 4; index += 1) {
    const [x, y] = source[index];
    const [u, v] = target[index];
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    vector.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    vector.push(v);
  }
  const solution = solveLinearSystem(matrix, vector);
  return solution ? [solution[0], solution[1], solution[2], solution[3], solution[4], solution[5], solution[6], solution[7], 1] : null;
}

export function applyHomography(matrix, point) {
  const [x, y] = point;
  const denominator = matrix[6] * x + matrix[7] * y + matrix[8];
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-9) return [x, y];
  return [
    (matrix[0] * x + matrix[1] * y + matrix[2]) / denominator,
    (matrix[3] * x + matrix[4] * y + matrix[5]) / denominator,
  ];
}

function refineWithAnonymousGeometry(profile, liveEntries, imageSize, initialMatrix) {
  const geometry = Array.isArray(profile?.master?.geometry) ? profile.master.geometry : [];
  if (geometry.length < 6 || liveEntries.length < 6) return { matrix: initialMatrix, inliers: 0, used: false };
  const masterWidth = Number(profile.master.width || 1);
  const masterHeight = Number(profile.master.height || 1);
  const diagonal = Math.hypot(Number(imageSize?.[0] || 1), Number(imageSize?.[1] || 1));
  const projected = geometry.map((entry, index) => {
    const point = applyHomography(initialMatrix, [entry.x * masterWidth, entry.y * masterHeight]);
    return { index, point, width: entry.width * masterWidth, height: entry.height * masterHeight };
  });
  const pairs = [];
  const used = new Set();
  for (const item of projected) {
    let best = null;
    for (const live of liveEntries) {
      if (used.has(live.index)) continue;
      const distance = Math.hypot(item.point[0] - live.centerX, item.point[1] - live.centerY);
      if (distance > diagonal * 0.075) continue;
      const sizePenalty = Math.abs(Math.log(Math.max(1, live.width) / Math.max(1, item.width)))
        + Math.abs(Math.log(Math.max(1, live.height) / Math.max(1, item.height)));
      const score = distance + sizePenalty * diagonal * 0.008;
      if (!best || score < best.score) best = { live, score, distance };
    }
    if (best) {
      used.add(best.live.index);
      pairs.push({ source: item.point, target: [best.live.centerX, best.live.centerY], distance: best.distance });
    }
  }
  if (pairs.length < 3) return { matrix: initialMatrix, inliers: pairs.length, used: false };
  const correction = fitAffineRobust(pairs, diagonal * 0.028);
  if (!correction || correction.inliers.length < 3 || correction.rms > diagonal * 0.035) {
    return { matrix: initialMatrix, inliers: correction?.inliers?.length || 0, used: false, rejected: true };
  }
  return { matrix: multiply3x3(correction.matrix, initialMatrix), inliers: correction.inliers.length, rms: correction.rms, used: true };
}

function fitAffineRobust(pairs, threshold) {
  const samples = [];
  const maximum = Math.min(pairs.length, 12);
  for (let a = 0; a < maximum - 2; a += 1) {
    for (let b = a + 1; b < maximum - 1; b += 1) {
      for (let c = b + 1; c < maximum; c += 1) {
        samples.push([pairs[a], pairs[b], pairs[c]]);
        if (samples.length >= 120) break;
      }
      if (samples.length >= 120) break;
    }
    if (samples.length >= 120) break;
  }
  let best = null;
  for (const sample of samples) {
    const matrix = fitAffine(sample);
    if (!matrix) continue;
    const inliers = pairs.filter((pair) => pointDistance(applyHomography(matrix, pair.source), pair.target) <= threshold);
    const error = inliers.reduce((sum, pair) => sum + pointDistance(applyHomography(matrix, pair.source), pair.target) ** 2, 0);
    if (!best || inliers.length > best.inliers.length || (inliers.length === best.inliers.length && error < best.error)) {
      best = { matrix, inliers, error };
    }
  }
  if (!best || best.inliers.length < 3) return null;
  const matrix = fitAffine(best.inliers) || best.matrix;
  const rms = Math.sqrt(best.inliers.reduce((sum, pair) => sum + pointDistance(applyHomography(matrix, pair.source), pair.target) ** 2, 0) / best.inliers.length);
  return { matrix, inliers: best.inliers, rms };
}

function fitAffine(pairs) {
  if (pairs.length < 3) return null;
  const rows = [];
  const values = [];
  for (const pair of pairs) {
    const [x, y] = pair.source;
    const [u, v] = pair.target;
    rows.push([x, y, 1, 0, 0, 0]); values.push(u);
    rows.push([0, 0, 0, x, y, 1]); values.push(v);
  }
  const normal = Array.from({ length: 6 }, () => Array(6).fill(0));
  const rhs = Array(6).fill(0);
  for (let r = 0; r < rows.length; r += 1) {
    for (let i = 0; i < 6; i += 1) {
      rhs[i] += rows[r][i] * values[r];
      for (let j = 0; j < 6; j += 1) normal[i][j] += rows[r][i] * rows[r][j];
    }
  }
  const result = solveLinearSystem(normal, rhs);
  return result ? [result[0], result[1], result[2], result[3], result[4], result[5], 0, 0, 1] : null;
}

function extractValues(field, text) {
  const source = String(text || "").toUpperCase().replace(/[OQ]/g, "0");
  const output = [];
  if (field.extractor === "batch" || field.key === "batch") {
    for (const match of source.matchAll(/D[\s\-:/.]*([0-9]{7,14})/g)) output.push({ value: `D${match[1]}` });
  } else if (field.extractor === "drumAfterSlash") {
    const match = source.match(/\/\s*([0-9]{1,6})/); if (match) output.push({ value: match[1] });
  } else if (field.key === "idh") {
    for (const match of source.matchAll(/(?<![A-Z0-9])[0-9]{5,10}(?![A-Z0-9])/g)) output.push({ value: match[0] });
  } else if (field.key === "weight") {
    for (const match of source.matchAll(/([0-9]{1,7}(?:[.,][0-9]{1,3})?)\s*(KG|KGM|G|L|LTR|LITER)?/g)) {
      const number = match[1].replace(",", ".");
      const unit = (match[2] || field.defaultUnit || "").replace("KGM", "KG");
      if (unit || field.pattern?.includes("KG") || field.defaultUnit) output.push({ value: `${number}${unit ? ` ${unit}` : ""}`.trim() });
    }
  } else if (field.key === "deliveryNote") {
    for (const match of source.matchAll(/(?<![A-Z0-9])[0-9]{5,16}(?![A-Z0-9])/g)) output.push({ value: match[0] });
  } else if (field.key === "drum") {
    for (const match of source.matchAll(/(?<![A-Z0-9])[0-9]{1,6}(?![A-Z0-9])/g)) output.push({ value: match[0] });
  }
  return uniqueByValue(output);
}

function validatePattern(value, pattern) {
  if (!pattern) return Boolean(value);
  try { return new RegExp(pattern, "i").test(value); } catch { return false; }
}

function geometryScore(entry, expected, diagonal) {
  const dx = (entry.centerX - expected.centerX) / Math.max(8, expected.width);
  const dy = (entry.centerY - expected.centerY) / Math.max(8, expected.height);
  const distance = Math.hypot(dx, dy);
  if (distance > 3.5) return 0;
  const intersection = rectIntersection(entry, expected);
  const overlap = intersection / Math.max(1, Math.min(entry.width * entry.height, expected.width * expected.height));
  const sizePenalty = Math.abs(Math.log(entry.width / Math.max(1, expected.width))) + Math.abs(Math.log(entry.height / Math.max(1, expected.height)));
  return 82 - distance * 24 + overlap * 18 - sizePenalty * 5 + Math.max(0, 6 - diagonal / 1000);
}

function structureBonus(key, value) {
  if (key === "batch") return /^D\d{9,10}$/.test(value) ? 8 : 2;
  if (key === "idh") return value.length === 7 ? 7 : value.length === 8 ? 5 : 1;
  if (key === "weight") return /\bKG\b/.test(value) ? 6 : 1;
  return 2;
}

function quadBounds(quad) {
  const xs = [quad[0], quad[2], quad[4], quad[6]];
  const ys = [quad[1], quad[3], quad[5], quad[7]];
  const left = Math.min(...xs); const right = Math.max(...xs); const top = Math.min(...ys); const bottom = Math.max(...ys);
  return { left, right, top, bottom, width: Math.max(1, right - left), height: Math.max(1, bottom - top), centerX: (left + right) / 2, centerY: (top + bottom) / 2 };
}

function textSimilarity(alias, candidate) {
  const a = compactText(alias);
  const b = compactText(candidate);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (b.includes(a)) return Math.min(98, 86 + a.length / Math.max(1, b.length) * 12);
  if (a.includes(b) && b.length >= 5) return Math.min(92, 70 + b.length / a.length * 20);
  const tokensA = new Set(normalizeText(alias).split(" ").filter((token) => token.length > 1));
  const tokensB = new Set(normalizeText(candidate).split(" ").filter((token) => token.length > 1));
  const intersection = [...tokensA].filter((token) => tokensB.has(token)).length;
  const union = new Set([...tokensA, ...tokensB]).size || 1;
  const tokenScore = intersection / union * 100;
  const editScore = (1 - levenshtein(a, b) / Math.max(a.length, b.length)) * 100;
  return Math.max(tokenScore, editScore * 0.9);
}

function levenshtein(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const old = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = old;
    }
  }
  return previous[b.length];
}

function solveLinearSystem(matrix, vector) {
  const n = vector.length;
  const augmented = matrix.map((row, index) => [...row.map(Number), Number(vector[index])]);
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    if (Math.abs(augmented[pivot][column]) < 1e-10) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let c = column; c <= n; c += 1) augmented[column][c] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let c = column; c <= n; c += 1) augmented[row][c] -= factor * augmented[column][c];
    }
  }
  return augmented.map((row) => row[n]);
}

function multiply3x3(a, b) {
  const output = Array(9).fill(0);
  for (let row = 0; row < 3; row += 1) for (let column = 0; column < 3; column += 1) for (let k = 0; k < 3; k += 1) output[row * 3 + column] += a[row * 3 + k] * b[k * 3 + column];
  return output;
}

function rectIntersection(a, b) {
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
}
function pointDistance(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
function uniqueByValue(items) { const seen = new Set(); return items.filter((item) => !seen.has(item.value) && seen.add(item.value)); }
function emptyField(source = "nicht erkannt") { return { value: "", raw: "", score: 0, source, valid: false, manual: false }; }
function emptyFields() { return Object.fromEntries(FIELD_KEYS.map((key) => [key, emptyField()])); }
function unresolved(warning, profiles = []) { return { resolved: false, profile: null, profileScore: 0, anchor: { matched: false, score: 0 }, fields: emptyFields(), warning, alternatives: profiles.map((profile) => ({ id: profile.id, name: profile.name })) }; }
