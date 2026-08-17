const REVIEW_CONFIDENCE_THRESHOLD = 0.60;

export function compareExtractions(product, vda) {
  // Freigaberelevant bleibt ausschließlich die Batchnummer.
  // IDH und Gewicht bleiben sichtbar/gespeichert, beeinflussen die Freigabe
  // aber nur dann indirekt, wenn ihre Erkennung eine Bedienerprüfung erfordert.
  const keys = ["batch"];
  const rows = keys
    .filter((key) => shouldCompareBatch(product?.fields?.[key], vda?.fields?.[key]))
    .map((key) => compareField(key, product?.fields?.[key], vda?.fields?.[key]));

  const extractionIssue = hasExtractionIssue(product) || hasExtractionIssue(vda);
  const batchIssue = hasBatchIssue(product) || hasBatchIssue(vda);
  const rowIssue = rows.some((row) => row.status === "missing" || row.status === "invalid");
  const mismatch = rows.some((row) => row.status === "mismatch");
  const lowConfidenceFields = [
    ...collectLowConfidenceFields(product, "Produkt"),
    ...collectLowConfidenceFields(vda, "VDA")
  ];
  const validationIssues = [
    ...collectValidationIssues(product, "Produkt"),
    ...collectValidationIssues(vda, "VDA")
  ];
  const needsReview = extractionIssue || batchIssue || rowIssue || lowConfidenceFields.length > 0 || validationIssues.length > 0;

  return {
    released: !needsReview && !mismatch,
    status: needsReview ? "review" : mismatch ? "rejected" : "released",
    rows,
    lowConfidenceFields,
    validationIssues,
    reviewRequired: needsReview,
    message: needsReview
      ? reviewMessage({ extractionIssue, batchIssue: batchIssue || rowIssue, lowConfidenceFields, validationIssues })
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

function collectLowConfidenceFields(extraction, sideLabel) {
  const labels = {
    batch: "Batch",
    idh: "IDH",
    weight: "Gewicht",
    delivery_note: "Lieferscheinnummer",
    drum_number: "Fassnummer"
  };
  const output = [];
  for (const [key, field] of Object.entries(extraction?.fields || {})) {
    if (!field?.value) continue;
    if (field.source === "manual" || field.source === "qr") continue;
    const confidence = Number(field.confidence);
    if (!Number.isFinite(confidence) || confidence >= REVIEW_CONFIDENCE_THRESHOLD) continue;
    output.push({
      key,
      side: sideLabel,
      label: `${labels[key] || field.label || key} ${sideLabel}`,
      confidence
    });
  }
  return output;
}

function collectValidationIssues(extraction, sideLabel) {
  return (extraction?.validationIssues || []).map((issue) => ({ ...issue, side: sideLabel }));
}

function reviewMessage({ extractionIssue, batchIssue, lowConfidenceFields, validationIssues }) {
  const reasons = [];
  if (batchIssue) reasons.push("Batchnummer fehlt bzw. ist unsicher");
  else if (extractionIssue) reasons.push("Erkennung ist unvollständig oder unsicher");

  if (lowConfidenceFields.length) {
    const fields = lowConfidenceFields
      .map((field) => `${field.label} (${(field.confidence * 100).toFixed(0)} %)`)
      .join(", ");
    reasons.push(`Erkennungsquote unter 60 %: ${fields}`);
  }

  if (validationIssues.length) {
    const duplicateCount = validationIssues.filter((issue) => issue.type === "duplicate").length;
    const weightCount = validationIssues.filter((issue) => issue.type === "weight-limit").length;
    if (duplicateCount) reasons.push("doppelte Feldbelegung wurde verhindert");
    if (weightCount) reasons.push("unplausibles Gewicht wurde verworfen");
  }

  return `ÜBERPRÜFEN – ${reasons.join(" · ") || "erkannte Werte kontrollieren"}.`;
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
