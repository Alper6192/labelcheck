/**
 * Parser für kundenspezifische 2D-Code-Inhalte.
 * Aktuell: Tesla-Versandlabel. Alle Werte werden direkt aus dem kleinen QR-Code
 * links unten gelesen; sichtbarer OCR-Text ist dafür nicht erforderlich.
 */
export function parseTeslaQrPayload(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const batch = capture(raw, /(?:^|:)1T(D\d{8,10})(?=:|$)/i);
  const deliveryNote = capture(raw, /(?:^|:)99Z(\d{7,12})(?=:|$)/i);
  const quantity = capture(raw, /(?:^|:)Q(\d+(?:[.,]\d+)?)(?=:|$)/i);
  let unit = capture(raw, /(?:^|:)3Q(KGM?|G|L|LTR)(?=:|$)/i) || "KG";
  if (unit.toUpperCase() === "KGM") unit = "KG";

  // Diese drei Application-Identifier bilden das Tesla-Layout ab, das in
  // LabelCheck verwendet wird. Ohne sie wird der Code nicht als Tesla erkannt.
  if (!batch || !deliveryNote || !quantity) return null;

  return {
    parser: "tesla",
    raw,
    fields: {
      batch: batch.toUpperCase(),
      delivery_note: deliveryNote,
      weight: `${quantity.replace(",", ".")} ${unit.toUpperCase()}`,
      idh: ""
    }
  };
}

export function parseQrPayload(parser, raw) {
  if (String(parser || "").toLowerCase() === "tesla") return parseTeslaQrPayload(raw);
  return null;
}

function capture(text, regex) {
  return text.match(regex)?.[1] || "";
}
