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
  let calibration = calibrateProfile(profile, candidates, imageSize);
  let anchor = calibration?.anchor || findAnchor(profile, candidates);

  /*
   * Produktlabels besitzen in der Praxis nicht immer einen von Florence
   * lesbaren Logoanker. Das Henkel-Logo kann als Grafik erkannt werden, obwohl
   * IDH, Gewicht und Batch korrekt als Textboxen vorhanden sind. Da das
   * Produktprofil fest vorgegeben ist, darf ein fehlender Logo-Text die
   * Zuordnung nicht blockieren. In diesem Fall wird die Transformation aus der
   * gemeinsamen geometrischen Konstellation mindestens zweier Wertfelder
   * bestimmt. Es werden weiterhin keine Bildbereiche ausgeschnitten und keine
   * Beschriftungen neben den Werten ausgewertet.
   */
  if (options.forced && profile?.role === "product") {
    const fieldCalibration = calibrateWithoutAnchor(profile, candidates, imageSize);
    const currentInliers = Number(calibration?.inliers || 0);
    const fieldInliers = Number(fieldCalibration?.inliers || 0);
    const fieldIsClearlyBetter = fieldCalibration && (
      !calibration ||
      fieldInliers > currentInliers ||
      (fieldInliers === currentInliers && Number(fieldCalibration.score || 0) > Number(calibration.score || 0) + 20)
    );

    /*
     * Ein im Adressblock gelesenes „Henkel“ darf nicht als Logoanker die
     * komplette Geometrie verdrehen. Sobald die drei Kernwerte gemeinsam eine
     * konsistentere, nahezu horizontale Transformation liefern, gewinnt die
     * Wertgeometrie – auch wenn irgendein HENKEL-Text gefunden wurde.
     */
    if (fieldIsClearlyBetter) {
      calibration = fieldCalibration;
      anchor = {
        matched: false,
        synthetic: true,
        score: 0,
        alias: "Wertgeometrie",
      };
    }
  }

  if (!anchor?.matched && !anchor?.synthetic) {
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

  const initialTransform = calibration?.matrix || (anchor?.entry ? homographyFromAnchor(profile, anchor.entry, imageSize) : null);
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

  const anonymousRefinement = refineWithAnonymousGeometry(profile, entries, imageSize, initialTransform);
  let transform = anonymousRefinement?.matrix || initialTransform;
  let fields = mapAllFields(profile, candidates, imageSize, transform);

  /*
   * Sobald mindestens drei gültige Wertboxen gefunden wurden, wird aus ihren
   * tatsächlichen Florence-Mittelpunkten eine gemeinsame Ähnlichkeitstrans-
   * formation berechnet. Das korrigiert kleine Kameraabstände und Verschie-
   * bungen, ohne Etikettenränder oder Beschriftungstexte zu benötigen.
   */
  const fieldRefinement = refineWithMappedFields(profile, fields, imageSize);
  if (fieldRefinement?.used) {
    transform = fieldRefinement.matrix;
    fields = mapAllFields(profile, candidates, imageSize, transform);
  }

  let fieldScoreSum = 0;
  let fieldScoreCount = 0;
  for (const mapped of Object.values(fields)) {
    if (mapped?.value) {
      fieldScoreSum += Number(mapped.score || 0);
      fieldScoreCount += 1;
    }
  }

  const fieldConsensusInliers = Number(calibration?.inliers || 0);
  const anonymousInliers = Number(anonymousRefinement?.inliers || 0);
  const mappedFieldInliers = Number(fieldRefinement?.inliers || 0);
  const geometryBonus = Math.min(22, fieldConsensusInliers * 3 + anonymousInliers * 1.2 + mappedFieldInliers * 1.6);
  const fieldAverage = fieldScoreCount ? fieldScoreSum / fieldScoreCount : 0;
  const anchorContribution = anchor?.synthetic
    ? Math.min(70, 22 + fieldConsensusInliers * 18)
    : Number(anchor?.score || 0) * 0.62;
  const profileScore = Math.min(100, Math.round(anchorContribution + Math.min(100, fieldAverage) * 0.22 + geometryBonus));
  const warningParts = [];
  if (anchor?.synthetic) warningParts.push("Produktprofil ohne lesbaren Logoanker über die Wertgeometrie kalibriert.");
  if (calibration?.fallback && !anchor?.synthetic) warningParts.push("Profilgeometrie nur aus Bildmaß und Anker geschätzt.");
  if (anonymousRefinement?.rejected) warningParts.push("Anonyme Geometrie-Feinjustierung wurde verworfen.");

  return {
    resolved: options.forced || profileScore >= 54,
    profile,
    profileScore,
    anchor,
    transform,
    refinement: {
      method: calibration?.method || "anchor-image-fit",
      inliers: fieldConsensusInliers + anonymousInliers + mappedFieldInliers,
      fieldInliers: fieldConsensusInliers,
      anonymousInliers,
      mappedFieldInliers,
      used: Boolean(fieldConsensusInliers || anonymousRefinement?.used || fieldRefinement?.used),
      rms: fieldRefinement?.rms ?? anonymousRefinement?.rms,
    },
    fields,
    entries,
    warning: warningParts.join(" "),
  };
}

export function findAnchor(profile, candidates) {
  return findAnchorCandidates(profile, candidates)[0] || { matched: false, score: 0 };
}

function findAnchorCandidates(profile, candidates) {
  const aliases = (profile?.anchor?.aliases || []).map(normalizeText).filter(Boolean);
  if (!aliases.length) return [];

  const ranked = [];
  for (const entry of candidates) {
    for (const alias of aliases) {
      const score = textSimilarity(alias, entry.normalizedText);
      if (score >= 46) ranked.push({ matched: true, score, alias, entry });
    }
  }

  ranked.sort((a, b) => b.score - a.score || a.entry.indices.length - b.entry.indices.length);
  const seen = new Set();
  return ranked.filter((item) => {
    const key = `${item.entry.indices?.join(",")}|${item.alias}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 10);
}

/*
 * Ein Kundenname identifiziert das Profil, seine OCR-Box darf aber nicht die
 * Skalierung des gesamten Labels bestimmen. Im Master kann der Anker manuell
 * um zwei Zeilen gezeichnet sein, während Florence live nur eine Zeile liefert.
 * Außerdem kann derselbe Text (z. B. HENKEL) mehrfach vorkommen.
 *
 * Deshalb werden mehrere Ankerkandidaten und mehrere Feldhypothesen getestet.
 * Der Gewinner ist die Transformation, bei der die konfigurierten Wertmuster
 * gemeinsam an ihren erwarteten Positionen liegen. Beschriftungstexte werden
 * dabei nicht verwendet.
 */
function calibrateProfile(profile, candidates, imageSize) {
  const anchors = findAnchorCandidates(profile, candidates);
  if (!anchors.length) return null;

  let best = null;
  for (const anchor of anchors) {
    const base = homographyFromAnchor(profile, anchor.entry, imageSize);
    if (base) best = chooseCalibration(best, scoreCalibration(profile, candidates, imageSize, anchor, base, "anchor-image-fit"));

    const sourceAnchor = normalizedQuadCenter(profile?.anchor?.masterQuad, profile?.master);
    const targetAnchor = quadBounds(anchor.entry.box);
    if (!sourceAnchor || !targetAnchor) continue;

    for (const field of profile.fields || []) {
      if (!field?.rect || field.key === "drum" && field.extractor === "drumAfterSlash") continue;
      const sourceField = rectCenterInMaster(field.rect, profile.master);
      if (!sourceField || pointDistance(sourceAnchor, sourceField) < 12) continue;

      const liveOptions = validCandidatesForField(field, candidates).slice(0, 18);
      for (const live of liveOptions) {
        const matrix = similarityFromTwoPairs(
          sourceAnchor,
          sourceField,
          [targetAnchor.centerX, targetAnchor.centerY],
          [live.entry.centerX, live.entry.centerY],
        );
        if (!matrix || !anchorTransformIsSane(matrix, profile.master, imageSize)) continue;
        best = chooseCalibration(best, scoreCalibration(profile, candidates, imageSize, anchor, matrix, `anchor+${field.key}`));
      }
    }
  }

  if (!best) return null;
  return {
    ...best,
    fallback: best.inliers < 2,
  };
}

function calibrateWithoutAnchor(profile, candidates, imageSize) {
  const fields = (profile?.fields || []).filter((field) =>
    field?.rect && field.extractor !== "drumAfterSlash" && ["batch", "idh", "weight"].includes(field.key)
  );
  if (fields.length < 2) return null;

  let best = null;
  for (let firstIndex = 0; firstIndex < fields.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < fields.length; secondIndex += 1) {
      const firstField = fields[firstIndex];
      const secondField = fields[secondIndex];
      const firstSource = rectCenterInMaster(firstField.rect, profile.master);
      const secondSource = rectCenterInMaster(secondField.rect, profile.master);
      if (!firstSource || !secondSource || pointDistance(firstSource, secondSource) < 12) continue;

      const firstCandidates = validCandidatesForField(firstField, candidates).slice(0, 14);
      const secondCandidates = validCandidatesForField(secondField, candidates).slice(0, 14);
      for (const firstLive of firstCandidates) {
        for (const secondLive of secondCandidates) {
          const firstKey = firstLive.entry.indices?.join(",") || String(firstLive.entry.index);
          const secondKey = secondLive.entry.indices?.join(",") || String(secondLive.entry.index);
          if (firstKey === secondKey) continue;

          const matrix = similarityFromTwoPairs(
            firstSource,
            secondSource,
            [firstLive.entry.centerX, firstLive.entry.centerY],
            [secondLive.entry.centerX, secondLive.entry.centerY],
          );
          if (!matrix || !anchorTransformIsSane(matrix, profile.master, imageSize)) continue;
          if (!productTransformIsPlausible(matrix, profile.master, imageSize)) continue;

          const syntheticAnchor = { matched: false, synthetic: true, score: 0, alias: "Wertgeometrie" };
          const scored = scoreCalibration(
            profile,
            candidates,
            imageSize,
            syntheticAnchor,
            matrix,
            `fields:${firstField.key}+${secondField.key}`,
          );
          best = chooseCalibration(best, scored);
        }
      }
    }
  }

  const configuredCoreFields = fields.length;
  const minimumInliers = configuredCoreFields >= 3 ? 3 : 2;
  if (!best || best.inliers < minimumInliers) return null;
  return {
    ...best,
    fallback: best.inliers < configuredCoreFields,
    anchorless: true,
  };
}

function validCandidatesForField(field, candidates) {
  const ranked = [];
  for (const entry of candidates) {
    for (const parsed of extractValues(field, entry.text)) {
      if (!validatePattern(parsed.value, field.pattern)) continue;
      ranked.push({
        entry,
        value: parsed.value,
        structure: structureBonus(field.key, parsed.value),
      });
    }
  }
  ranked.sort((a, b) => b.structure - a.structure || b.entry.width - a.entry.width);
  return ranked;
}

function scoreCalibration(profile, candidates, imageSize, anchor, matrix, method) {
  const diagonal = Math.max(1, Math.hypot(Number(imageSize?.[0] || 1), Number(imageSize?.[1] || 1)));
  let inliers = 0;
  let fieldScore = 0;
  const matched = [];
  const usedEntryKeys = new Set();

  for (const field of profile.fields || []) {
    if (!field?.rect || field.key === "drum" && field.extractor === "drumAfterSlash") continue;
    const expected = quadBounds(transformRect(field.rect, profile.master, matrix));
    let best = null;

    for (const item of validCandidatesForField(field, candidates)) {
      const entryKey = item.entry.indices?.join(",") || String(item.entry.index);
      if (usedEntryKeys.has(entryKey)) continue;
      const distance = Math.hypot(item.entry.centerX - expected.centerX, item.entry.centerY - expected.centerY);
      const normalizedDistance = distance / diagonal;
      if (normalizedDistance > 0.16) continue;
      const sizePenalty = Math.abs(Math.log(Math.max(1, item.entry.width) / Math.max(1, expected.width)))
        + Math.abs(Math.log(Math.max(1, item.entry.height) / Math.max(1, expected.height)));
      const score = 100 - normalizedDistance * 520 - sizePenalty * 7 + item.structure;
      if (!best || score > best.score) best = { ...item, score, distance, entryKey };
    }

    if (best && best.score >= 34) {
      inliers += 1;
      fieldScore += best.score;
      matched.push({ field: field.key, value: best.value, entryIndices: best.entry.indices, score: Math.round(best.score) });
      usedEntryKeys.add(best.entryKey);
    }
  }

  const mappedCorners = masterCorners(profile.master).map((point) => applyHomography(matrix, point));
  const outsidePenalty = mappedCorners.reduce((sum, point) => {
    const x = point[0], y = point[1];
    const width = Number(imageSize?.[0] || 1), height = Number(imageSize?.[1] || 1);
    const dx = x < -width * 0.25 ? -width * 0.25 - x : x > width * 1.25 ? x - width * 1.25 : 0;
    const dy = y < -height * 0.25 ? -height * 0.25 - y : y > height * 1.25 ? y - height * 1.25 : 0;
    return sum + Math.hypot(dx, dy) / diagonal;
  }, 0);

  const score = inliers * 110 + fieldScore + anchor.score * 0.7 - outsidePenalty * 400;
  return { matrix, anchor, method, inliers, matched, score };
}

function chooseCalibration(current, candidate) {
  if (!candidate) return current;
  if (!current) return candidate;
  if (candidate.inliers !== current.inliers) return candidate.inliers > current.inliers ? candidate : current;
  return candidate.score > current.score ? candidate : current;
}

function similarityFromTwoPairs(sourceA, sourceB, targetA, targetB) {
  const sourceVector = [sourceB[0] - sourceA[0], sourceB[1] - sourceA[1]];
  const targetVector = [targetB[0] - targetA[0], targetB[1] - targetA[1]];
  const sourceLength = Math.hypot(...sourceVector);
  const targetLength = Math.hypot(...targetVector);
  if (sourceLength < 8 || targetLength < 8) return null;

  const scale = targetLength / sourceLength;
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const angle = Math.atan2(targetVector[1], targetVector[0]) - Math.atan2(sourceVector[1], sourceVector[0]);
  const cosine = Math.cos(angle) * scale;
  const sine = Math.sin(angle) * scale;
  const tx = targetA[0] - cosine * sourceA[0] + sine * sourceA[1];
  const ty = targetA[1] - sine * sourceA[0] - cosine * sourceA[1];
  return [cosine, -sine, tx, sine, cosine, ty, 0, 0, 1];
}

function normalizedQuadCenter(quad, master) {
  if (!Array.isArray(quad) || quad.length !== 8) return null;
  const width = Number(master?.width || 1);
  const height = Number(master?.height || 1);
  return [
    (quad[0] + quad[2] + quad[4] + quad[6]) / 4 * width,
    (quad[1] + quad[3] + quad[5] + quad[7]) / 4 * height,
  ];
}

function rectCenterInMaster(rect, master) {
  if (!rect) return null;
  return [
    (Number(rect.x || 0) + Number(rect.width || 0) / 2) * Number(master?.width || 1),
    (Number(rect.y || 0) + Number(rect.height || 0) / 2) * Number(master?.height || 1),
  ];
}

function masterCorners(master) {
  const width = Number(master?.width || 1);
  const height = Number(master?.height || 1);
  return [[0, 0], [width, 0], [width, height], [0, height]];
}

function mapAllFields(profile, candidates, imageSize, transform) {
  const fields = {};
  for (const key of FIELD_KEYS) {
    const fieldProfile = (profile.fields || []).find((field) => field.key === key);
    fields[key] = fieldProfile
      ? mapField(fieldProfile, candidates, profile, imageSize, transform)
      : emptyField("Für dieses Profil nicht konfiguriert");
  }
  return fields;
}

function refineWithMappedFields(profile, fields, imageSize) {
  const pairs = [];
  const usedEntries = new Set();
  for (const fieldProfile of profile.fields || []) {
    if (!fieldProfile?.rect || fieldProfile.extractor === "drumAfterSlash") continue;
    const mapped = fields?.[fieldProfile.key];
    if (!mapped?.value || !mapped?.valid || !Array.isArray(mapped?.candidateBox)) continue;
    const entryKey = mapped.entryIndices?.join(",") || `${mapped.candidateBox.join(",")}`;
    if (usedEntries.has(entryKey)) continue;
    usedEntries.add(entryKey);
    const source = rectCenterInMaster(fieldProfile.rect, profile.master);
    const targetBounds = quadBounds(mapped.candidateBox);
    pairs.push({ source, target: [targetBounds.centerX, targetBounds.centerY] });
  }
  if (pairs.length < 3) return { used: false, inliers: pairs.length };
  const fitted = fitSimilarity(pairs);
  if (!fitted || !anchorTransformIsSane(fitted.matrix, profile.master, imageSize)) return { used: false, inliers: 0 };
  if (profile?.role === "product" && !productTransformIsPlausible(fitted.matrix, profile.master, imageSize)) {
    return { used: false, inliers: 0 };
  }
  const diagonal = Math.max(1, Math.hypot(Number(imageSize?.[0] || 1), Number(imageSize?.[1] || 1)));
  if (fitted.rms > diagonal * 0.035) return { used: false, inliers: pairs.length, rms: fitted.rms };
  return { used: true, matrix: fitted.matrix, inliers: pairs.length, rms: fitted.rms };
}

function fitSimilarity(pairs) {
  if (!Array.isArray(pairs) || pairs.length < 2) return null;
  const sourceCenter = [
    pairs.reduce((sum, pair) => sum + pair.source[0], 0) / pairs.length,
    pairs.reduce((sum, pair) => sum + pair.source[1], 0) / pairs.length,
  ];
  const targetCenter = [
    pairs.reduce((sum, pair) => sum + pair.target[0], 0) / pairs.length,
    pairs.reduce((sum, pair) => sum + pair.target[1], 0) / pairs.length,
  ];
  let denominator = 0;
  let real = 0;
  let imaginary = 0;
  for (const pair of pairs) {
    const sx = pair.source[0] - sourceCenter[0];
    const sy = pair.source[1] - sourceCenter[1];
    const tx = pair.target[0] - targetCenter[0];
    const ty = pair.target[1] - targetCenter[1];
    denominator += sx * sx + sy * sy;
    real += sx * tx + sy * ty;
    imaginary += sx * ty - sy * tx;
  }
  if (denominator < 1e-6) return null;
  const a = real / denominator;
  const b = imaginary / denominator;
  const tx = targetCenter[0] - a * sourceCenter[0] + b * sourceCenter[1];
  const ty = targetCenter[1] - b * sourceCenter[0] - a * sourceCenter[1];
  const matrix = [a, -b, tx, b, a, ty, 0, 0, 1];
  const rms = Math.sqrt(pairs.reduce((sum, pair) => {
    const mapped = applyHomography(matrix, pair.source);
    return sum + pointDistance(mapped, pair.target) ** 2;
  }, 0) / pairs.length);
  return { matrix, rms };
}

function productTransformIsPlausible(matrix, master, imageSize) {
  const angle = Math.atan2(Number(matrix?.[3] || 0), Number(matrix?.[0] || 1));
  const normalizedAngle = Math.atan2(Math.sin(angle), Math.cos(angle));
  if (Math.abs(normalizedAngle) > Math.PI / 9) return false; // ca. 20°
  const scale = Math.hypot(Number(matrix?.[0] || 0), Number(matrix?.[3] || 0));
  const fitScale = Math.min(
    Number(imageSize?.[0] || 1) / Math.max(1, Number(master?.width || 1)),
    Number(imageSize?.[1] || 1) / Math.max(1, Number(master?.height || 1)),
  );
  if (!Number.isFinite(scale) || scale < fitScale * 0.32 || scale > fitScale * 1.25) return false;
  return true;
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

export function homographyFromAnchor(profile, targetEntry, imageSize = null) {
  const master = profile?.master || {};
  const sourceNormalized = profile?.anchor?.masterQuad;
  if (!Array.isArray(sourceNormalized) || sourceNormalized.length !== 8 || !Array.isArray(targetEntry?.box)) return null;

  const source = [];
  for (let index = 0; index < 8; index += 2) {
    source.push([
      sourceNormalized[index] * Number(master.width || 1),
      sourceNormalized[index + 1] * Number(master.height || 1),
    ]);
  }
  const target = [];
  for (let index = 0; index < 8; index += 2) target.push([targetEntry.box[index], targetEntry.box[index + 1]]);

  const sourceFrame = quadFrame(source);
  const targetFrame = quadFrame(target);
  if (!sourceFrame || !targetFrame) return null;

  /*
   * Der Anker liefert nur Mittelpunkt und Drehung. Seine OCR-Box ist kein
   * verlässlicher Maßstab, weil Master und Live-OCR unterschiedliche Wörter
   * oder Zeilen umfassen können. Als neutrale Startskalierung dient deshalb
   * ausschließlich das Verhältnis der vollständigen Bildabmessungen.
   */
  const fitScale = imageSize
    ? Math.min(
        Number(imageSize?.[0] || 1) / Math.max(1, Number(master.width || 1)),
        Number(imageSize?.[1] || 1) / Math.max(1, Number(master.height || 1)),
      )
    : 1;
  const scale = Number.isFinite(fitScale) && fitScale > 0 ? fitScale : 1;
  const angle = targetFrame.angle - sourceFrame.angle;
  const cosine = Math.cos(angle) * scale;
  const sine = Math.sin(angle) * scale;
  const tx = targetFrame.center[0] - cosine * sourceFrame.center[0] + sine * sourceFrame.center[1];
  const ty = targetFrame.center[1] - sine * sourceFrame.center[0] - cosine * sourceFrame.center[1];
  const matrix = [cosine, -sine, tx, sine, cosine, ty, 0, 0, 1];

  return anchorTransformIsSane(matrix, master, imageSize) ? matrix : null;
}

function quadFrame(points) {
  if (!Array.isArray(points) || points.length !== 4) return null;
  const center = [
    points.reduce((sum, point) => sum + Number(point[0] || 0), 0) / 4,
    points.reduce((sum, point) => sum + Number(point[1] || 0), 0) / 4,
  ];
  const top = [points[1][0] - points[0][0], points[1][1] - points[0][1]];
  const bottom = [points[2][0] - points[3][0], points[2][1] - points[3][1]];
  const left = [points[3][0] - points[0][0], points[3][1] - points[0][1]];
  const right = [points[2][0] - points[1][0], points[2][1] - points[1][1]];
  const horizontal = [(top[0] + bottom[0]) / 2, (top[1] + bottom[1]) / 2];
  const width = (Math.hypot(...top) + Math.hypot(...bottom)) / 2;
  const height = (Math.hypot(...left) + Math.hypot(...right)) / 2;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) return null;
  return { center, width, height, angle: Math.atan2(horizontal[1], horizontal[0]) };
}

function anchorTransformIsSane(matrix, master, imageSize) {
  if (!Array.isArray(matrix) || matrix.length !== 9 || matrix.some((value) => !Number.isFinite(value))) return false;
  if (!imageSize) return true;
  const width = Number(master?.width || 1);
  const height = Number(master?.height || 1);
  const projected = [[0, 0], [width, 0], [width, height], [0, height]].map((point) => applyHomography(matrix, point));
  const bounds = quadBounds(projected.flat());
  const imageWidth = Number(imageSize?.[0] || 1);
  const imageHeight = Number(imageSize?.[1] || 1);
  if (bounds.width < imageWidth * 0.12 || bounds.height < imageHeight * 0.12) return false;
  if (bounds.width > imageWidth * 4 || bounds.height > imageHeight * 4) return false;
  if (bounds.centerX < -imageWidth * 1.5 || bounds.centerX > imageWidth * 2.5) return false;
  if (bounds.centerY < -imageHeight * 1.5 || bounds.centerY > imageHeight * 2.5) return false;
  return true;
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
      const explicitUnit = match[2] || "";
      const unit = (explicitUnit || field.defaultUnit || "").replace("KGM", "KG");
      // Eine beliebige Zahl darf niemals nur wegen eines KG-RegEx als Gewicht
      // gelten. Ohne explizite Einheit ist ein Wert nur mit konfigurierter
      // defaultUnit zulässig.
      if (explicitUnit || field.defaultUnit) output.push({ value: `${number}${unit ? ` ${unit}` : ""}`.trim() });
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
function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }
function uniqueByValue(items) { const seen = new Set(); return items.filter((item) => !seen.has(item.value) && seen.add(item.value)); }
function emptyField(source = "nicht erkannt") { return { value: "", raw: "", score: 0, source, valid: false, manual: false }; }
function emptyFields() { return Object.fromEntries(FIELD_KEYS.map((key) => [key, emptyField()])); }
function unresolved(warning, profiles = []) { return { resolved: false, profile: null, profileScore: 0, anchor: { matched: false, score: 0 }, fields: emptyFields(), warning, alternatives: profiles.map((profile) => ({ id: profile.id, name: profile.name })) }; }
