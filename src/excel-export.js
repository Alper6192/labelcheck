import * as XLSX from "xlsx";

export const LOG_COLUMNS = [
  { key: "Zeit", width: 20 },
  { key: "Ergebnis", width: 24 },
  { key: "Batch Produkt", width: 20 },
  { key: "Batch Lieferschein", width: 22 },
  { key: "IDH Produkt", width: 18 },
  { key: "IDH Lieferschein", width: 20 },
  { key: "Gewicht Produkt", width: 20 },
  { key: "Gewicht Lieferschein", width: 22 },
  { key: "Lieferscheinnummer", width: 22 },
  { key: "Fassnummer Produkt", width: 20 },
  { key: "Lieferscheinprofil", width: 22 },
  { key: "Manuell korrigiert", width: 20 }
];

export function recordsToRows(records) {
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

export function exportRecords(records) {
  const rows = recordsToRows(records);
  const ws = XLSX.utils.json_to_sheet(rows, { header: LOG_COLUMNS.map((column) => column.key) });
  ws["!cols"] = LOG_COLUMNS.map((column) => ({ wch: column.width }));
  if (rows.length) ws["!autofilter"] = { ref: `A1:L${rows.length + 1}` };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Kontrollen");
  XLSX.writeFile(wb, excelFilename(new Date()));
}

export function excelFilename(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `Labelcheck_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}.xlsx`;
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
