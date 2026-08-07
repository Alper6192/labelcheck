import { normalizedWeight } from "./profile-engine.js";

export function compareExtractions(product, vda) {
  const keys = ["batch", "idh", "weight"];
  const rows = keys
    .filter((key) => shouldCompare(product?.fields?.[key], vda?.fields?.[key]))
    .map((key) => compareField(key, product?.fields?.[key], vda?.fields?.[key]));

  const extractionIssue = hasExtractionIssue(product) || hasExtractionIssue(vda);
  const requiredIssue = hasRequiredIssue(product) || hasRequiredIssue(vda);
  const rowIssue = rows.some((row) => row.status === "missing" || row.status === "invalid");
  const mismatch = rows.some((row) => row.status === "mismatch");
  const needsReview = extractionIssue || requiredIssue || rowIssue;
  const comparedLabels = rows.map((row) => row.label).join(", ");

  return {
    released: !needsReview && !mismatch,
    status: needsReview ? "review" : mismatch ? "rejected" : "released",
    rows,
    message: needsReview
      ? "PRÜFUNG ERFORDERLICH – Pflichtwerte fehlen bzw. sind unsicher."
      : mismatch
        ? "NICHT FREIGEGEBEN – Werte weichen ab."
        : `FREIGEGEBEN – ${comparedLabels || "Konfigurierte Werte"} stimmen überein.`
  };
}

function hasExtractionIssue(extraction) {
  if (!extraction || String(extraction.warning || "").trim()) return true;
  return !Object.keys(extraction.fields || {}).length;
}

function shouldCompare(left, right) {
  return Boolean(left?.compare && right?.compare);
}

function hasRequiredIssue(extraction) {
  return Object.values(extraction?.fields || {}).some((field) => field.required && (!field.value || !field.valid));
}

function compareField(key, left, right) {
  if (!left?.value || !right?.value) return row(key, left, right, "missing");
  if (!left.valid || !right.valid) return row(key, left, right, "invalid");
  let equal = left.value === right.value;
  if (key === "weight") {
    const a = normalizedWeight(left.value);
    const b = normalizedWeight(right.value);
    equal = Boolean(a && b && a.unit === b.unit && Math.abs(a.base - b.base) < 0.001);
  }
  return row(key, left, right, equal ? "match" : "mismatch");
}

function row(key, left, right, status) {
  return {
    key,
    label: { batch: "Batch", idh: "IDH", weight: "Gewicht" }[key] || key,
    product: left?.value || "",
    vda: right?.value || "",
    status
  };
}
