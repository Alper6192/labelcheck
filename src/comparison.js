import { COMPARISON_PROFILE, WEIGHT_TOLERANCE } from "./config.js";

export function compareLabels(productFields, vdaFields) {
  const checks = {
    batch: compareText("batch", productFields.batch?.value, vdaFields.batch?.value, normalizeBatch),
    idh: compareText("idh", productFields.idh?.value, vdaFields.idh?.value, normalizeDigits),
    weight: compareWeights(productFields.weight?.value, vdaFields.weight?.value),
  };

  const blocking = Object.entries(checks).filter(([key, check]) => COMPARISON_PROFILE[key]?.required && check.status !== "match");
  const mismatches = Object.values(checks).filter((check) => check.status === "mismatch");
  const missing = Object.values(checks).filter((check) => check.status === "missing");

  return {
    released: blocking.length === 0,
    status: blocking.length === 0 ? "released" : mismatches.length ? "rejected" : "review",
    checks,
    summary: blocking.length === 0
      ? "FREIGEGEBEN – alle Pflichtvergleiche stimmen überein."
      : mismatches.length
        ? `NICHT FREIGEGEBEN – ${mismatches.map((item) => item.label).join(", ")} stimmt nicht überein.`
        : `PRÜFUNG ERFORDERLICH – ${missing.map((item) => item.label).join(", ")} fehlt oder wurde nicht sicher erkannt.`,
  };
}

function compareText(key, left, right, normalizer) {
  const label = COMPARISON_PROFILE[key]?.label || key;
  const a = normalizer(left);
  const b = normalizer(right);
  if (!a || !b) return { key, label, status: "missing", left: left || "", right: right || "" };
  return { key, label, status: a === b ? "match" : "mismatch", left: left || "", right: right || "" };
}

function compareWeights(left, right) {
  const label = COMPARISON_PROFILE.weight.label;
  const a = parseWeight(left);
  const b = parseWeight(right);
  if (!a || !b) return { key: "weight", label, status: "missing", left: left || "", right: right || "" };
  if (a.family !== b.family) return { key: "weight", label, status: "mismatch", left, right };
  const matched = Math.abs(a.baseValue - b.baseValue) <= WEIGHT_TOLERANCE;
  return { key: "weight", label, status: matched ? "match" : "mismatch", left, right };
}

export function normalizeBatch(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function normalizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

export function parseWeight(value) {
  const match = String(value || "").toUpperCase().replace(/,/g, ".").match(/([0-9]+(?:\.[0-9]+)?)\s*(KG|G|L|LTR|LITER)/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === "KG") return { family: "mass", baseValue: amount, unit: "KG" };
  if (unit === "G") return { family: "mass", baseValue: amount / 1000, unit: "G" };
  return { family: "volume", baseValue: amount, unit: "L" };
}
