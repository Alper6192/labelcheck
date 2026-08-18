import * as XLSX from "xlsx";

export const CSV_MIME = "text/csv";

export function csvFilename(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `Labelcheck_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}.csv`;
}

export function createCsvFile(records, date = new Date()) {
  const rows = createRows(records);
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws, { FS: ";", RS: "\r\n" });
  const filename = csvFilename(date);
  return new File(["\uFEFF", csv], filename, {
    type: CSV_MIME,
    lastModified: date.getTime()
  });
}

export async function exportRecords(records, navigatorLike = globalThis.navigator, options = {}) {
  const date = options?.date instanceof Date ? options.date : new Date(options?.date || Date.now());
  const file = createCsvFile(records, date);

  if (navigatorLike && typeof navigatorLike.share === "function") {
    try {
      // Nur die Datei teilen. Zusätzlicher title/text-Payload kann insbesondere
      // auf iOS als separates Textelement bzw. zusätzliche Textdatei auftauchen.
      await navigatorLike.share({ files: [file] });
      return { method: "share-csv", filename: file.name };
    } catch (error) {
      if (error?.name === "AbortError") {
        return { method: "cancelled", filename: file.name };
      }
    }
  }

  downloadFile(file);
  return { method: "download-csv", filename: file.name, reason: "file-share-unavailable" };
}

export function downloadCsvRecords(records, date = new Date()) {
  const file = createCsvFile(records, date);
  downloadFile(file);
  return { method: "download-csv", filename: file.name };
}

export function downloadFile(file, documentLike = globalThis.document, urlLike = globalThis.URL) {
  const href = urlLike.createObjectURL(file);
  const anchor = documentLike.createElement("a");
  anchor.href = href;
  anchor.download = file.name;
  anchor.style.display = "none";
  documentLike.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => urlLike.revokeObjectURL(href), 1500);
}

function createRows(records) {
  return (records || []).map((record) => ({
    "Zeit": formatLocalTimestamp(record.timestamp),
    "Ergebnis": resultLabel(record),
    "Manuell korrigiert": manualCorrectionLabel(record),
    "Lieferscheinnummer / TA-Nummer": safe(record.vda?.delivery_note),
    "Fassnummer": safe(record.product?.drum_number || record.vda?.drum_number),
    "Batch Produkt": safe(record.product?.batch),
    "Batch VDA / TA": safe(record.vda?.batch),
    "IDH Produkt": safe(record.product?.idh),
    "IDH VDA / TA": safe(record.vda?.idh),
    "Gewicht Produkt": safe(record.product?.weight),
    "Gewicht VDA / TA": safe(record.vda?.weight),
    "Labelprofil - VDA / TA": safe(record.vdaProfile)
  }));
}

export function manualCorrectionLabel(record) {
  const corrections = Array.isArray(record?.manualCorrections)
    ? record.manualCorrections.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  if (corrections.length) return corrections.join(", ");
  // Ältere gespeicherte Datensätze kennen nur das bisherige Ja/Nein-Feld.
  return record?.manual ? "Ja" : "";
}

function formatLocalTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  const pad = (number) => String(number).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function resultLabel(record) {
  const status = String(record?.status || "").toLowerCase();
  if (status === "released") return "FREIGEGEBEN";
  if (status === "rejected") return "NICHT FREIGEGEBEN";
  if (status === "review") return "PRÜFUNG ERFORDERLICH";
  const message = String(record?.result || "");
  if (message.startsWith("FREIGEGEBEN")) return "FREIGEGEBEN";
  if (message.startsWith("NICHT FREIGEGEBEN")) return "NICHT FREIGEGEBEN";
  if (message.startsWith("PRÜFUNG ERFORDERLICH")) return "PRÜFUNG ERFORDERLICH";
  return message;
}

function safe(value) {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}
