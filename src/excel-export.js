import * as XLSX from "xlsx";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function createExcelFile(records, date = new Date()) {
  const wb = createWorkbook(records);
  const data = XLSX.write(wb, {
    bookType: "xlsx",
    type: "array",
    compression: true
  });
  return new File([data], excelFilename(date), {
    type: XLSX_MIME,
    lastModified: date.getTime()
  });
}

export async function exportRecords(records, navigatorLike = globalThis.navigator) {
  const file = createExcelFile(records, new Date());

  // Web Share Level 2: Auf unterstützten Mobilbrowsern wird die XLSX-Datei
  // direkt an das native Teilen-Menü übergeben (z. B. OneDrive auf Android).
  // Wichtig: Bis navigator.share() gibt es hier bewusst kein await, damit die
  // für Web Share nötige direkte Benutzeraktivierung erhalten bleibt.
  if (canShareFile(file, navigatorLike)) {
    try {
      await navigatorLike.share({ files: [file] });
      return { method: "share", filename: file.name };
    } catch (error) {
      // Abbruch durch den Benutzer soll keinen unerwarteten Download auslösen.
      if (error?.name === "AbortError") {
        return { method: "cancelled", filename: file.name };
      }
      // Manche Browser melden Datei-Sharing erst beim share()-Aufruf als
      // nicht unterstützt. In diesem Fall fällt LabelCheck auf Download zurück.
    }
  }

  downloadFile(file);
  return { method: "download", filename: file.name };
}

export function canShareFile(file, navigatorLike = globalThis.navigator) {
  if (!navigatorLike || typeof navigatorLike.share !== "function") return false;
  if (typeof navigatorLike.canShare !== "function") return true;
  try {
    return navigatorLike.canShare({ files: [file] });
  } catch {
    return false;
  }
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
  // Nicht sofort widerrufen: einige Android-Browser benötigen den Blob-URL
  // noch kurz, nachdem der Klick ausgelöst wurde.
  setTimeout(() => urlLike.revokeObjectURL(href), 1500);
}

export function excelFilename(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `Labelcheck_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}.xlsx`;
}

function createWorkbook(records) {
  const rows = (records || []).map((record, index) => ({
    Nr: index + 1,
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
    Produktprofil: safe(record.productProfile),
    Lieferscheinprofil: safe(record.vdaProfile),
    "Manuell korrigiert": record.manual ? "Ja" : "Nein"
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 6 }, { wch: 20 }, { wch: 24 },
    { wch: 20 }, { wch: 22 }, { wch: 18 }, { wch: 20 },
    { wch: 20 }, { wch: 22 }, { wch: 22 }, { wch: 20 },
    { wch: 22 }, { wch: 24 }, { wch: 20 }
  ];
  if (rows.length) ws["!autofilter"] = { ref: `A1:N${rows.length + 1}` };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Kontrollen");
  return wb;
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
