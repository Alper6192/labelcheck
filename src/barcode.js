export async function readConfiguredCodes(dataUrl, profile) {
  const regions = Array.isArray(profile?.codeRegions) ? profile.codeRegions : [];
  if (!regions.length) return { fields: {}, decoded: [], warning: "" };
  if (!("BarcodeDetector" in globalThis)) {
    return { fields: {}, decoded: [], warning: "Dieser Browser stellt keinen nativen QR-Decoder bereit." };
  }
  try {
    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    const image = await loadImage(dataUrl);
    const codes = await detector.detect(image);
    const decoded = codes.map((code) => code.rawValue).filter(Boolean);
    const fields = {};
    for (const payload of decoded) {
      for (const region of regions) Object.assign(fields, parsePayload(payload, region.parser || {}));
    }
    return { fields, decoded, warning: decoded.length ? "" : "QR-Code wurde auf dem vollständigen Foto nicht gelesen." };
  } catch (error) {
    return { fields: {}, decoded: [], warning: `QR-Lesefehler: ${error.message || error}` };
  }
}

function parsePayload(raw, parser) {
  let cleaned = String(raw || "");
  for (const configured of parser.separators || [":", "\\u001d", "\\r", "\\n"]) {
    const separator = configured === "\\u001d" ? "\u001d" : configured === "\\r" ? "\r" : configured === "\\n" ? "\n" : configured;
    if (separator && separator !== ":") cleaned = cleaned.split(separator).join(":");
  }
  const tokens = cleaned.replace(/[\u001d\r\n]+/g, ":").replace(/::+/g, ":").split(":").map((token) => token.trim()).filter(Boolean);
  const values = {};
  for (const output of parser.outputs || []) {
    let regex; try { regex = new RegExp(output.pattern, output.flags || "i"); } catch { continue; }
    for (const token of tokens) {
      const match = token.match(regex); if (!match) continue;
      let value = String(match[Number(output.group ?? 0)] ?? match[0]);
      if (output.replaceComma) value = value.replace(",", ".");
      if (output.uppercase) value = value.toUpperCase();
      values[output.key || output.semantic] = value;
      if (output.semantic) values[output.semantic] = value;
      break;
    }
  }
  for (const combination of parser.combinations || []) {
    const parts = (combination.parts || []).map((key) => values[key]);
    if (parts.length && parts.every(Boolean)) values[combination.semantic] = parts.join(combination.separator ?? " ");
  }
  const fields = {};
  if (values.batch) fields.batch = field(values.batch, "QR-Code");
  if (values.delivery_note) fields.deliveryNote = field(values.delivery_note, "QR-Code");
  if (values.weight) fields.weight = field(values.weight, "QR-Code");
  return fields;
}
function field(value, source) { return { value, raw: value, score: 100, source, valid: true, manual: false }; }
function loadImage(src) { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error("Bild konnte nicht für den QR-Decoder geladen werden.")); image.src = src; }); }
