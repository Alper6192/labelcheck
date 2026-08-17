/**
 * Generischer QR-Parser. Die komplette Zuordnung des QR-Inhalts zu den festen
 * LabelCheck-Feldern kommt aus profile.source.parser in label-profiles.json.
 * Neue QR-Formate benötigen dadurch keinen kundenspezifischen JavaScript-Parser.
 */
export function parseQrPayload(parserConfig, value) {
  const raw = String(value || "").trim();
  if (!raw || !parserConfig || typeof parserConfig !== "object") return null;

  const fields = {};
  for (const [key, rule] of Object.entries(parserConfig.fields || {})) {
    const parsed = parseFieldRule(raw, rule);
    if (parsed !== "") fields[key] = parsed;
  }

  const requiredFields = Array.isArray(parserConfig.requiredFields)
    ? parserConfig.requiredFields
    : [];
  if (requiredFields.some((key) => !String(fields[key] || "").trim())) return null;
  if (!Object.keys(fields).length) return null;

  return {
    parser: "config",
    raw,
    fields
  };
}

export function parseFieldRule(raw, rule = {}) {
  const primaryPattern = String(rule.primaryRegex || "").trim();
  const primary = capture(raw, primaryPattern, rule.primaryGroup);
  // Sobald ein Primär-RegEx konfiguriert ist, ist dessen Treffer die Basis des
  // Feldes. Ein Sekundär-Fallback (z. B. eine Einheit) darf niemals allein ein
  // scheinbar vollständiges Feld erzeugen.
  if (primaryPattern && !primary) return "";
  if (!primary && !String(rule.secondaryRegex || "").trim() && !String(rule.secondaryDefault || "")) return "";

  let secondary = capture(raw, rule.secondaryRegex, rule.secondaryGroup);
  if (!secondary) secondary = String(rule.secondaryDefault || "");

  let value = String(rule.template || "{primary}")
    .replaceAll("{primary}", primary)
    .replaceAll("{secondary}", secondary)
    .trim();

  for (const replacement of rule.replacements || []) {
    const from = String(replacement?.from || "");
    if (!from) continue;
    value = value.replace(new RegExp(escapeRegex(from), "gi"), String(replacement?.to || ""));
  }
  return value.replace(/\s+/g, " ").trim();
}

function capture(text, pattern, group = 1) {
  const source = String(pattern || "").trim();
  if (!source) return "";
  try {
    const match = String(text || "").match(new RegExp(source, "i"));
    if (!match) return "";
    const index = Math.max(0, Math.floor(Number(group ?? 1)));
    return String(match[index] ?? "").trim();
  } catch {
    return "";
  }
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
