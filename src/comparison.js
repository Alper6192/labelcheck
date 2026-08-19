import { FIELD_RECOGNITION_THRESHOLD } from "./config.js";

export function compareExtractions(product, vda) {
  // Freigaberelevant bleibt ausschließlich die Batchnummer.
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
  const manualInputRequiredFields = [
    ...collectManualInputRequiredFields(product, "Produkt"),
    ...collectManualInputRequiredFields(vda, "VDA")
  ];
  const validationIssues = [
    ...collectValidationIssues(product, "Produkt"),
    ...collectValidationIssues(vda, "VDA")
  ];
  const manualFields = [
    ...collectManualFields(product, "Produkt"),
    ...collectManualFields(vda, "VDA")
  ];
  // Jede manuelle Eingabe verlangt weiterhin eine ausdrückliche Bedienerbestätigung.
  // Solange orange markierte Felder noch leer/ungültig sind, kann diese Bestätigung
  // noch nicht durchgeführt werden.
  const needsReview = extractionIssue || batchIssue || rowIssue || lowConfidenceFields.length > 0
    || manualInputRequiredFields.length > 0 || validationIssues.length > 0 || manualFields.length > 0;

  return {
    released: !needsReview && !mismatch,
    batchMismatch: mismatch,
    status: needsReview ? "review" : mismatch ? "rejected" : "released",
    rows,
    lowConfidenceFields,
    manualInputRequiredFields,
    validationIssues,
    manualFields,
    reviewRequired: needsReview,
    message: needsReview
      ? reviewMessage({ extractionIssue, batchIssue: batchIssue || rowIssue, lowConfidenceFields, manualInputRequiredFields, validationIssues, manualFields })
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
  return Boolean(left && right);
}

function hasBatchIssue(extraction) {
  const batch = extraction?.fields?.batch;
  return !batch?.value || !batch?.valid;
}

function fieldLabel(key, field, sideLabel) {
  const labels = {
    batch: "Batch",
    idh: "IDH",
    weight: "Gewicht",
    delivery_note: "Lieferscheinnummer",
    drum_number: "Fassnummer"
  };
  return `${labels[key] || field?.label || key} ${sideLabel}`;
}

function collectLowConfidenceFields(extraction, sideLabel) {
  const output = [];
  for (const [key, field] of Object.entries(extraction?.fields || {})) {
    if (field?.source === "manual" || field?.source === "qr") continue;
    const confidence = Number(field?.confidence);
    if (!Number.isFinite(confidence) || confidence >= FIELD_RECOGNITION_THRESHOLD || !String(field?.raw || field?.recognizedValue || field?.value || "").trim()) continue;
    output.push({
      key,
      side: sideLabel,
      label: fieldLabel(key, field, sideLabel),
      confidence
    });
  }
  return output;
}

function collectManualInputRequiredFields(extraction, sideLabel) {
  const output = [];
  for (const [key, field] of Object.entries(extraction?.fields || {})) {
    const confidence = Number(field?.confidence);
    const automaticLowConfidence = field?.source !== "manual" && field?.source !== "qr"
      && Number.isFinite(confidence) && confidence < FIELD_RECOGNITION_THRESHOLD
      && Boolean(String(field?.raw || field?.recognizedValue || field?.value || "").trim());
    const missingAutomaticValue = field?.source === "missing" || (!field?.value && field?.source !== "manual" && field?.source !== "qr" && !String(field?.raw || "").trim());
    if (!field?.requiresManualInput && !automaticLowConfidence && !missingAutomaticValue) continue;
    output.push({
      key,
      side: sideLabel,
      label: fieldLabel(key, field, sideLabel),
      confidence: Number(field?.confidence || 0),
      reason: field?.rejectedReason || (field?.source === "missing" ? "nicht erkannt" : "manuelle Eingabe erforderlich")
    });
  }
  return output;
}

function collectValidationIssues(extraction, sideLabel) {
  return (extraction?.validationIssues || []).map((issue) => ({ ...issue, side: sideLabel }));
}

function collectManualFields(extraction, sideLabel) {
  return Object.entries(extraction?.fields || {})
    .filter(([, field]) => field?.source === "manual" && field?.valid)
    .map(([key, field]) => ({
      key,
      side: sideLabel,
      label: fieldLabel(key, field, sideLabel)
    }));
}

function reviewMessage({ extractionIssue, batchIssue, lowConfidenceFields, manualInputRequiredFields, validationIssues, manualFields }) {
  const reasons = [];
  if (manualInputRequiredFields.length) {
    reasons.push(`bitte orange Felder manuell ausfüllen: ${manualInputRequiredFields.map((field) => field.label).join(", ")}`);
  } else if (batchIssue) reasons.push("Batchnummer fehlt bzw. ist unsicher");
  else if (extractionIssue) reasons.push("Erkennung ist unvollständig oder unsicher");

  if (lowConfidenceFields.length) {
    const fields = lowConfidenceFields
      .map((field) => `${field.label} (${(field.confidence * 100).toFixed(0)} %)`)
      .join(", ");
    reasons.push(`Erkennungsquote unter 80 %: ${fields}`);
  }

  if (validationIssues.length) {
    const duplicateCount = validationIssues.filter((issue) => issue.type === "duplicate").length;
    const weightCount = validationIssues.filter((issue) => issue.type === "weight-limit").length;
    if (duplicateCount) reasons.push("doppelte Feldbelegung wurde verhindert");
    if (weightCount) reasons.push("unplausibles Gewicht wurde verworfen");
  }

  if (!manualInputRequiredFields.length && manualFields.length) {
    reasons.push(`manuell eingegeben: ${manualFields.map((field) => field.label).join(", ")}`);
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
