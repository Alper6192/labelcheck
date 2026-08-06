import { normalizedWeight } from "./profile-engine.js";

export function compareExtractions(product, vda) {
  const keys = ["batch", "idh", "weight"];
  const rows = keys.map((key) => compareField(key, product?.fields?.[key], vda?.fields?.[key]));
  const requiredIssue = hasRequiredIssue(product) || hasRequiredIssue(vda);
  const rowIssue = rows.some((row) => row.status === "missing" || row.status === "invalid");
  const mismatch = rows.some((row) => row.status === "mismatch");
  const needsReview = requiredIssue || rowIssue;
  return {
    released: !needsReview && !mismatch,
    status: needsReview ? "review" : mismatch ? "rejected" : "released",
    rows,
    message: needsReview
      ? "PRÜFUNG ERFORDERLICH – Pflichtwerte wie Batch, IDH, Gewicht oder Fassnummer fehlen bzw. sind unsicher."
      : mismatch
        ? "NICHT FREIGEGEBEN – Werte weichen ab."
        : "FREIGEGEBEN – Batch, IDH und Gewicht stimmen überein."
  };
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
