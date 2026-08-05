import "./styles.css";
import { APP_VERSION } from "./config.js";
import { FlorenceClient } from "./model-client.js";
import { parseFlorenceEntries, buildTextCandidates } from "./ocr-entries.js";
import { findAnchor } from "./profile-engine.js";
import { loadProfileConfig, validateConfig } from "./profiles.js";
import { prepareImage } from "./image-tools.js";

const DEFAULT_FIELDS = {
  batch: { label: "Batch", pattern: "^D[0-9]{8,10}$", extractor: "batch", required: true, compare: true },
  idh: { label: "IDH", pattern: "^[0-9]{5,10}$", extractor: "idh", required: true, compare: true },
  weight: { label: "Gewicht", pattern: "^[0-9]+(?:[.,][0-9]+)?\\s*(?:KG|KGM|LTR|L|G)?$", extractor: "weight", required: true, compare: true },
  drum: { label: "Fassnummer", pattern: "^[0-9]{1,6}$", extractor: "drum", required: false, compare: false },
  deliveryNote: { label: "Lieferscheinnummer", pattern: "^[0-9]{5,16}$", extractor: "deliveryNote", required: false, compare: false },
};

const state = {
  config: null,
  selectedId: "",
  entries: [],
  selectedEntry: null,
  drawnRect: null,
  mode: "select",
  client: null,
  busy: false,
  view: null,
  interaction: null,
  analysisStartedAt: 0,
  analysisTimer: null,
  analysisCancelled: false,
};

document.querySelector("#editorApp").innerHTML = `
  <header><div><h1>LabelCheck Profileditor <small class="small">v${APP_VERSION}</small></h1><p>Kundenanker und Wertpositionen auf Florence-Textboxen festlegen.</p></div><a class="header-link" href="./">Scanner öffnen</a></header>
  <div class="editor-toolbar">
    <label class="filebtn primary">Konfiguration importieren<input id="importConfig" type="file" accept=".json,application/json"></label>
    <button id="exportConfig" class="good">label-profiles.json exportieren</button>
    <button id="newProfile">Neues Profil</button>
    <button id="analyzeMaster" class="primary">Florence auf Masterbild</button>
    <button id="cancelAnalysis" class="danger" disabled>Analyse abbrechen</button>
    <button id="modeSelect">Textbox auswählen</button>
    <button id="modeDraw">Bereich zeichnen</button>
    <button id="modeEdit">Zuordnung bearbeiten</button>
    <span id="editorStatus" class="status">Initialisierung …</span>
  </div>
  <main class="profile-editor-layout">
    <aside class="panel"><div class="panel-head"><h2>Profile</h2><span id="profileCount" class="small"></span></div><div class="panel-body"><input id="profileSearch" type="search" placeholder="Profil suchen …"><div id="profileList" class="profile-list"></div></div></aside>
    <section class="panel editor-canvas-panel">
      <div class="panel-head"><h2 id="canvasTitle">Kein Profil</h2><span id="selectionInfo" class="small">—</span></div>
      <div class="editor-canvas-toolbar"><label class="filebtn">Masterbild laden/ersetzen<input id="masterInput" type="file" accept="image/*"></label><button id="assignAnchor">Auswahl = Kundenanker</button>${Object.entries(DEFAULT_FIELDS).map(([key, value]) => `<button data-assign-field="${key}">${value.label}</button>`).join("")}</div>
      <div id="editorCanvasWrap" class="editor-canvas-wrap">
        <div id="editorEmptyState" class="editor-empty-state">Kein Masterbild</div>
        <div id="editorStage" class="editor-stage hidden">
          <img id="editorMasterImage" alt="Masterbild">
          <canvas id="editorCanvas"></canvas>
        </div>
      </div>
      <div class="hint">Das Masterbild bleibt auch während Florence sichtbar. Orange Boxen stammen von Florence. Mit „Bereich zeichnen“ kann jedes Profil vollständig manuell eingerichtet werden. Unter „Zuordnung bearbeiten“ lassen sich grüne und blaue Kästchen verschieben und an den Eckpunkten vergrößern.</div>
    </section>
    <aside class="panel"><div class="panel-head"><h2>Profil und Auswahl</h2><span id="dirtyBadge" class="small">geladen</span></div><div class="panel-body">
      <label class="field">Profilname<input id="profileName"></label>
      <label class="field">Rolle<select id="profileRole"><option value="product">Produktlabel</option><option value="vda">VDA-Label</option></select></label>
      <label class="field">Kunden-/Anker-Aliase<textarea id="anchorAliases" placeholder="Eine Schreibweise pro Zeile"></textarea></label>
      <label class="field inline-field"><input id="manualOnly" type="checkbox"> Nur nach manueller Formatauswahl verwenden</label>
      <label class="field inline-field"><input id="activeProfile" type="checkbox"> Profil aktiv</label>
      <label class="field inline-field"><input id="configuredProfile" type="checkbox"> Fachlich vollständig konfiguriert</label>
      <hr>
      <label class="field">Vorhandene Zuordnung<select id="assignmentSelect"><option value="">— auswählen —</option></select></label>
      <strong>Aktuell gewählter Bereich</strong>
      <div id="selectedRegionText" class="parser-result">Keine Auswahl.</div>
      <label class="field">Feld-RegEx<input id="fieldPattern" disabled></label>
      <label class="field inline-field"><input id="fieldRequired" type="checkbox" disabled> Pflichtfeld</label>
      <label class="field inline-field"><input id="fieldCompare" type="checkbox" disabled> Mit Produkt/VDA vergleichen</label>
      <button id="deleteAssignment" class="danger" disabled>Zuordnung löschen</button>
      <hr>
      <strong>Konfigurationsstatus</strong><div id="profileValidation" class="parser-result"></div>
    </div></aside>
  </main>`;

const el = Object.fromEntries(["importConfig","exportConfig","newProfile","analyzeMaster","cancelAnalysis","modeSelect","modeDraw","modeEdit","editorStatus","profileCount","profileSearch","profileList","canvasTitle","selectionInfo","masterInput","assignAnchor","editorCanvasWrap","editorEmptyState","editorStage","editorMasterImage","editorCanvas","dirtyBadge","profileName","profileRole","anchorAliases","manualOnly","activeProfile","configuredProfile","assignmentSelect","selectedRegionText","fieldPattern","fieldRequired","fieldCompare","deleteAssignment","profileValidation"].map((id) => [id, document.getElementById(id)]));

initialize().catch((error) => setStatus(`Fehler: ${error.message || error}`, "bad"));

async function initialize() {
  state.config = await loadProfileConfig();
  bindEvents();
  renderProfileList();
  const first = Object.keys(state.config.profiles)[0];
  if (first) selectProfile(first);
  setStatus("Profile geladen. Zuerst ein Profil auswählen.", "ok");
}

function bindEvents() {
  el.importConfig.addEventListener("change", importConfig);
  el.exportConfig.addEventListener("click", exportConfig);
  el.newProfile.addEventListener("click", newProfile);
  el.analyzeMaster.addEventListener("click", analyzeMaster);
  el.cancelAnalysis.addEventListener("click", () => cancelAnalysis("Analyse wurde abgebrochen. Du kannst das Profil manuell einrichten."));
  el.modeSelect.addEventListener("click", () => setMode("select"));
  el.modeDraw.addEventListener("click", () => setMode("draw"));
  el.modeEdit.addEventListener("click", () => setMode("edit"));
  el.masterInput.addEventListener("change", replaceMaster);
  el.assignAnchor.addEventListener("click", assignAnchor);
  document.querySelectorAll("[data-assign-field]").forEach((button) => button.addEventListener("click", () => assignField(button.dataset.assignField)));
  el.profileSearch.addEventListener("input", renderProfileList);
  for (const input of [el.profileName, el.profileRole, el.anchorAliases, el.manualOnly, el.activeProfile, el.configuredProfile]) input.addEventListener("input", updateProfileMeta);
  for (const input of [el.fieldPattern, el.fieldRequired, el.fieldCompare]) input.addEventListener("input", updateSelectedField);
  el.assignmentSelect.addEventListener("change", selectExistingAssignment);
  el.deleteAssignment.addEventListener("click", deleteAssignment);
  el.editorCanvas.addEventListener("pointerdown", canvasPointerDown);
  el.editorCanvas.addEventListener("pointermove", canvasPointerMove);
  el.editorCanvas.addEventListener("pointerup", canvasPointerUp);
  window.addEventListener("resize", () => { layoutStage(); renderCanvas(); });
}

function current() { return state.config?.profiles?.[state.selectedId] || null; }

async function selectProfile(id) {
  if (!state.config.profiles[id]) return;
  state.selectedId = id; state.entries = []; state.selectedEntry = null; state.drawnRect = null;
  const profile = current();
  el.profileName.value = profile.name || id; el.profileRole.value = profile.role || "vda"; el.anchorAliases.value = (profile.anchor?.aliases || []).join("\n");
  el.manualOnly.checked = Boolean(profile.manualOnly); el.activeProfile.checked = profile.active !== false; el.configuredProfile.checked = profile.configured !== false;
  el.canvasTitle.textContent = `${profile.id} – ${profile.name}`;
  await showMasterImage(); await renderCanvas(); renderProfileList(); renderAssignmentOptions(); renderSelectedRegion(); renderValidation();
}

function renderProfileList() {
  const query = el.profileSearch.value.trim().toLowerCase();
  const profiles = Object.values(state.config?.profiles || {}).filter((profile) => !query || `${profile.id} ${profile.name} ${(profile.anchor?.aliases || []).join(" ")}`.toLowerCase().includes(query));
  el.profileList.innerHTML = profiles.map((profile) => `<button class="format-item ${profile.id === state.selectedId ? "active" : ""}" data-profile-id="${escapeAttribute(profile.id)}"><div class="format-id">${escapeHtml(profile.id)} · ${escapeHtml(profile.name)}</div><div class="format-sub">${profile.role === "product" ? "Produkt" : "VDA"}${profile.manualOnly ? " · manuell" : ""}${profile.configured === false ? " · offen" : ""}</div></button>`).join("");
  el.profileList.querySelectorAll("[data-profile-id]").forEach((button) => button.addEventListener("click", () => selectProfile(button.dataset.profileId)));
  el.profileCount.textContent = String(Object.keys(state.config?.profiles || {}).length);
}

async function analyzeMaster() {
  const profile = current();
  if (!profile?.master?.image || state.busy) return;

  state.busy = true;
  state.analysisCancelled = false;
  state.analysisStartedAt = performance.now();
  setAnalysisControls(true);
  setStatus("Florence wird geladen und liest das vollständige Masterbild …", "warn");
  startAnalysisTimer();

  try {
    const client = getClient();
    await withTimeout(client.load(), 120000, "Das Florence-Modell konnte innerhalb von 2 Minuten nicht geladen werden.");
    const response = await withTimeout(
      client.analyze(profile.master.image, profile.role, { editor: true }),
      150000,
      "Florence hat das Masterbild nach 2,5 Minuten noch nicht fertig gelesen.",
    );

    state.entries = parseFlorenceEntries(response.result, response.imageSize);
    profile.master.geometry = state.entries.map((entry) => ({
      x: entry.centerX / response.imageSize[0],
      y: entry.centerY / response.imageSize[1],
      width: entry.width / response.imageSize[0],
      height: entry.height / response.imageSize[1],
    }));

    const anchor = findAnchor(profile, buildTextCandidates(state.entries));
    if (anchor.matched) {
      profile.anchor.masterQuad = anchor.entry.box.map((value, index) => value / response.imageSize[index % 2]);
      state.selectedEntry = anchor.entry;
      markDirty();
      setStatus(`Florence fertig. Anker automatisch gefunden: ${anchor.entry.text}`, "ok");
    } else {
      setStatus(`Florence fertig: ${state.entries.length} Textboxen. Kundenanker bitte anklicken.`, "ok");
    }

    renderCanvas();
    renderSelectedRegion();
    renderValidation();
  } catch (error) {
    if (!state.analysisCancelled) {
      const message = error?.message || String(error);
      cancelAnalysisWorker();
      setStatus(`Florence-Fehler: ${message} Profil kann trotzdem über „Bereich zeichnen“ manuell eingerichtet werden.`, "bad");
    }
  } finally {
    state.busy = false;
    stopAnalysisTimer();
    setAnalysisControls(false);
  }
}

function setAnalysisControls(running) {
  el.analyzeMaster.disabled = running;
  el.cancelAnalysis.disabled = !running;
  el.masterInput.disabled = running;
  el.analyzeMaster.textContent = running ? "Florence läuft …" : "Florence auf Masterbild";
}

function startAnalysisTimer() {
  stopAnalysisTimer();
  state.analysisTimer = setInterval(() => {
    if (!state.busy) return;
    const seconds = Math.round((performance.now() - state.analysisStartedAt) / 1000);
    if (seconds >= 8) setStatus(`Florence liest das Masterbild … ${seconds} s. Das Bild bleibt editierbar; bei Bedarf Analyse abbrechen.`, "warn");
  }, 1000);
}

function stopAnalysisTimer() {
  if (state.analysisTimer) clearInterval(state.analysisTimer);
  state.analysisTimer = null;
}

function cancelAnalysis(message = "Analyse abgebrochen.") {
  if (!state.busy) return;
  state.analysisCancelled = true;
  cancelAnalysisWorker();
  state.busy = false;
  stopAnalysisTimer();
  setAnalysisControls(false);
  setStatus(message, "warn");
}

function cancelAnalysisWorker() {
  try { state.client?.terminate?.("Florence-Analyse abgebrochen."); } catch {}
  state.client = null;
}

function withTimeout(promise, milliseconds, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); }),
  ]).finally(() => clearTimeout(timer));
}

function getClient() {
  if (state.client) return state.client;
  state.client = new FlorenceClient();
  state.client.addEventListener("status", (event) => setStatus(event.detail.text, "warn"));
  state.client.addEventListener("progress", (event) => setStatus(event.detail.progress?.file ? `${event.detail.progress.status || "Laden"}: ${event.detail.progress.file}` : event.detail.progress?.status || "Modell wird geladen …", "warn"));
  return state.client;
}

async function replaceMaster(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (state.busy) cancelAnalysis("Masterbild wurde gewechselt; laufende Florence-Analyse beendet.");
  try {
    const image = await prepareImage(file);
    const profile = current();
    profile.master = { width: image.width, height: image.height, image: image.dataUrl, geometry: [] };
    state.entries = [];
    state.selectedEntry = null;
    state.drawnRect = null;
    markDirty();
    renderAssignmentOptions();
    await showMasterImage();
    renderCanvas();
    renderValidation();
    setStatus("Masterbild geladen. Florence ist optional; Bereiche können sofort manuell gezeichnet werden.", "ok");
  } catch (error) {
    setStatus(`Masterbild-Fehler: ${error.message || error}`, "bad");
  }
}

function assignAnchor() {
  const profile = current(); const rect = selectedNormalizedRect(); if (!profile || !rect) return;
  profile.anchor ||= { aliases: [] };
  profile.anchor.masterQuad = rectToQuad(rect);
  state.selectedEntry = { ...(state.selectedEntry || {}), assignmentKey: "anchor", text: state.selectedEntry?.text || "Kundenanker" };
  markDirty(); renderAssignmentOptions(); renderCanvas(); renderSelectedRegion(); renderValidation();
}

function assignField(key) {
  const profile = current(); const rect = selectedNormalizedRect(); if (!profile || !rect) return;
  profile.fields ||= [];
  let field = profile.fields.find((item) => item.key === key);
  if (!field) { field = { key, ...structuredClone(DEFAULT_FIELDS[key]), rect }; profile.fields.push(field); }
  else field.rect = rect;
  state.selectedEntry = { assignmentKey: key, text: state.selectedEntry?.text || "gezeichneter Bereich" };
  markDirty(); renderAssignmentOptions(); renderCanvas(); renderSelectedRegion(); renderValidation();
}

function selectedNormalizedRect() {
  const profile = current(); if (!profile?.master?.width || !profile?.master?.height) return null;
  if (state.drawnRect) return state.drawnRect;
  if (state.selectedEntry?.assignmentKey === "anchor" && Array.isArray(profile.anchor?.masterQuad)) return quadToRect(profile.anchor.masterQuad);
  const assigned = selectedField();
  if (assigned?.rect && !state.selectedEntry?.box) return assigned.rect;
  if (!state.selectedEntry?.box) return null;
  const xs = [state.selectedEntry.box[0],state.selectedEntry.box[2],state.selectedEntry.box[4],state.selectedEntry.box[6]];
  const ys = [state.selectedEntry.box[1],state.selectedEntry.box[3],state.selectedEntry.box[5],state.selectedEntry.box[7]];
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  return { x: left / profile.master.width, y: top / profile.master.height, width: (right-left) / profile.master.width, height: (bottom-top) / profile.master.height };
}

function updateProfileMeta() {
  const profile = current(); if (!profile) return;
  profile.name = el.profileName.value.trim() || profile.id; profile.role = el.profileRole.value; profile.anchor ||= {}; profile.anchor.aliases = el.anchorAliases.value.split(/\r?\n|;/).map((value) => value.trim()).filter(Boolean);
  profile.manualOnly = el.manualOnly.checked; profile.active = el.activeProfile.checked; profile.configured = el.configuredProfile.checked;
  el.canvasTitle.textContent = `${profile.id} – ${profile.name}`; markDirty(); renderProfileList(); renderValidation();
}

function updateSelectedField() {
  const field = selectedField(); if (!field) return;
  field.pattern = el.fieldPattern.value; field.required = el.fieldRequired.checked; field.compare = el.fieldCompare.checked; markDirty(); renderValidation();
}
function selectedField() { return current()?.fields?.find((field) => field.key === state.selectedEntry?.assignmentKey) || null; }
function deleteAssignment() {
  const profile = current(); if (!profile) return;
  if (state.selectedEntry?.assignmentKey === "anchor") { profile.anchor.masterQuad = []; }
  else { const field = selectedField(); if (!field) return; profile.fields = profile.fields.filter((item) => item !== field); }
  state.selectedEntry = null; markDirty(); renderAssignmentOptions(); renderCanvas(); renderSelectedRegion(); renderValidation();
}

function renderAssignmentOptions() {
  const profile = current();
  el.assignmentSelect.innerHTML = `<option value="">— auswählen —</option><option value="anchor">Kundenanker</option>${(profile?.fields || []).map((field) => `<option value="${field.key}">${escapeHtml(field.label || field.key)}</option>`).join("")}`;
}
function selectExistingAssignment() {
  const value = el.assignmentSelect.value;
  state.drawnRect = null;
  state.selectedEntry = value ? { assignmentKey: value, text: value === "anchor" ? "Kundenanker" : (DEFAULT_FIELDS[value]?.label || value) } : null;
  renderCanvas(); renderSelectedRegion();
}

function setMode(mode) {
  state.mode = mode;
  state.drawnRect = null;
  state.interaction = null;
  el.modeSelect.classList.toggle("primary", mode === "select");
  el.modeDraw.classList.toggle("primary", mode === "draw");
  el.modeEdit.classList.toggle("primary", mode === "edit");
  const messages = {
    select: "Florence-Textbox anklicken.",
    draw: "Mit gedrückter Maustaste ein Rechteck ziehen und anschließend einem Feld zuweisen.",
    edit: "Grünes oder blaues Kästchen ziehen. Einen Eckpunkt ziehen, um die Größe zu ändern.",
  };
  setStatus(messages[mode] || "", "");
  renderCanvas();
}

function canvasPointerDown(event) {
  const point = canvasToImage(event);
  if (!point) return;

  if (state.mode === "edit") {
    const hit = hitTestAssignments(point);
    if (!hit) { state.selectedEntry = null; renderCanvas(); renderSelectedRegion(); return; }
    state.selectedEntry = { assignmentKey: hit.key, text: hit.label };
    el.assignmentSelect.value = hit.key;
    state.interaction = {
      key: hit.key,
      type: hit.handle ? "resize" : "move",
      handle: hit.handle,
      start: point,
      original: { ...hit.rect },
    };
    el.editorCanvas.setPointerCapture(event.pointerId);
    renderCanvas();
    renderSelectedRegion();
    return;
  }

  if (state.mode === "select") {
    state.drawnRect = null;
    const entry = state.entries.map((item) => ({ item, distance: distanceToEntry(point, item) })).sort((a,b) => a.distance-b.distance)[0];
    state.selectedEntry = entry && entry.distance < Math.max(35, Math.min(current().master.width,current().master.height)*0.05) ? entry.item : null;
    renderCanvas();
    renderSelectedRegion();
    return;
  }

  state.dragStart = point;
  state.dragCurrent = point;
  state.selectedEntry = null;
  el.editorCanvas.setPointerCapture(event.pointerId);
  renderCanvas();
}

function canvasPointerMove(event) {
  if (state.mode === "edit" && state.interaction) {
    const point = canvasToImage(event);
    if (!point) return;
    applyAssignmentInteraction(point);
    renderCanvas();
    renderSelectedRegion();
    return;
  }
  if (state.mode !== "draw" || !state.dragStart) return;
  state.dragCurrent = canvasToImage(event);
  renderCanvas();
}

function canvasPointerUp(event) {
  if (state.mode === "edit" && state.interaction) {
    try { el.editorCanvas.releasePointerCapture(event.pointerId); } catch {}
    state.interaction = null;
    markDirty();
    renderValidation();
    renderCanvas();
    return;
  }
  if (state.mode !== "draw" || !state.dragStart) return;
  const end = canvasToImage(event);
  if (!end) return;
  const profile = current();
  const left = Math.min(state.dragStart.x,end.x), right = Math.max(state.dragStart.x,end.x), top = Math.min(state.dragStart.y,end.y), bottom = Math.max(state.dragStart.y,end.y);
  state.drawnRect = clampRect({ x:left/profile.master.width, y:top/profile.master.height, width:(right-left)/profile.master.width, height:(bottom-top)/profile.master.height });
  state.dragStart = null;
  state.dragCurrent = null;
  try { el.editorCanvas.releasePointerCapture(event.pointerId); } catch {}
  renderCanvas();
  renderSelectedRegion();
}

function assignmentItems() {
  const profile = current();
  if (!profile) return [];
  const items = [];
  if (Array.isArray(profile.anchor?.masterQuad) && profile.anchor.masterQuad.length === 8) {
    items.push({ key: "anchor", label: "Kundenanker", rect: quadToRect(profile.anchor.masterQuad) });
  }
  for (const field of profile.fields || []) {
    if (field?.rect) items.push({ key: field.key, label: field.label || field.key, rect: field.rect });
  }
  return items;
}

function hitTestAssignments(point) {
  const profile = current();
  if (!profile?.master) return null;
  const x = point.x / profile.master.width;
  const y = point.y / profile.master.height;
  const canvasRect = el.editorCanvas.getBoundingClientRect();
  const handleX = 13 / Math.max(1, canvasRect.width);
  const handleY = 13 / Math.max(1, canvasRect.height);
  const items = assignmentItems().sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height);
  for (const item of items) {
    const corners = {
      nw: [item.rect.x, item.rect.y],
      ne: [item.rect.x + item.rect.width, item.rect.y],
      se: [item.rect.x + item.rect.width, item.rect.y + item.rect.height],
      sw: [item.rect.x, item.rect.y + item.rect.height],
    };
    for (const [handle, corner] of Object.entries(corners)) {
      if (Math.abs(x - corner[0]) <= handleX && Math.abs(y - corner[1]) <= handleY) return { ...item, handle };
    }
    if (x >= item.rect.x && x <= item.rect.x + item.rect.width && y >= item.rect.y && y <= item.rect.y + item.rect.height) return item;
  }
  return null;
}

function applyAssignmentInteraction(point) {
  const profile = current();
  const interaction = state.interaction;
  if (!profile || !interaction) return;
  const dx = (point.x - interaction.start.x) / profile.master.width;
  const dy = (point.y - interaction.start.y) / profile.master.height;
  let rect = { ...interaction.original };

  if (interaction.type === "move") {
    rect.x += dx;
    rect.y += dy;
  } else {
    const right = rect.x + rect.width;
    const bottom = rect.y + rect.height;
    if (interaction.handle.includes("n")) rect.y += dy;
    if (interaction.handle.includes("s")) rect.height = bottom + dy - rect.y;
    if (interaction.handle.includes("w")) rect.x += dx;
    if (interaction.handle.includes("e")) rect.width = right + dx - rect.x;
    if (interaction.handle.includes("n")) rect.height = bottom - rect.y;
    if (interaction.handle.includes("w")) rect.width = right - rect.x;
  }

  rect = clampRect(rect);
  setAssignmentRect(interaction.key, rect);
}

function setAssignmentRect(key, rect) {
  const profile = current();
  if (!profile) return;
  if (key === "anchor") profile.anchor.masterQuad = rectToQuad(rect);
  else {
    const field = (profile.fields || []).find((item) => item.key === key);
    if (field) field.rect = rect;
  }
}

function clampRect(rect) {
  const min = 0.006;
  let width = Math.max(min, Number(rect.width || 0));
  let height = Math.max(min, Number(rect.height || 0));
  let x = Math.max(0, Math.min(1 - width, Number(rect.x || 0)));
  let y = Math.max(0, Math.min(1 - height, Number(rect.y || 0)));
  width = Math.min(width, 1 - x);
  height = Math.min(height, 1 - y);
  return { x, y, width, height };
}

async function showMasterImage() {
  const profile = current();
  if (!profile?.master?.image) {
    el.editorStage.classList.add("hidden");
    el.editorEmptyState.classList.remove("hidden");
    state.view = null;
    return;
  }
  if (el.editorMasterImage.src !== profile.master.image) el.editorMasterImage.src = profile.master.image;
  try { await el.editorMasterImage.decode(); } catch {}
  el.editorEmptyState.classList.add("hidden");
  el.editorStage.classList.remove("hidden");
  layoutStage();
}

function layoutStage() {
  const profile = current();
  if (!profile?.master?.image || !profile.master.width || !profile.master.height) return;
  const availableWidth = Math.max(100, el.editorCanvasWrap.clientWidth - 16);
  const availableHeight = Math.max(100, el.editorCanvasWrap.clientHeight - 16);
  const scale = Math.min(availableWidth / profile.master.width, availableHeight / profile.master.height);
  const width = Math.max(1, Math.round(profile.master.width * scale));
  const height = Math.max(1, Math.round(profile.master.height * scale));
  el.editorStage.style.width = `${width}px`;
  el.editorStage.style.height = `${height}px`;
  el.editorCanvas.width = profile.master.width;
  el.editorCanvas.height = profile.master.height;
  state.view = { width: profile.master.width, height: profile.master.height };
}

async function renderCanvas() {
  const canvas = el.editorCanvas;
  const profile = current();
  await showMasterImage();
  if (!profile?.master?.image) return;
  layoutStage();

  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  const strokeScale = Math.max(1, Math.min(profile.master.width, profile.master.height) / 800);

  for (const entry of state.entries) drawQuad(context, entry.box, "#ffa31a", "rgba(255,163,26,.07)", 1, 0, 0, "", strokeScale);
  const anchor = profile.anchor?.masterQuad?.map((value,index)=>value*(index%2?profile.master.height:profile.master.width));
  if (anchor?.length === 8) drawQuad(context,anchor,"#40d486","rgba(64,212,134,.12)",1,0,0,"ANKER",strokeScale);
  for (const field of profile.fields||[]) {
    if (!field?.rect) continue;
    const quad=rectToQuad(field.rect).map((value,index)=>value*(index%2?profile.master.height:profile.master.width));
    drawQuad(context,quad,"#55c2f2","rgba(85,194,242,.10)",1,0,0,field.label||field.key,strokeScale);
  }
  if(state.selectedEntry?.box) drawQuad(context,state.selectedEntry.box,"#ffffff","rgba(255,255,255,.10)",1,0,0,"AUSWAHL",strokeScale);
  if(state.drawnRect){const quad=rectToQuad(state.drawnRect).map((value,index)=>value*(index%2?profile.master.height:profile.master.width));drawQuad(context,quad,"#ffffff","rgba(255,255,255,.10)",1,0,0,"NEU",strokeScale);}
  if(state.dragStart&&state.dragCurrent){const q=[state.dragStart.x,state.dragStart.y,state.dragCurrent.x,state.dragStart.y,state.dragCurrent.x,state.dragCurrent.y,state.dragStart.x,state.dragCurrent.y];drawQuad(context,q,"#ffffff","rgba(255,255,255,.08)",1,0,0,"",strokeScale);}

  const selectedKey = state.selectedEntry?.assignmentKey;
  if (state.mode === "edit" && selectedKey) {
    const item = assignmentItems().find((candidate) => candidate.key === selectedKey);
    if (item) drawHandles(context, item.rect, profile.master);
  }
}

function drawHandles(context, rect, master) {
  const points = [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x + rect.width, rect.y + rect.height],
    [rect.x, rect.y + rect.height],
  ];
  const size = Math.max(7, Math.min(master.width, master.height) * 0.012);
  context.fillStyle = "#ffffff";
  context.strokeStyle = "#07111f";
  context.lineWidth = Math.max(2, size * 0.18);
  for (const point of points) {
    const x = point[0] * master.width;
    const y = point[1] * master.height;
    context.beginPath();
    context.rect(x - size / 2, y - size / 2, size, size);
    context.fill();
    context.stroke();
  }
}

function renderSelectedRegion() {
  const field = selectedField(); const rect = selectedNormalizedRect();
  el.assignmentSelect.value = state.selectedEntry?.assignmentKey || "";
  el.selectionInfo.textContent = state.selectedEntry?.text || (state.drawnRect ? "Gezeichneter Bereich" : "—");
  el.selectedRegionText.textContent = rect ? `${state.selectedEntry?.text || "Bereich"}\n${JSON.stringify(rect,null,2)}` : "Keine Auswahl.";
  el.fieldPattern.disabled=!field; el.fieldRequired.disabled=!field; el.fieldCompare.disabled=!field; el.deleteAssignment.disabled=!(field || state.selectedEntry?.assignmentKey === "anchor");
  el.fieldPattern.value=field?.pattern||""; el.fieldRequired.checked=Boolean(field?.required); el.fieldCompare.checked=Boolean(field?.compare);
}

function renderValidation() {
  const profile=current(); if(!profile)return;
  const issues=[];
  if(!(profile.anchor?.aliases||[]).length)issues.push("Kein Kunden-/Ankername.");
  if(!Array.isArray(profile.anchor?.masterQuad)||profile.anchor.masterQuad.length!==8)issues.push("Ankerposition fehlt.");
  for(const key of ["batch","idh","weight"]){if(!(profile.fields||[]).some((field)=>field.key===key))issues.push(`${DEFAULT_FIELDS[key].label} fehlt.`);}
  if(!(profile.master?.geometry||[]).length)issues.push("Master-Geometrie fehlt: Florence auf Masterbild ausführen.");
  el.profileValidation.textContent=issues.length?issues.join("\n"):"Profil vollständig konfiguriert.";
}

async function importConfig(event) { const file=event.target.files?.[0];event.target.value="";if(!file)return;try{const parsed=JSON.parse(await file.text());validateConfig(parsed);state.config=parsed;renderProfileList();selectProfile(Object.keys(parsed.profiles)[0]);setStatus("Konfiguration importiert.","ok");}catch(error){setStatus(`Importfehler: ${error.message||error}`,"bad");} }
function exportConfig(){state.config.exportedAt=new Date().toISOString();state.config.configVersion="0.2.2";const blob=new Blob([JSON.stringify(state.config,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="label-profiles.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);el.dirtyBadge.textContent="exportiert";}
function newProfile(){const id=(prompt("Eindeutige Profil-ID:",`Profile_${String(Object.keys(state.config.profiles).length+1).padStart(3,"0")}`)||"").trim();if(!id||state.config.profiles[id])return;state.config.profiles[id]={id,name:id,role:"vda",active:true,configured:false,manualOnly:false,anchor:{aliases:[],masterQuad:[]},master:{width:1000,height:700,image:"",geometry:[]},fields:[],codeRegions:[]};markDirty();renderProfileList();selectProfile(id);}
function markDirty(){el.dirtyBadge.textContent="geändert";el.dirtyBadge.style.color="#ffd18a";}
function setStatus(text,type=""){el.editorStatus.textContent=text;el.editorStatus.className=`status ${type}`;}
function quadToRect(quad){const xs=[quad[0],quad[2],quad[4],quad[6]],ys=[quad[1],quad[3],quad[5],quad[7]];const x=Math.min(...xs),y=Math.min(...ys);return{x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y};}
function rectToQuad(rect){return [rect.x,rect.y,rect.x+rect.width,rect.y,rect.x+rect.width,rect.y+rect.height,rect.x,rect.y+rect.height];}
function drawQuad(ctx,quad,stroke,fill,scale,ox,oy,label="",strokeScale=1){ctx.beginPath();for(let i=0;i<8;i+=2){const x=ox+quad[i]*scale,y=oy+quad[i+1]*scale;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.closePath();ctx.strokeStyle=stroke;ctx.fillStyle=fill;ctx.lineWidth=2*strokeScale;ctx.fill();ctx.stroke();if(label){ctx.fillStyle=stroke;ctx.font=`bold ${Math.max(12,12*strokeScale)}px system-ui`;ctx.fillText(label,ox+quad[0]*scale+4*strokeScale,Math.max(14*strokeScale,oy+quad[1]*scale-5*strokeScale));}}
function canvasToImage(event){if(!state.view)return null;const rect=el.editorCanvas.getBoundingClientRect();return{x:(event.clientX-rect.left)*(el.editorCanvas.width/Math.max(1,rect.width)),y:(event.clientY-rect.top)*(el.editorCanvas.height/Math.max(1,rect.height))};}
function distanceToEntry(point,entry){const dx=Math.max(entry.left-point.x,0,point.x-entry.right),dy=Math.max(entry.top-point.y,0,point.y-entry.bottom);return Math.hypot(dx,dy);}
function loadImage(src){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error("Masterbild konnte nicht geladen werden."));image.src=src;});}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[c]);}
function escapeAttribute(value){return escapeHtml(value).replace(/`/g,"&#096;");}
