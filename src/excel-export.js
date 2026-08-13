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
      // title wird zusätzlich gesetzt, damit Android-Share-Sheets und Ziel-Apps
      // den gewünschten Dateinamen auch als sichtbaren Titel erhalten.
      await navigatorLike.share({ files: [file], title: file.name, text: file.name });
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
    Zeit: formatLocalTimestamp(record.timestamp),
    Ergebnis: resultLabel(record),
    "Batch Produkt": safe(record.product?.batch),
    "Batch Lieferschein": safe(record.vda?.batch),
    "IDH Produkt": safe(record.product?.idh),
    "IDH Lieferschein": safe(record.vda?.idh),
    "Gewicht Produkt": safe(record.product?.weight),
    "Gewicht Lieferschein": safe(record.vda?.weight),
    Lieferscheinnummer: safe(record.vda?.delivery_note),
    "Fassnummer Produkt": safe(record.product?.drum_number),
    Lieferscheinprofil: safe(record.vdaProfile),
    "Manuell korrigiert": record.manual ? "Ja" : "Nein"
  }));
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
