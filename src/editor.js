import "./styles.css";
import { APP_VERSION, QUALITY_PRESETS } from "./config.js";
import { PaddleOcrEngine } from "./ocr-engine.js";
import { prepareImage } from "./image-tools.js";
import { boundsFromPoly, formatMilliseconds, safeError } from "./utils.js";
import {
  FIELD_ORDER,
  createField,
  createProfile,
  expandPoly,
  findField,
  normalizeProfileConfig,
  polyToRect,
  rectToPoly,
  safeProfileId,
  upsertField,
  validateRegex
} from "./profile-schema.js";
import {
  applyRectDrag,
  hitTestRect,
  pointerToNormalized,
  polyFromPixelPoly,
  rectFromPoints,
  scaledPoly,
  updateAssignmentRect
} from "./editor-geometry.js";

const engine = new PaddleOcrEngine();
const el = (id) => document.getElementById(id);
const state = {
  config: normalizeProfileConfig({ profiles: [] }, APP_VERSION),
  selectedProfileId: "",
  prepared: null,
  ocrResult: null,
  selection: null,
  selectedAssignment: null,
  mode: "select",
  drag: null,
  dirty: false,
  masterFileName: ""
};

el("version").textContent = `v${APP_VERSION}`;
setupEvents();
loadRepositoryConfig();
initializeEngine().catch(() => undefined);

function setupEvents() {
  el("reloadConfigButton").onclick = () => loadRepositoryConfig(true);
  el("configInput").addEventListener("change", importConfig);
  el("exportConfigButton").onclick = exportConfig;
  el("newProfileButton").onclick = newProfile;
  el("duplicateProfileButton").onclick = duplicateProfile;
  el("deleteProfileButton").onclick = deleteProfile;
  el("profileSelect").addEventListener("change", () => selectProfile(el("profileSelect").value));

  for (const id of ["profileId", "profileName", "profileRole", "profileActive", "anchorAliases"]) {
    el(id).addEventListener(id === "profileActive" ? "change" : "input", updateProfileMeta);
  }

  el("masterInput").addEventListener("change", loadMasterImage);
  el("runOcrButton").onclick = runOcr;
  el("initializeEditorButton").onclick = () => initializeEngine(true);
  el("clearOcrButton").onclick = () => {
    state.ocrResult = null;
    state.selection = null;
    drawOverlay();
    renderSelectionInfo();
  };

  el("selectModeButton").onclick = () => setMode("select");
  el("drawModeButton").onclick = () => setMode("draw");
  el("editModeButton").onclick = () => setMode("edit");
  el("paddingInput").addEventListener("input", () => {
    el("paddingValue").textContent = `${el("paddingInput").value} %`;
  });
  el("assignAnchorButton").onclick = assignAnchor;
  document.querySelectorAll("[data-field]").forEach((button) => {
    button.addEventListener("click", () => assignField(button.dataset.field));
  });

  const overlay = el("editorOverlayCanvas");
  overlay.addEventListener("pointerdown", pointerDown);
  overlay.addEventListener("pointermove", pointerMove);
  overlay.addEventListener("pointerup", pointerUp);
  overlay.addEventListener("pointercancel", pointerUp);

  for (const id of [
    "fieldLabel", "fieldRegex", "fieldSourceRegex", "fieldNormalizer",
    "fieldDigits", "fieldAdjacentTo", "fieldRequired", "fieldCompare"
  ]) {
    el(id).addEventListener(["fieldRequired", "fieldCompare"].includes(id) ? "change" : "input", updateFieldProperties);
  }
  el("deleteAssignmentButton").onclick = deleteSelectedAssignment;
  window.addEventListener("beforeunload", (event) => {
    if (!state.dirty) return;
    event.preventDefault();
  });
}

async function loadRepositoryConfig(confirmReplace = false) {
  if (confirmReplace && state.dirty && !confirm("Nicht exportierte Änderungen verwerfen und Repository-Konfiguration neu laden?")) return;
  setConfigStatus("Repository-Konfiguration wird geladen …", "wait");
  try {
    const response = await fetch(new URL(`./config/label-profiles.json?t=${Date.now()}`, window.location.href), { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.config = normalizeProfileConfig(await response.json(), APP_VERSION);
    state.dirty = false;
    const first = state.config.profiles[0]?.id || "";
    renderProfileList();
    selectProfile(first);
    setConfigStatus(`${state.config.profiles.length} Profile geladen`, "ok");
  } catch (error) {
    setConfigStatus(`Konfiguration konnte nicht geladen werden: ${safeError(error)}`, "bad");
  }
}

async function importConfig(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    state.config = normalizeProfileConfig(JSON.parse(await file.text()), APP_VERSION);
    state.dirty = true;
    renderProfileList();
    selectProfile(state.config.profiles[0]?.id || "");
    setConfigStatus(`${state.config.profiles.length} Profile importiert – noch nicht exportiert`, "warn");
  } catch (error) {
    setConfigStatus(`JSON-Import fehlgeschlagen: ${safeError(error)}`, "bad");
  }
}

function exportConfig() {
  syncProfileMeta();
  state.config.schemaVersion = 2;
  state.config.appVersion = APP_VERSION;
  state.config.exportedAt = new Date().toISOString();
  const warnings = validateConfig(state.config);
  if (warnings.length && !confirm(`Die Konfiguration enthält Hinweise:\n\n${warnings.join("\n")}\n\nTrotzdem exportieren?`)) return;
  download(JSON.stringify(state.config, null, 2), "label-profiles.json", "application/json");
  state.dirty = false;
  setConfigStatus(`${state.config.profiles.length} Profile exportiert`, "ok");
}

function validateConfig(config) {
  const warnings = [];
  for (const profile of config.profiles) {
    if (!profile.id) warnings.push("Ein Profil besitzt keine ID.");
    if (!profile.anchor?.aliases?.length) warnings.push(`${profile.name}: keine Anker-Aliase.`);
    if ((profile.anchor?.poly || []).length < 4) warnings.push(`${profile.name}: kein Ankerbereich.`);
    for (const key of ["batch", "idh", "weight"]) {
      if (!findField(profile, key)) warnings.push(`${profile.name}: ${key} fehlt.`);
    }
    for (const field of profile.fields || []) {
      const finalRegex = validateRegex(field.regex);
      const sourceRegex = validateRegex(field.sourceRegex);
      if (!finalRegex.valid) warnings.push(`${profile.name}/${field.label}: ungültiger Ergebnis-RegEx.`);
      if (!sourceRegex.valid) warnings.push(`${profile.name}/${field.label}: ungültiger OCR-RegEx.`);
    }
  }
  return warnings;
}

function newProfile() {
  syncProfileMeta();
  const role = "vda";
  const profile = createProfile(role, state.config.profiles.length + 1);
  profile.id = uniqueId(profile.id);
  state.config.profiles.push(profile);
  markDirty();
  renderProfileList();
  selectProfile(profile.id);
}

function duplicateProfile() {
  const current = selectedProfile();
  if (!current) return;
  syncProfileMeta();
  const copy = clone(current);
  copy.id = uniqueId(`${current.id}_COPY`);
  copy.name = `${current.name} – Kopie`;
  state.config.profiles.push(copy);
  markDirty();
  renderProfileList();
  selectProfile(copy.id);
}

function deleteProfile() {
  const current = selectedProfile();
  if (!current || !confirm(`Profil „${current.name}“ wirklich löschen?`)) return;
  const index = state.config.profiles.findIndex((profile) => profile.id === current.id);
  state.config.profiles.splice(index, 1);
  markDirty();
  renderProfileList();
  selectProfile(state.config.profiles[Math.max(0, index - 1)]?.id || "");
}

function renderProfileList() {
  const select = el("profileSelect");
  const selected = state.selectedProfileId;
  select.replaceChildren();
  for (const profile of state.config.profiles) {
    const option = new Option(`${profile.role === "product" ? "Produkt" : "VDA"} · ${profile.name}`, profile.id);
    select.append(option);
  }
  select.value = selected;
  el("profileCount").textContent = String(state.config.profiles.length);
}

function selectProfile(id) {
  syncProfileMeta();
  state.selectedProfileId = id;
  state.selectedAssignment = null;
  state.selection = null;
  el("profileSelect").value = id;
  renderProfileMeta();
  renderAssignments();
  renderProperties();
  drawOverlay();
}

function renderProfileMeta() {
  const profile = selectedProfile();
  const disabled = !profile;
  for (const id of ["profileId", "profileName", "profileRole", "profileActive", "anchorAliases"]) el(id).disabled = disabled;
  el("profileId").value = profile?.id || "";
  el("profileName").value = profile?.name || "";
  el("profileRole").value = profile?.role || "vda";
  el("profileActive").checked = profile?.active !== false;
  el("anchorAliases").value = (profile?.anchor?.aliases || []).join("\n");
}

function updateProfileMeta() {
  const profile = selectedProfile();
  if (!profile) return;
  const previousId = profile.id;
  const desiredId = safeProfileId(el("profileId").value);
  profile.id = desiredId === previousId ? desiredId : uniqueId(desiredId, previousId);
  profile.name = el("profileName").value.trim() || profile.id;
  profile.role = el("profileRole").value === "product" ? "product" : "vda";
  profile.active = el("profileActive").checked;
  profile.anchor.aliases = el("anchorAliases").value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  if (profile.id !== previousId) state.selectedProfileId = profile.id;
  markDirty();
  renderProfileList();
  renderAssignments();
}

function syncProfileMeta() {
  // Metadaten werden bereits bei jeder Eingabe direkt in den Zustand geschrieben.
}

async function initializeEngine(force = false) {
  if (!force && engine.ready) return true;
  setEditorEngine("PaddleOCR wird vorbereitet …", "wait");
  try {
    if (force) await engine.dispose();
    const info = await engine.initialize("standard", (message) => setEditorEngine(message, "wait"));
    setEditorEngine(`PaddleOCR bereit · ${info.mode}`, "ok");
    el("editorEngineDetails").textContent = `Initialisierung ${formatMilliseconds(info.initMs)} · PP-OCRv5 mobile.`;
    return true;
  } catch (error) {
    setEditorEngine(`PaddleOCR nicht bereit: ${safeError(error)}`, "bad");
    return false;
  }
}

async function loadMasterImage(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    state.prepared = await prepareImage(file, 2200);
    state.masterFileName = file.name;
    state.ocrResult = null;
    state.selection = null;
    state.selectedAssignment = null;
    el("runOcrButton").disabled = false;
    drawBaseImage();
    drawOverlay();
    renderSelectionInfo();
    el("editorHint").textContent = `Masterbild „${file.name}“ geladen. PaddleOCR starten oder freie Zonen zeichnen.`;
  } catch (error) {
    el("editorHint").textContent = `Masterbild konnte nicht geladen werden: ${safeError(error)}`;
  }
}

async function runOcr() {
  if (!state.prepared || !(await initializeEngine())) return;
  el("runOcrButton").disabled = true;
  setEditorEngine("PaddleOCR analysiert das Masterbild …", "wait");
  try {
    const preset = QUALITY_PRESETS.balanced;
    const output = await engine.predict(state.prepared.canvas, {
      textDetLimitSideLen: preset.textDetLimitSideLen,
      textDetLimitType: "min",
      textDetMaxSideLimit: 2400,
      textDetThresh: 0.25,
      textDetBoxThresh: preset.textDetBoxThresh,
      textDetUnclipRatio: 1.55,
      textRecScoreThresh: preset.textRecScoreThresh
    });
    state.ocrResult = output.result;
    state.selection = null;
    setEditorEngine(`PaddleOCR bereit · ${output.result.items?.length || 0} Textzeilen`, "ok");
    el("editorEngineDetails").textContent = `Masterbild in ${formatMilliseconds(output.wallMs)} analysiert.`;
    drawOverlay();
    renderSelectionInfo();
  } catch (error) {
    setEditorEngine(`OCR fehlgeschlagen: ${safeError(error)}`, "bad");
  } finally {
    el("runOcrButton").disabled = false;
  }
}

function setMode(mode) {
  state.mode = mode;
  state.drag = null;
  for (const [buttonId, value] of [["selectModeButton", "select"], ["drawModeButton", "draw"], ["editModeButton", "edit"]]) {
    el(buttonId).classList.toggle("active-mode", value === mode);
  }
  el("editorHint").textContent = {
    select: "Klicke auf eine orange OCR-Box und ordne sie anschließend als Anker oder Feld zu.",
    draw: "Ziehe mit gedrückter Maustaste eine großzügige Zone um den Wert.",
    edit: "Wähle eine bestehende Zuordnung. Innen ziehen verschiebt sie; Eckpunkte ändern die Größe."
  }[mode];
  drawOverlay();
}

function pointerDown(event) {
  if (!state.prepared) return;
  const point = pointerToNormalized(event, el("editorOverlayCanvas"));
  if (state.mode === "select") {
    const item = findOcrItem(point);
    state.selection = item ? {
      poly: polyFromPixelPoly(item.poly, state.prepared.width, state.prepared.height),
      text: item.text,
      score: Number(item.score || 0),
      source: "ocr"
    } : null;
    state.selectedAssignment = null;
    renderSelectionInfo();
    renderProperties();
    drawOverlay();
    return;
  }

  if (state.mode === "draw") {
    state.drag = { type: "draw", start: point, current: point };
    state.selection = { poly: rectToPoly({ x: point.x, y: point.y, width: 0, height: 0 }), text: "", score: 0, source: "draw" };
    event.currentTarget.setPointerCapture(event.pointerId);
    return;
  }

  if (state.mode === "edit") {
    let assignment = findAssignmentAt(point) || currentAssignment();
    if (!assignment) return;
    selectAssignment(assignment.type, assignment.key);
    const rect = polyToRect(assignment.value.poly);
    const interaction = hitTestRect(point, rect, 0.022);
    if (!interaction) return;
    state.drag = { type: "edit", assignment, start: point, originalRect: rect, interaction };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
}

function pointerMove(event) {
  if (!state.drag) return;
  const point = pointerToNormalized(event, el("editorOverlayCanvas"));
  if (state.drag.type === "draw") {
    state.drag.current = point;
    state.selection.poly = rectToPoly(rectFromPoints(state.drag.start, point));
    drawOverlay();
    return;
  }
  if (state.drag.type === "edit") {
    const rect = applyRectDrag(state.drag.originalRect, state.drag.start, point, state.drag.interaction);
    updateAssignmentRect(state.drag.assignment.value, rect);
    markDirty();
    drawOverlay();
  }
}

function pointerUp(event) {
  if (!state.drag) return;
  try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
  const wasDraw = state.drag.type === "draw";
  state.drag = null;
  if (wasDraw) renderSelectionInfo();
  renderAssignments();
  renderProperties();
  drawOverlay();
}

function assignAnchor() {
  const profile = selectedProfile();
  if (!profile || !state.selection?.poly?.length) return alert("Zuerst eine OCR-Box auswählen oder eine freie Zone zeichnen.");
  profile.anchor.poly = state.selection.poly;
  if (!profile.anchor.aliases.length && state.selection.text) {
    profile.anchor.aliases = [state.selection.text.trim()];
    el("anchorAliases").value = profile.anchor.aliases.join("\n");
  }
  state.selectedAssignment = { type: "anchor", key: "anchor" };
  state.selection = null;
  markDirty();
  setMode("edit");
  renderAssignments();
  renderProperties();
}

function assignField(key) {
  const profile = selectedProfile();
  if (!profile || !state.selection?.poly?.length) return alert("Zuerst eine OCR-Box auswählen oder eine freie Zone zeichnen.");
  const existing = findField(profile, key);
  const field = existing || createField(key);
  const padding = state.selection.source === "ocr" ? Number(el("paddingInput").value) / 100 : 0;
  field.poly = padding ? expandPoly(state.selection.poly, padding) : state.selection.poly;
  upsertField(profile, field);
  state.selectedAssignment = { type: "field", key };
  state.selection = null;
  markDirty();
  setMode("edit");
  renderAssignments();
  renderProperties();
}

function renderAssignments() {
  const profile = selectedProfile();
  const container = el("assignmentList");
  container.replaceChildren();
  if (!profile) return;
  const entries = [];
  if ((profile.anchor?.poly || []).length) entries.push({ type: "anchor", key: "anchor", label: "Kunden-/Produktanker", value: profile.anchor });
  for (const field of profile.fields || []) entries.push({ type: "field", key: field.key, label: field.label, value: field });
  if (!entries.length) {
    container.innerHTML = '<p class="muted">Noch keine Zuordnungen.</p>';
    return;
  }
  for (const entry of entries) {
    const button = document.createElement("button");
    button.className = "assignment-chip";
    if (state.selectedAssignment?.type === entry.type && state.selectedAssignment?.key === entry.key) button.classList.add("selected");
    button.textContent = entry.label;
    button.onclick = () => selectAssignment(entry.type, entry.key);
    container.append(button);
  }
}

function selectAssignment(type, key) {
  state.selectedAssignment = { type, key };
  state.selection = null;
  renderAssignments();
  renderProperties();
  drawOverlay();
}

function renderProperties() {
  const assignment = currentAssignment();
  el("selectedAssignmentName").textContent = assignment?.label || "keine Zuordnung";
  if (!assignment) {
    el("anchorProperties").classList.remove("hidden");
    el("anchorProperties").textContent = "Wähle einen Anker oder ein Feld aus.";
    el("fieldProperties").classList.add("hidden");
    return;
  }
  if (assignment.type === "anchor") {
    el("anchorProperties").classList.remove("hidden");
    el("anchorProperties").textContent = "Der Anker wird über die Alias-Texte identifiziert. Position und Größe kannst du im Bearbeitungsmodus direkt im Bild ändern.";
    el("fieldProperties").classList.add("hidden");
    return;
  }

  const field = assignment.value;
  el("anchorProperties").classList.add("hidden");
  el("fieldProperties").classList.remove("hidden");
  el("fieldLabel").value = field.label || "";
  el("fieldRegex").value = field.regex || "";
  el("fieldSourceRegex").value = field.sourceRegex || field.regex || "";
  el("fieldNormalizer").value = field.normalizer || "text";
  el("fieldDigits").value = Number(field.digits || 4);
  el("fieldAdjacentTo").value = field.adjacentTo || "";
  el("fieldRequired").checked = Boolean(field.required);
  el("fieldCompare").checked = Boolean(field.compare);
  el("digitsRow").classList.toggle("hidden", el("fieldNormalizer").value !== "last_digits");
  renderRegexStatus();
}

function updateFieldProperties() {
  const assignment = currentAssignment();
  if (!assignment || assignment.type !== "field") return;
  const field = assignment.value;
  field.label = el("fieldLabel").value.trim() || field.key;
  field.regex = el("fieldRegex").value.trim();
  field.sourceRegex = el("fieldSourceRegex").value.trim();
  field.normalizer = el("fieldNormalizer").value;
  field.digits = Math.max(1, Number(el("fieldDigits").value || 4));
  field.adjacentTo = el("fieldAdjacentTo").value || undefined;
  field.required = el("fieldRequired").checked;
  field.compare = el("fieldCompare").checked;
  el("digitsRow").classList.toggle("hidden", field.normalizer !== "last_digits");
  markDirty();
  renderAssignments();
  renderRegexStatus();
  drawOverlay();
}

function renderRegexStatus() {
  const finalStatus = validateRegex(el("fieldRegex").value);
  const sourceStatus = validateRegex(el("fieldSourceRegex").value);
  const status = el("regexStatus");
  if (finalStatus.valid && sourceStatus.valid) {
    status.textContent = "Beide regulären Ausdrücke sind gültig.";
    status.className = "regex-status ok";
  } else {
    status.textContent = `Ungültiger RegEx: ${finalStatus.message || sourceStatus.message}`;
    status.className = "regex-status bad";
  }
}

function deleteSelectedAssignment() {
  const profile = selectedProfile();
  const assignment = currentAssignment();
  if (!profile || !assignment) return;
  if (assignment.type === "anchor") profile.anchor.poly = [];
  else profile.fields = profile.fields.filter((field) => field.key !== assignment.key);
  state.selectedAssignment = null;
  markDirty();
  renderAssignments();
  renderProperties();
  drawOverlay();
}

function drawBaseImage() {
  const stage = el("editorStage");
  const base = el("editorImageCanvas");
  const overlay = el("editorOverlayCanvas");
  if (!state.prepared) {
    stage.classList.add("empty");
    el("editorPlaceholder").classList.remove("hidden");
    return;
  }
  stage.classList.remove("empty");
  el("editorPlaceholder").classList.add("hidden");
  for (const canvas of [base, overlay]) {
    canvas.width = state.prepared.width;
    canvas.height = state.prepared.height;
  }
  base.getContext("2d").drawImage(state.prepared.canvas, 0, 0);
}

function drawOverlay() {
  const canvas = el("editorOverlayCanvas");
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!state.prepared) return;
  const width = state.prepared.width;
  const height = state.prepared.height;
  const line = Math.max(2, Math.round(width / 800));
  context.lineWidth = line;
  context.font = `700 ${Math.max(15, Math.round(width / 65))}px system-ui`;
  context.textBaseline = "bottom";

  for (const item of state.ocrResult?.items || []) {
    drawPoly(context, item.poly, "rgba(255,173,51,.82)", "", false);
  }

  const profile = selectedProfile();
  if (profile && (profile.anchor?.poly || []).length) {
    drawLabeledNormalizedPoly(context, profile.anchor.poly, width, height, "#37dc91", "ANKER", isSelected("anchor", "anchor"));
  }
  for (const field of profile?.fields || []) {
    drawLabeledNormalizedPoly(context, field.poly, width, height, "#4cc9f0", field.label, isSelected("field", field.key));
  }

  if (state.selection?.poly?.length) {
    drawLabeledNormalizedPoly(context, state.selection.poly, width, height, "#ffd166", state.selection.text || "AUSWAHL", true);
  }
}

function drawLabeledNormalizedPoly(context, poly, width, height, color, label, selected) {
  const points = scaledPoly(poly, width, height);
  drawPoly(context, points, selected ? "#ff5dd1" : color, label, selected);
}

function drawPoly(context, points, color, label, handles) {
  if (!points?.length) return;
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = handles ? Math.max(4, context.lineWidth * 1.5) : context.lineWidth;
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  for (const point of points.slice(1)) context.lineTo(point[0], point[1]);
  context.closePath();
  context.stroke();
  const bounds = boundsFromPoly(points);
  if (label) {
    const metrics = context.measureText(label);
    const x = Math.max(0, Math.min(bounds.x, context.canvas.width - metrics.width - 12));
    const y = Math.max(24, bounds.y);
    context.fillRect(x, y - 24, metrics.width + 12, 24);
    context.fillStyle = "#061423";
    context.fillText(label, x + 6, y - 3);
  }
  if (handles) {
    context.fillStyle = "#fff";
    for (const [x, y] of points.slice(0, 4)) context.fillRect(x - 7, y - 7, 14, 14);
  }
  context.restore();
}

function renderSelectionInfo() {
  const info = el("selectionInfo");
  if (!state.selection) {
    info.textContent = "Keine OCR-Box oder freie Zone ausgewählt.";
    return;
  }
  if (state.selection.source === "ocr") {
    info.innerHTML = `<strong>${escapeHtml(state.selection.text || "(leer)")}</strong><br>OCR-Konfidenz ${(state.selection.score * 100).toFixed(1)} %`;
  } else {
    info.textContent = "Freie Zone ausgewählt. Ordne sie jetzt als Anker oder Feld zu.";
  }
}

function findOcrItem(point) {
  if (!state.prepared) return null;
  const x = point.x * state.prepared.width;
  const y = point.y * state.prepared.height;
  let best = null;
  for (const item of state.ocrResult?.items || []) {
    const bounds = boundsFromPoly(item.poly);
    const inside = x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height;
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const distance = Math.hypot(x - cx, y - cy);
    const score = inside ? 1000000 - bounds.width * bounds.height : -distance;
    if ((inside || distance < Math.max(35, bounds.height * 1.4)) && (!best || score > best.score)) best = { item, score };
  }
  return best?.item || null;
}

function findAssignmentAt(point) {
  const profile = selectedProfile();
  const entries = [];
  if ((profile?.anchor?.poly || []).length) entries.push({ type: "anchor", key: "anchor", label: "Kunden-/Produktanker", value: profile.anchor });
  for (const field of profile?.fields || []) entries.push({ type: "field", key: field.key, label: field.label, value: field });
  return entries.reverse().find((entry) => {
    const rect = polyToRect(entry.value.poly);
    return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
  }) || null;
}

function currentAssignment() {
  const profile = selectedProfile();
  if (!profile || !state.selectedAssignment) return null;
  if (state.selectedAssignment.type === "anchor") {
    return { type: "anchor", key: "anchor", label: "Kunden-/Produktanker", value: profile.anchor };
  }
  const field = findField(profile, state.selectedAssignment.key);
  return field ? { type: "field", key: field.key, label: field.label, value: field } : null;
}

function isSelected(type, key) {
  return state.selectedAssignment?.type === type && state.selectedAssignment?.key === key;
}

function selectedProfile() {
  return state.config.profiles.find((profile) => profile.id === state.selectedProfileId) || null;
}

function uniqueId(base, currentId = "") {
  const clean = safeProfileId(base);
  const used = new Set(state.config.profiles.map((profile) => profile.id).filter((id) => id !== currentId));
  if (!used.has(clean)) return clean;
  let index = 2;
  while (used.has(`${clean}_${index}`)) index += 1;
  return `${clean}_${index}`;
}

function markDirty() {
  state.dirty = true;
  setConfigStatus(`${state.config.profiles.length} Profile · Änderungen noch nicht exportiert`, "warn");
}

function setConfigStatus(text, kind = "") {
  el("configStatus").textContent = text;
  el("configStatus").className = kind;
}

function setEditorEngine(text, kind) {
  el("editorEngineBadge").textContent = text;
  el("editorEngineBadge").className = `engine-badge ${kind}`;
}

function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
}
