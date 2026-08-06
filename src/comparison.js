import { normalizedWeight } from "./profile-engine.js";

export function compareExtractions(product, vda) {
  const keys = ["batch", "idh", "weight"];
  const rows = keys.map((key) => compareField(key, product?.fields?.[key], vda?.fields?.[key]));
  const missing = rows.some((row) => row.status === "missing" || row.status === "invalid");
  const mismatch = rows.some((row) => row.status === "mismatch");
  return {
    released: !missing && !mismatch,
    status: missing ? "review" : mismatch ? "rejected" : "released",
    rows,
    message: missing ? "PRÜFUNG ERFORDERLICH – Pflichtwerte fehlen oder sind unsicher." : mismatch ? "NICHT FREIGEGEBEN – Werte weichen ab." : "FREIGEGEBEN – Batch, IDH und Gewicht stimmen überein."
  };
}

function compareField(key, left, right) {
  if (!left?.value || !right?.value) return row(key,left,right,"missing");
  if (!left.valid || !right.valid) return row(key,left,right,"invalid");
  let equal = left.value === right.value;
  if (key === "weight") {
    const a=normalizedWeight(left.value), b=normalizedWeight(right.value);
    equal = Boolean(a && b && a.unit === b.unit && Math.abs(a.base-b.base) < 0.001);
  }
  return row(key,left,right,equal ? "match" : "mismatch");
}
function row(key,left,right,status){return{key,label:{batch:"Batch",idh:"IDH",weight:"Gewicht"}[key]||key,product:left?.value||"",vda:right?.value||"",status};}
