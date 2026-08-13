export function compareExtractions(product, vda) {
  // Freigaberelevant ist ab 0.16.11 ausschließlich die Batchnummer.
  // IDH und Gewicht bleiben sichtbar/gespeichert, beeinflussen die Freigabe aber nicht.
  const keys = ["batch"];
  const rows = keys
    .filter((key) => shouldCompareBatch(product?.fields?.[key], vda?.fields?.[key]))
    .map((key) => compareField(key, product?.fields?.[key], vda?.fields?.[key]));

  const extractionIssue = hasExtractionIssue(product) || hasExtractionIssue(vda);
  const batchIssue = hasBatchIssue(product) || hasBatchIssue(vda);
  const rowIssue = rows.some((row) => row.status === "missing" || row.status === "invalid");
  const mismatch = rows.some((row) => row.status === "mismatch");
  const needsReview = extractionIssue || batchIssue || rowIssue;

  return {
    released: !needsReview && !mismatch,
    status: needsReview ? "review" : mismatch ? "rejected" : "released",
    rows,
    message: needsReview
      ? "PRÜFUNG ERFORDERLICH – Batchnummer fehlt bzw. ist unsicher."
      : mismatch
        ? "NICHT FREIGEGEBEN – Batchnummern weichen ab."
        : "FREIGEGEBEN – Batchnummer stimmt überein."
  };
}

function hasExtractionIssue(extraction) {
  if (!extraction || String(extraction.warning || "").trim()) return true;
  return !Object.keys(extraction.fields || {}).length;
}

function shouldCompareBatch(left, right) {
  // Auch wenn eine ältere JSON compare-Flags für IDH/Gewicht enthält,
  // entscheidet die Freigabe ausschließlich über Batch.
  return Boolean(left && right);
}

function hasBatchIssue(extraction) {
  const batch = extraction?.fields?.batch;
  return !batch?.value || !batch?.valid;
}

function compareField(key, left, right) {
  if (!left?.value || !right?.value) return row(key, left, right, "missing");
  if (!left.valid || !right.valid) return row(key, left, right, "invalid");
  return row(key, left, right, left.value === right.value ? "match" : "mismatch");
}

function row(key, left, right, status) {
  return {
    key,
    label: key === "batch" ? "Batch" : key,
    product: left?.value || "",
    vda: right?.value || "",
    status
  };
}
