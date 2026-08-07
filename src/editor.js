import "./styles.css";
import { APP_VERSION, QUALITY_PRESETS } from "./config.js";
import { PaddleOcrEngine, formatRuntimeDetails } from "./ocr-engine.js";
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
import { EditorProfileSessionStore } from "./editor-session.js";
import { deleteEditorMaster, loadEditorMaster, renameEditorMaster, saveEditorMaster } from "./editor-persistence.js";

const engine = new PaddleOcrEngine();
const el = (id) => document.getElementById(id);
const state = {
  config: normalizeProfileConfig({ profiles: [] }, APP_VERSION),
  selectedProfileId: "",
  sessions: new EditorProfileSessionStore(),
  selectedAssignment: null,
  mode: "select",
  drag: null,
  dirty: false,
  ocrRun: null,
  engineInitPromise: null,
  elapsedTimer: null
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
  el("ocrJsonInput").addEventListener("change", importOcrJson);
  el("runOcrButton").onclick = runOcr;
  el("cancelOcrButton").onclick = () => cancelOcrAnalysis(false);
  el("initializeEditorButton").onclick = async () => {
    await cancelOcrAnalysis(true);
    await initializeEngine(true);
  };
  el("clearOcrButton").onclick = () => {
    const session = currentSession(false);
    if (!session) return;
    session.ocrResult = null;
    session.selection = null;
    persistSession(state.selectedProfileId, session).catch(() => undefined);
    drawOverlay();
    renderSelectionInfo();
  };
  el("clearMasterButton").onclick = clearMasterImage;

  el("selectModeButton").onclick = () => setMode("select");
  el("drawModeButton").onclick = () => setMode("draw");
  el("editModeButton").onclick = () => setMode("edit");
  el("paddingInput").addEventListener("input", () => {
    el("paddingValue").textContent = `${el("paddingInput").value} %`;
  });
  el("assignAnchorButton").onclick = assignAnchor;
  el("assignBatchDrumButton").onclick = assignBatchAndDrum;
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
    state.sessions.clear();
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
    state.sessions.clear();
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
  state.sessions.delete(current.id);
  deleteEditorMaster(current.id).catch(() => undefined);
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
  if (state.ocrRun && state.ocrRun.profileId !== id) cancelOcrAnalysis(true);
  state.selectedProfileId = id;
  state.selectedAssignment = null;
  state.drag = null;
  const session = currentSession();
  if (session) session.selection = null;
  el("profileSelect").value = id;
  renderProfileMeta();
  renderAssignments();
  renderProperties();
  drawBaseImage();
  drawOverlay();
  renderSelectionInfo();
  refreshMasterControls();
  restorePersistedMaster(id).catch(() => undefined);
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
  if (profile.id !== previousId) {
    state.sessions.rename(previousId, profile.id);
    renameEditorMaster(previousId, profile.id).catch(() => undefined);
    state.selectedProfileId = profile.id;
  }
  markDirty();
  renderProfileList();
  renderAssignments();
}

function syncProfileMeta() {
  // Metadaten werden bereits bei jeder Eingabe direkt in den Zustand geschrieben.
}

async function initializeEngine(force = false) {
  if (!force && engine.ready) return true;
  if (state.engineInitPromise) return state.engineInitPromise;

  const operation = initializeEngineInternal(force);
  state.engineInitPromise = operation;
  refreshMasterControls();
  try {
    return await operation;
  } finally {
    if (state.engineInitPromise === operation) state.engineInitPromise = null;
    refreshMasterControls();
  }
}

async function initializeEngineInternal(force) {
  setEditorEngine("PaddleOCR wird vorbereitet …", "wait");
  try {
    const info = await engine.initialize(
      "standard",
      (message) => setEditorEngine(message, "wait"),
      force
    );
    setEditorEngine(`PaddleOCR bereit · ${info.mode}`, "ok");
    el("editorEngineDetails").textContent = `Initialisierung ${formatMilliseconds(info.initMs)} · ${formatRuntimeDetails(info.summary)}`;
    return true;
  } catch (error) {
    setEditorEngine(`PaddleOCR nicht bereit: ${safeError(error)}`, "bad");
    el("editorEngineDetails").textContent = "Scanner und Editor verwenden dieselbe automatische WebGPU/WASM-Engine im Web Worker.";
    return false;
  }
}

async function loadMasterImage(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  const session = currentSession();
  if (!session) return;

  await cancelOcrAnalysis(true);
  try {
    const preset = QUALITY_PRESETS.balanced;
    session.prepared = await prepareImage(file, preset.maxImageSide);
    session.masterBlob = await canvasToBlob(session.prepared.canvas).catch(() => file);
    session.masterFileName = file.name;
    session.imageRevision += 1;
    session.restoreAttempted = true;
    session.ocrResult = null;
    session.selection = null;
    await persistSession(state.selectedProfileId, session);
    state.selectedAssignment = null;
    drawBaseImage();
    drawOverlay();
    renderSelectionInfo();
    refreshMasterControls();
    el("editorHint").textContent = `Masterbild „${file.name}“ ist nur diesem Profil zugeordnet. PaddleOCR starten oder freie Zonen zeichnen.`;
  } catch (error) {
    el("editorHint").textContent = `Masterbild konnte nicht geladen werden: ${safeError(error)}`;
  }
}

async function importOcrJson(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  const profile = selectedProfile();
  const session = currentSession(false);
  if (!profile || !session?.prepared) {
    alert("Zuerst das passende Profil auswählen und das zugehörige Masterbild laden.");
    return;
  }

  try {
    const payload = JSON.parse(await file.text());
    const rawResult = pickOcrResult(payload, profile.role);
    if (!rawResult || !Array.isArray(rawResult.items)) {
      throw new Error("In der JSON wurde kein PaddleOCR-Ergebnis für dieses Profil gefunden.");
    }

    const sourceWidth = Number(rawResult.image?.width || session.prepared.width);
    const sourceHeight = Number(rawResult.image?.height || session.prepared.height);
    session.ocrResult = scaleOcrResult(
      rawResult,
      sourceWidth,
      sourceHeight,
      session.prepared.width,
      session.prepared.height
    );
    session.selection = null;
    await persistSession(profile.id, session);
    setEditorEngine(`OCR-JSON importiert · ${session.ocrResult.items.length} Textzeilen`, "ok");
    el("editorEngineDetails").textContent = `Quelle „${file.name}“ · Boxen auf ${session.prepared.width} × ${session.prepared.height} px skaliert.`;
    el("editorHint").textContent = "OCR-Box anklicken und einem Feld zuweisen. Für eine kombinierte Zeile wie D… / 0001 die Schaltfläche „Batch + Fassnummer“ verwenden.";
    drawOverlay();
    renderSelectionInfo();
    refreshMasterControls();
  } catch (error) {
    setEditorEngine(`OCR-JSON konnte nicht importiert werden: ${safeError(error)}`, "bad");
  }
}

async function runOcr() {
  const session = currentSession(false);
  if (!session?.prepared || state.ocrRun || !(await initializeEngine())) return;

  const run = {
    id: Symbol("editor-ocr"),
    profileId: state.selectedProfileId,
    imageRevision: session.imageRevision,
    cancelled: false
  };
  state.ocrRun = run;
  refreshMasterControls();
  setEditorEngine("PaddleOCR analysiert das Masterbild im Web Worker …", "wait");
  startElapsedDisplay(run, session);

  try {
    // Der Editor benötigt nur anklickbare Textboxen. Dafür wird eine separate,
    // kleinere OCR-Kopie verwendet; das hochauflösende Masterbild bleibt für
    // die genaue Zonenbearbeitung unverändert erhalten.
    const ocrInput = createOcrInputCanvas(session.prepared.canvas, 1200);
    const output = await engine.predict(
      ocrInput.canvas,
      {
        textDetLimitSideLen: 1200,
        textDetLimitType: "max",
        textDetMaxSideLimit: 1200,
        textDetThresh: 0.25,
        textDetBoxThresh: 0.44,
        textDetUnclipRatio: 1.55,
        textRecScoreThresh: 0.20
      }
    );

    if (!isRunActive(run)) return;
    const targetSession = state.sessions.get(run.profileId, false);
    if (!targetSession || targetSession.imageRevision !== run.imageRevision) return;

    targetSession.ocrResult = scaleOcrResult(
      output.result,
      ocrInput.width,
      ocrInput.height,
      targetSession.prepared.width,
      targetSession.prepared.height
    );
    targetSession.selection = null;
    await persistSession(run.profileId, targetSession);
    if (state.selectedProfileId === run.profileId) {
      const result = targetSession.ocrResult;
      const metrics = result.metrics || {};
      setEditorEngine(`PaddleOCR bereit · ${output.mode} · ${result.items?.length || 0} Textzeilen`, "ok");
      el("editorEngineDetails").textContent = [
        `Gesamt ${formatMilliseconds(output.wallMs)}`,
        Number.isFinite(metrics.detMs) ? `Detektion ${formatMilliseconds(metrics.detMs)}` : "",
        Number.isFinite(metrics.recMs) ? `Erkennung ${formatMilliseconds(metrics.recMs)}` : "",
        formatRuntimeDetails(engine.summary, output.runtime),
        `OCR-Bild ${ocrInput.width} × ${ocrInput.height} px`
      ].filter(Boolean).join(" · ");
      drawOverlay();
      renderSelectionInfo();
    }
  } catch (error) {
    if (run.cancelled) {
      setEditorEngine("OCR-Analyse verworfen", "warn");
      el("editorEngineDetails").textContent = "Das Ergebnis wird nicht übernommen.";
    } else {
      setEditorEngine(`OCR fehlgeschlagen: ${safeError(error)}`, "bad");
      el("editorEngineDetails").textContent = "Der Worker wurde nicht automatisch ersetzt. Modell bei Bedarf manuell neu laden.";
    }
  } finally {
    stopElapsedDisplay();
    if (state.ocrRun?.id === run.id) state.ocrRun = null;
    refreshMasterControls();
  }
}

function isRunActive(run) {
  return !run.cancelled && state.ocrRun?.id === run.id;
}

async function cancelOcrAnalysis(silent = false) {
  const run = state.ocrRun;
  if (!run) return;
  run.cancelled = true;
  stopElapsedDisplay();
  state.ocrRun = null;
  refreshMasterControls();
  if (!silent) {
    setEditorEngine("PaddleOCR-Worker wird beendet …", "warn");
    el("editorEngineDetails").textContent = "Der laufende Worker wird vollständig beendet; danach muss das Modell neu geladen werden.";
  }
  try {
    await engine.abortCurrent();
    if (!silent) {
      setEditorEngine("OCR abgebrochen · Modell neu laden", "warn");
      el("editorEngineDetails").textContent = "Der alte Worker ist beendet. Vor der nächsten Analyse auf „Modell neu laden“ klicken.";
    }
  } catch (error) {
    if (!silent) setEditorEngine(`Worker konnte nicht sauber beendet werden: ${safeError(error)}`, "bad");
  }
}

function startElapsedDisplay(run, session) {
  stopElapsedDisplay();
  const startedAt = performance.now();
  const update = () => {
    if (!isRunActive(run)) return;
    const seconds = Math.max(0, Math.round((performance.now() - startedAt) / 1000));
    el("editorEngineDetails").textContent = `Bild ${session.prepared.width} × ${session.prepared.height} px · automatisches Backend läuft seit ${seconds} s.`;
  };
  update();
  state.elapsedTimer = setInterval(update, 1000);
}

function stopElapsedDisplay() {
  if (state.elapsedTimer) clearInterval(state.elapsedTimer);
  state.elapsedTimer = null;
}

async function clearMasterImage() {
  await cancelOcrAnalysis(true);
  const session = currentSession(false);
  if (!session) return;
  session.prepared = null;
  session.masterBlob = null;
  session.ocrResult = null;
  session.selection = null;
  session.masterFileName = "";
  session.imageRevision += 1;
  session.restoreAttempted = true;
  await deleteEditorMaster(state.selectedProfileId).catch(() => undefined);
  state.selectedAssignment = null;
  drawBaseImage();
  drawOverlay();
  renderSelectionInfo();
  renderProperties();
  refreshMasterControls();
  el("editorHint").textContent = "Für dieses Profil ist kein Masterbild geladen.";
}

async function restorePersistedMaster(profileId) {
  const session = state.sessions.get(profileId, true);
  if (!session || session.prepared || session.restoreAttempted) return;
  session.restoreAttempted = true;
  const revision = session.imageRevision;
  try {
    const saved = await loadEditorMaster(profileId);
    if (!saved?.blob || session.prepared || session.imageRevision !== revision) return;
    const preset = QUALITY_PRESETS.balanced;
    const prepared = await prepareImage(saved.blob, preset.maxImageSide);
    if (session.prepared || session.imageRevision !== revision) return;
    session.prepared = prepared;
    session.masterBlob = saved.blob;
    session.masterFileName = saved.fileName || "gespeichertes-masterbild.jpg";
    session.ocrResult = saved.ocrResult || null;
    session.selection = null;
    session.imageRevision += 1;
    if (state.selectedProfileId === profileId) {
      drawBaseImage();
      drawOverlay();
      renderSelectionInfo();
      refreshMasterControls();
      el("editorHint").textContent = `Masterbild „${session.masterFileName}“ lokal aus dem Browser wiederhergestellt${session.ocrResult ? " · OCR-Boxen ebenfalls geladen" : ""}.`;
    }
  } catch {
    // Der Editor bleibt auch ohne IndexedDB vollständig benutzbar.
  }
}

async function persistSession(profileId, session) {
  if (!profileId || !session?.masterBlob) return;
  await saveEditorMaster(profileId, {
    blob: session.masterBlob,
    fileName: session.masterFileName,
    ocrResult: session.ocrResult
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Masterbild konnte nicht lokal gespeichert werden.")), "image/jpeg", 0.9);
  });
}

function refreshMasterControls() {
  const session = currentSession(false);
  const running = Boolean(state.ocrRun);
  const initializing = Boolean(state.engineInitPromise);
  el("runOcrButton").disabled = running || initializing || !session?.prepared;
  el("cancelOcrButton").disabled = !running;
  el("initializeEditorButton").disabled = running || initializing || engine.busy;
  el("clearMasterButton").disabled = running || !session?.prepared;

  if (!session?.prepared) {
    el("editorHint").textContent = "Für dieses Profil ein eigenes Masterbild laden. Danach PaddleOCR starten oder direkt eine freie Zone zeichnen.";
  } else if (!running) {
    const suffix = session.ocrResult ? ` · ${session.ocrResult.items?.length || 0} OCR-Textzeilen vorhanden` : "";
    el("editorHint").textContent = `Masterbild „${session.masterFileName || "ohne Dateiname"}“ gehört nur zu diesem Profil${suffix}.`;
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
  const session = currentSession(false);
  if (!session?.prepared) return;
  const point = pointerToNormalized(event, el("editorOverlayCanvas"));
  if (state.mode === "select") {
    const item = findOcrItem(point);
    session.selection = item ? {
      poly: polyFromPixelPoly(item.poly, session.prepared.width, session.prepared.height),
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
    session.selection = { poly: rectToPoly({ x: point.x, y: point.y, width: 0, height: 0 }), text: "", score: 0, source: "draw" };
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
  const session = currentSession(false);
  if (!session) return;
  const point = pointerToNormalized(event, el("editorOverlayCanvas"));
  if (state.drag.type === "draw") {
    state.drag.current = point;
    session.selection.poly = rectToPoly(rectFromPoints(state.drag.start, point));
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
  const session = currentSession(false);
  if (!profile || !session?.selection?.poly?.length) return alert("Zuerst eine OCR-Box auswählen oder eine freie Zone zeichnen.");
  profile.anchor.poly = session.selection.poly;
  if (!profile.anchor.aliases.length && session.selection.text) {
    profile.anchor.aliases = [session.selection.text.trim()];
    el("anchorAliases").value = profile.anchor.aliases.join("\n");
  }
  state.selectedAssignment = { type: "anchor", key: "anchor" };
  session.selection = null;
  markDirty();
  setMode("edit");
  renderAssignments();
  renderProperties();
}

function assignField(key) {
  const profile = selectedProfile();
  const session = currentSession(false);
  if (!profile || !session?.selection?.poly?.length) return alert("Zuerst eine OCR-Box auswählen oder eine freie Zone zeichnen.");
  const existing = findField(profile, key);
  const field = existing || createField(key);
  const padding = session.selection.source === "ocr" ? Number(el("paddingInput").value) / 100 : 0;
  field.poly = padding ? expandPoly(session.selection.poly, padding) : session.selection.poly;
  upsertField(profile, field);
  state.selectedAssignment = { type: "field", key };
  session.selection = null;
  markDirty();
  setMode("edit");
  renderAssignments();
  renderProperties();
}

function assignBatchAndDrum() {
  const profile = selectedProfile();
  const session = currentSession(false);
  if (!profile || !session?.selection?.poly?.length) {
    return alert("Zuerst die OCR-Box mit der kombinierten Zeile, z. B. D562707978 / 0001, auswählen.");
  }

  const padding = session.selection.source === "ocr" ? Number(el("paddingInput").value) / 100 : 0;
  const poly = padding ? expandPoly(session.selection.poly, padding) : session.selection.poly;

  const batch = findField(profile, "batch") || createField("batch");
  batch.poly = poly.map((point) => [...point]);
  upsertField(profile, batch);

  const drum = findField(profile, "drum_number") || createField("drum_number");
  drum.poly = poly.map((point) => [...point]);
  drum.normalizer = "last_digits";
  drum.digits = 4;
  drum.adjacentTo = "batch";
  upsertField(profile, drum);

  state.selectedAssignment = { type: "field", key: "drum_number" };
  session.selection = null;
  markDirty();
  setMode("edit");
  renderAssignments();
  renderProperties();
  drawOverlay();
  el("editorHint").textContent = "Die gleiche OCR-Zeile ist Batch und Fassnummer zugeordnet. Der Scanner übernimmt vor dem / die Batchnummer und danach die letzten vier Ziffern als Fassnummer.";
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
  const session = currentSession(false);
  if (session) session.selection = null;
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
  const session = currentSession(false);
  if (!session?.prepared) {
    stage.classList.add("empty");
    el("editorPlaceholder").classList.remove("hidden");
    base.width = base.height = 1;
    overlay.width = overlay.height = 1;
    base.getContext("2d").clearRect(0, 0, 1, 1);
    overlay.getContext("2d").clearRect(0, 0, 1, 1);
    return;
  }
  stage.classList.remove("empty");
  el("editorPlaceholder").classList.add("hidden");
  for (const canvas of [base, overlay]) {
    canvas.width = session.prepared.width;
    canvas.height = session.prepared.height;
  }
  base.getContext("2d").drawImage(session.prepared.canvas, 0, 0);
}

function drawOverlay() {
  const canvas = el("editorOverlayCanvas");
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  const session = currentSession(false);
  if (!session?.prepared) return;
  const width = session.prepared.width;
  const height = session.prepared.height;
  const line = Math.max(2, Math.round(width / 800));
  context.lineWidth = line;
  context.font = `700 ${Math.max(15, Math.round(width / 65))}px system-ui`;
  context.textBaseline = "bottom";

  for (const item of session.ocrResult?.items || []) {
    drawPoly(context, item.poly, "rgba(255,173,51,.82)", "", false);
  }

  const profile = selectedProfile();
  if (profile && (profile.anchor?.poly || []).length) {
    drawLabeledNormalizedPoly(context, profile.anchor.poly, width, height, "#37dc91", "ANKER", isSelected("anchor", "anchor"));
  }
  for (const field of profile?.fields || []) {
    drawLabeledNormalizedPoly(context, field.poly, width, height, "#4cc9f0", field.label, isSelected("field", field.key));
  }

  if (session.selection?.poly?.length) {
    drawLabeledNormalizedPoly(context, session.selection.poly, width, height, "#ffd166", session.selection.text || "AUSWAHL", true);
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
  const selection = currentSession(false)?.selection || null;
  if (!selection) {
    info.textContent = "Keine OCR-Box oder freie Zone ausgewählt.";
    return;
  }
  if (selection.source === "ocr") {
    info.innerHTML = `<strong>${escapeHtml(selection.text || "(leer)")}</strong><br>OCR-Konfidenz ${(selection.score * 100).toFixed(1)} %`;
  } else {
    info.textContent = "Freie Zone ausgewählt. Ordne sie jetzt als Anker oder Feld zu.";
  }
}

function findOcrItem(point) {
  const session = currentSession(false);
  if (!session?.prepared) return null;
  const x = point.x * session.prepared.width;
  const y = point.y * session.prepared.height;
  let best = null;
  for (const item of session.ocrResult?.items || []) {
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

function currentSession(create = true) {
  return state.sessions.get(state.selectedProfileId, create);
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

function createOcrInputCanvas(sourceCanvas, maxSide) {
  const scale = Math.min(1, Number(maxSide) / Math.max(sourceCanvas.width, sourceCanvas.height));
  const width = Math.max(1, Math.round(sourceCanvas.width * scale));
  const height = Math.max(1, Math.round(sourceCanvas.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(sourceCanvas, 0, 0, width, height);
  return { canvas, width, height };
}

function scaleOcrResult(result, sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const sx = Number(targetWidth) / Math.max(1, Number(sourceWidth));
  const sy = Number(targetHeight) / Math.max(1, Number(sourceHeight));
  return {
    ...result,
    image: { width: Number(targetWidth), height: Number(targetHeight) },
    items: (result?.items || []).map((item) => ({
      ...item,
      poly: (item.poly || []).map(([x, y]) => [Number(x) * sx, Number(y) * sy])
    }))
  };
}

function pickOcrResult(payload, role) {
  if (Array.isArray(payload?.items)) return payload;
  if (Array.isArray(payload?.result?.items)) return payload.result;
  const preferred = role === "product" ? payload?.product : payload?.vda;
  if (Array.isArray(preferred?.result?.items)) return preferred.result;
  if (Array.isArray(preferred?.items)) return preferred;
  for (const key of ["product", "vda"]) {
    if (Array.isArray(payload?.[key]?.result?.items)) return payload[key].result;
  }
  return null;
}
