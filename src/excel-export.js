import * as XLSX from "xlsx";

export async function exportRecordsToExcel(records) {
  if (!records.length) throw new Error("Es sind keine Datensätze vorhanden.");

  const rows = records.map((record, index) => ({
    Laufende_Nummer: index + 1,
    Zeitstempel: record.timestamp,
    Ergebnis: safeCell(record.comparison?.summary || record.status || ""),
    Batch_Produkt: safeCell(record.product?.batch || ""),
    Batch_VDA: safeCell(record.vda?.batch || ""),
    Batch_Prüfung: safeCell(record.comparison?.checks?.batch?.status || ""),
    IDH_Produkt: safeCell(record.product?.idh || ""),
    IDH_VDA: safeCell(record.vda?.idh || ""),
    IDH_Prüfung: safeCell(record.comparison?.checks?.idh?.status || ""),
    Gewicht_Produkt: safeCell(record.product?.weight || ""),
    Gewicht_VDA: safeCell(record.vda?.weight || ""),
    Gewicht_Prüfung: safeCell(record.comparison?.checks?.weight?.status || ""),
    Fassnummer: safeCell(record.vda?.drum || ""),
    Lieferscheinnummer: safeCell(record.vda?.deliveryNote || ""),
    Manuell_korrigiert: record.manuallyCorrected ? "Ja" : "Nein",
    App_Version: safeCell(record.appVersion || ""),
    Modell: safeCell(record.model || ""),
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = Object.keys(rows[0]).map((key) => ({ wch: Math.min(38, Math.max(14, key.length + 3)) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Etikettenprüfungen");
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true });
  const date = new Date().toISOString().slice(0, 10);
  const filename = `Etikettenpruefungen_${date}.xlsx`;
  const file = new File([buffer], filename, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: "Etikettenprüfungen", text: "Excel-Export der Etikettenprüfungen" });
    return;
  }

  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function safeCell(value) {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}
