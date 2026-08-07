import "./styles.css";
import { APP_VERSION, MODEL_OPTIONS, QUALITY_PRESETS } from "./config.js";
import { PaddleOcrEngine, formatRuntimeDetails } from "./ocr-engine.js";
import { prepareImage, releasePreparedImage } from "./image-tools.js";
import { RUNTIME_POLICY } from "./runtime-policy.js";
import { renderComparison, renderFieldEditor, renderPreview } from "./render.js";
import { applyManualValue, autoSelectProfile, extractProfileFields, loadProfiles } from "./profile-engine.js";
import { compareExtractions } from "./comparison.js";
import { clearRecords, loadRecords, saveRecord } from "./storage.js";
import { exportRecords } from "./excel-export.js";
import { formatMilliseconds, safeError, serializableResult } from "./utils.js";

const engine = new PaddleOcrEngine();
let profiles = [];
let records = loadRecords();
let comparison = null;
const slots = { product: createSlot("product"), vda: createSlot("vda") };
const el = (id) => document.getElementById(id);

el("version").textContent = `v${APP_VERSION}`;
setupOptions();
setupSlot("product");
setupSlot("vda");
setupActions();
renderAll();
Promise.all([
  loadProfiles().then((loaded) => { profiles = loaded; populateProfiles(); }),
  initializeEngine()
]).catch(() => {});

function createSlot(key) {
  return {
    key,
    file: null,
    prepared: null,
    result: null,
    wallMs: null,
    error: "",
    state: "empty",
    profile: null,
    extraction: null,
    manual: false,
    selectedProfileId: ""
  };
}

function setupOptions() {
  for (const model of Object.values(MODEL_OPTIONS)) el("modelSelect").append(new Option(model.label, model.key));
  for (const preset of Object.values(QUALITY_PRESETS)) el("qualitySelect").append(new Option(preset.label, preset.key));
  el("modelSelect").value = "standard";
  el("qualitySelect").value = "balanced";
}

function setupSlot(key) {
  el(`${key}Input`).addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await loadFile(key, file);
  });
  el(`${key}Profile`).addEventListener("change", () => selectProfile(key, el(`${key}Profile`).value));
}

function setupActions() {
  el("initializeButton").onclick = () => initializeEngine(true);
  el("analyzeAllButton").onclick = analyzeAll;
  el("saveButton").onclick = storeCurrent;
  el("excelButton").onclick = () => exportRecords(records);
  el("clearButton").onclick = () => {
    if (confirm("Lokales Protokoll wirklich leeren?")) {
      records = clearRecords();
      renderLog();
    }
  };
  el("debugButton").onclick = exportDebug;
}

function populateProfiles() {
  for (const key of ["product", "vda"]) {
    const select = el(`${key}Profile`);
    select.replaceChildren(new Option("Automatisch", ""));
    profiles.filter((profile) => profile.role === key).forEach((profile) => select.append(new Option(profile.name, profile.id)));
    select.value = slots[key].selectedProfileId || "";
  }
}

async function initializeEngine(force = false) {
  if (!force && engine.ready) return true;
  setEngineStatus("PaddleOCR wird vorbereitet …", "wait");
  try {
    const info = await engine.initialize("standard", (message) => setEngineStatus(message, "wait"), force);
    setEngineStatus(`PaddleOCR bereit · ${info.mode}`, "ok");
    el("engineDetails").textContent = `Initialisierung ${formatMilliseconds(info.initMs)} · ${formatRuntimeDetails(info.summary)}`;
    return true;
  } catch (error) {
    setEngineStatus(`PaddleOCR nicht bereit: ${safeError(error)}`, "bad");
    return false;
  }
}

function currentPreset() {
  const requested = QUALITY_PRESETS[el("qualitySelect")?.value] || QUALITY_PRESETS.balanced;
  return {
    ...requested,
    maxImageSide: RUNTIME_POLICY.scannerMaxImageSide
      ? Math.min(requested.maxImageSide, RUNTIME_POLICY.scannerMaxImageSide)
      : requested.maxImageSide,
    textDetLimitSideLen: RUNTIME_POLICY.scannerDetLimitSideLen
      ? Math.min(requested.textDetLimitSideLen, RUNTIME_POLICY.scannerDetLimitSideLen)
      : requested.textDetLimitSideLen
  };
}

async function loadFile(key, file) {
  const slot = slots[key];
  releasePreparedImage(slot.prepared);

  // Jedes neue Foto beginnt ausdrücklich wieder im Automatikmodus. Das erkannte
  // Profil wird intern gespeichert, der Select bleibt aber auf "Automatisch".
  Object.assign(slot, {
    file,
    prepared: null,
    result: null,
    extraction: null,
    error: "",
    state: "preparing",
    manual: false,
    profile: null,
    selectedProfileId: ""
  });
  el(`${key}Profile`).value = "";
  renderSlot(key);

  try {
    const preset = currentPreset();
    slot.prepared = await prepareImage(file, preset.maxImageSide);
    slot.state = "ready";
    renderSlot(key);
    // Safari/iOS bekommt einen Paint-Zyklus, bevor der OCR-Worker startet.
    await nextPaint();
    await analyzeSlot(key);
  } catch (error) {
    slot.error = safeError(error);
    slot.state = "error";
    renderSlot(key);
  }
}

async function analyzeSlot(key) {
  const slot = slots[key];
  if (!slot.prepared || !(await initializeEngine())) return;
  slot.state = "analyzing";
  renderSlot(key);
  await nextPaint();

  try {
    const preset = currentPreset();
    const out = await engine.predict(slot.prepared.canvas, {
      textDetLimitSideLen: preset.textDetLimitSideLen,
      textDetLimitType: "min",
      textDetMaxSideLimit: RUNTIME_POLICY.family === "ios" ? 1800 : 2400,
      textDetThresh: 0.25,
      textDetBoxThresh: preset.textDetBoxThresh,
      textDetUnclipRatio: 1.55,
      textRecScoreThresh: preset.textRecScoreThresh
    });
    slot.result = out.result;
    slot.wallMs = out.wallMs;
    slot.state = "done";
    setEngineStatus(`PaddleOCR bereit · ${out.mode}`, "ok");
    const metrics = out.result?.metrics || {};
    el("engineDetails").textContent = [
      formatRuntimeDetails(engine.summary, out.runtime),
      Number.isFinite(metrics.detMs) ? `Detektion ${formatMilliseconds(metrics.detMs)}` : "",
      Number.isFinite(metrics.recMs) ? `Erkennung ${formatMilliseconds(metrics.recMs)}` : ""
    ].filter(Boolean).join(" · ");
    resolveProfile(key);
  } catch (error) {
    slot.error = safeError(error);
    slot.state = "error";
  }
  renderAll();
}

async function analyzeAll() {
  for (const key of ["product", "vda"]) if (slots[key].prepared) await analyzeSlot(key);
}

function resolveProfile(key) {
  const slot = slots[key];
  if (!slot.result) return;

  let profile = slot.selectedProfileId
    ? profiles.find((candidate) => candidate.id === slot.selectedProfileId) || null
    : null;

  if (!profile) {
    const match = autoSelectProfile(slot.result.items, profiles, key);
    profile = match?.profile || null;
  }

  slot.profile = profile;
  slot.extraction = profile ? extractProfileFields(slot.result.items, profile, slot.result.image) : null;
  // Wichtig: automatisch erkanntes Profil NICHT in den Select schreiben.
  el(`${key}Profile`).value = slot.selectedProfileId || "";
  comparison = slots.product.extraction && slots.vda.extraction
    ? compareExtractions(slots.product.extraction, slots.vda.extraction)
    : null;
}

function selectProfile(key, id) {
  const slot = slots[key];
  slot.selectedProfileId = id || "";
  slot.profile = id ? profiles.find((profile) => profile.id === id) || null : null;

  if (slot.result) {
    if (slot.selectedProfileId) {
      slot.extraction = slot.profile ? extractProfileFields(slot.result.items, slot.profile, slot.result.image) : null;
      comparison = slots.product.extraction && slots.vda.extraction
        ? compareExtractions(slots.product.extraction, slots.vda.extraction)
        : null;
    } else {
      resolveProfile(key);
    }
  }
  renderAll();
}

function editField(key, field, value) {
  const slot = slots[key];
  applyManualValue(slot.extraction, field, value);
  slot.manual = true;
  comparison = slots.product.extraction && slots.vda.extraction
    ? compareExtractions(slots.product.extraction, slots.vda.extraction)
    : null;
  renderAll();
}

function renderAll() {
  renderSlot("product");
  renderSlot("vda");
  renderComparison(el("comparison"), comparison);
  renderLog();
  el("saveButton").disabled = !comparison;
  el("excelButton").disabled = !records.length;
}

function renderSlot(key) {
  const slot = slots[key];
  renderPreview(el(`${key}Preview`), slot.prepared, slot.extraction?.overlays || [], RUNTIME_POLICY.previewMaxSide);
  const status = el(`${key}Status`);
  if (slot.state === "analyzing") {
    status.textContent = `PaddleOCR analysiert …${RUNTIME_POLICY.family === "ios" ? " · iPhone-Sicherheitsmodus" : ""}`;
    status.className = "slot-status wait";
  } else if (slot.state === "error") {
    status.textContent = `Fehler: ${slot.error}`;
    status.className = "slot-status bad";
  } else if (slot.state === "done") {
    status.textContent = `${formatMilliseconds(slot.wallMs)} · ${slot.result?.items?.length || 0} Textzeilen · ${slot.profile?.name || "Profil nicht erkannt"}${slot.extraction?.warning ? ` · ${slot.extraction.warning}` : ""}`;
    status.className = `slot-status ${slot.profile ? "ok" : "warn"}`;
  } else {
    status.textContent = slot.prepared ? "Bild vorbereitet" : "Noch kein Bild";
    status.className = "slot-status";
  }
  renderFieldEditor(el(`${key}Fields`), slot.extraction, (field, value) => editField(key, field, value));
}

function storeCurrent() {
  if (!comparison) return;
  const record = {
    timestamp: new Date().toISOString(),
    result: comparison.message,
    productProfile: slots.product.profile?.name || "",
    vdaProfile: slots.vda.profile?.name || "",
    product: values(slots.product.extraction),
    vda: values(slots.vda.extraction),
    manual: slots.product.manual || slots.vda.manual
  };
  records = saveRecord(record);
  renderAll();
}

function values(extraction) {
  const output = {};
  for (const [key, value] of Object.entries(extraction?.fields || {})) output[key] = value.value || "";
  return output;
}

function renderLog() {
  el("logCount").textContent = `${records.length} Datensätze`;
  const body = el("logBody");
  body.replaceChildren();
  records.slice(0, 30).forEach((record) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${new Date(record.timestamp).toLocaleString()}</td><td>${record.product.batch || "–"}</td><td>${record.product.drum_number || "–"}</td><td>${record.vda.batch || "–"}</td><td>${record.result}</td>`;
    body.append(row);
  });
}

function exportDebug() {
  const payload = {
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    runtimePolicy: RUNTIME_POLICY,
    product: debugSlot(slots.product),
    vda: debugSlot(slots.vda),
    comparison
  };
  download(JSON.stringify(payload, null, 2), `labelcheck-debug-${Date.now()}.json`, "application/json");
}

function debugSlot(slot) {
  return {
    profileMode: slot.selectedProfileId ? "manual" : "automatic",
    profile: slot.profile,
    extraction: slot.extraction,
    result: serializableResult(slot.result),
    wallMs: slot.wallMs
  };
}

function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setEngineStatus(text, className) {
  el("engineBadge").textContent = text;
  el("engineBadge").className = `engine-badge ${className}`;
}

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}
