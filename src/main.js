import "./styles.css";
import { APP_VERSION, MODEL_OPTIONS, QUALITY_PRESETS } from "./config.js";
import { PaddleOcrEngine, formatRuntimeDetails } from "./ocr-engine.js";
import { prepareImage, releasePreparedImage } from "./image-tools.js";
import {
  clearOcrInFlight,
  getCompatibilityReason,
  getRuntimePolicy,
  isCompatibilityMode,
  markOcrInFlight,
  recoverCompatibilityMode,
  setCompatibilityMode
} from "./runtime-policy.js";
import { renderComparison, renderFieldEditor, renderPreview } from "./render.js";
import { detectQrProfile } from "./qr-engine.js";
import { applyManualValue, autoSelectProfile, extractProfileFields, extractQrProfileFields, loadProfiles } from "./profile-engine.js";
import { compareExtractions } from "./comparison.js";
import { clearRecords, loadRecords, saveRecord } from "./storage.js";
import { exportRecords, LOG_COLUMNS, recordsToRows } from "./excel-export.js";
import { formatMilliseconds, safeError, serializableResult } from "./utils.js";

const crashRecovery = recoverCompatibilityMode();
const engine = new PaddleOcrEngine();
let profiles = [];
let records = loadRecords();
let comparison = null;
let dataRevision = 0;
let lastSavedRevision = -1;
const slots = { product: createSlot("product"), vda: createSlot("vda") };
const el = (id) => document.getElementById(id);

el("version").textContent = `v${APP_VERSION}`;
setupOptions();
setupSlot("product");
setupSlot("vda");
setupActions();
setupCompatibilityMode();
renderAll();
const profilesReady = loadProfiles().then((loaded) => {
  profiles = loaded;
  populateProfiles();
  return profiles;
});
Promise.all([profilesReady, initializeEngine()]).catch(() => {});

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
    selectedProfileId: "",
    generation: 0
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
  el(`${key}Profile`).addEventListener("change", async () => {
    await selectProfile(key, el(`${key}Profile`).value);
  });
}

function setupActions() {
  el("initializeButton").onclick = () => initializeEngine(true);
  el("analyzeAllButton").onclick = analyzeAll;
  el("saveButton").onclick = storeCurrent;
  el("excelButton").onclick = () => exportRecords(records);
  el("clearButton").onclick = () => {
    if (!confirm("Lokales Protokoll wirklich leeren?")) return;
    try {
      records = clearRecords();
      renderLog();
    } catch (error) {
      alert(`Protokoll konnte nicht geleert werden. ${safeError(error)}`);
    }
  };
  el("debugButton").onclick = exportDebug;
}


function setupCompatibilityMode() {
  const toggle = el("compatibilityToggle");
  if (!toggle) return;
  toggle.checked = isCompatibilityMode();
  toggle.addEventListener("change", async () => {
    const enabled = toggle.checked;
    clearOcrInFlight();
    setCompatibilityMode(enabled, "manual");
    await engine.dispose();
    setEngineStatus(enabled
      ? "Kompatibilitätsmodus aktiviert · PaddleOCR wird neu geladen …"
      : "Normalmodus aktiviert · PaddleOCR wird neu geladen …", "wait");
    await initializeEngine(true);
    renderAll();
  });
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
    const reason = getCompatibilityReason();
    el("engineDetails").textContent = [
      `Initialisierung ${formatMilliseconds(info.initMs)}`,
      formatRuntimeDetails(info.summary),
      isCompatibilityMode() && reason === "ocr-crash-recovery" ? "Stabiler Modus nach vorherigem OCR-Absturz automatisch aktiviert" : "",
      isCompatibilityMode() && reason === "mobile-default" ? "Mobilgerät · stabiler Modus standardmäßig aktiv" : ""
    ].filter(Boolean).join(" · ");
    return true;
  } catch (error) {
    setEngineStatus(`PaddleOCR nicht bereit: ${safeError(error)}`, "bad");
    return false;
  }
}

function currentPreset() {
  const policy = getRuntimePolicy();
  const requested = QUALITY_PRESETS[el("qualitySelect")?.value] || QUALITY_PRESETS.balanced;
  return {
    ...requested,
    maxImageSide: policy.scannerMaxImageSide
      ? Math.min(requested.maxImageSide, policy.scannerMaxImageSide)
      : requested.maxImageSide,
    textDetLimitSideLen: policy.scannerDetLimitSideLen
      ? Math.min(requested.textDetLimitSideLen, policy.scannerDetLimitSideLen)
      : requested.textDetLimitSideLen
  };
}

async function loadFile(key, file) {
  const slot = slots[key];
  const previousPrepared = slot.prepared;
  const previousWasAnalyzing = slot.state === "analyzing";
  const generation = Number(slot.generation || 0) + 1;
  if (!previousWasAnalyzing) releasePreparedImage(previousPrepared);
  markDataDirty();

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
    selectedProfileId: "",
    generation
  });
  el(`${key}Profile`).value = "";
  renderSlot(key);

  try {
    const preset = currentPreset();
    const policy = getRuntimePolicy();
    const prepared = await prepareImage(file, preset.maxImageSide, {
      resizeDuringDecode: policy.resizeDuringDecode
    });
    if (!isCurrentSlotRequest(slot, generation)) {
      releasePreparedImage(prepared);
      return;
    }
    slot.prepared = prepared;

    // QR-Profile werden vor PaddleOCR geprüft. Tesla kann dadurch vollständig
    // aus dem kleinen QR-Code links unten gelesen werden und benötigt weder OCR
    // noch einen geometrischen Textanker.
    try { await profilesReady; } catch { /* OCR-Fallback bleibt möglich. */ }
    if (!isCurrentSlotRequest(slot, generation, prepared)) return;
    const qrStartedAt = performance.now();
    const qrMatch = detectQrProfile(prepared.canvas, profiles, key);
    if (!isCurrentSlotRequest(slot, generation, prepared)) return;
    if (qrMatch) {
      slot.wallMs = performance.now() - qrStartedAt;
      slot.result = {
        items: [],
        image: { width: prepared.width, height: prepared.height },
        metrics: { qrMs: slot.wallMs },
        qr: { raw: qrMatch.raw, parser: qrMatch.parsed.parser }
      };
      slot.profile = qrMatch.profile;
      slot.extraction = extractQrProfileFields(qrMatch.profile, qrMatch);
      slot.state = "done";
      comparison = slots.product.extraction && slots.vda.extraction
        ? compareExtractions(slots.product.extraction, slots.vda.extraction)
        : null;
      renderAll();
      return;
    }

    markOcrInFlight("photo-prepared", {
      slot: key,
      generation,
      backend: policy.backend,
      width: prepared.width,
      height: prepared.height,
      appVersion: APP_VERSION
    });
    slot.state = "ready";
    renderSlot(key);
    // Safari/iOS bekommt einen Paint-Zyklus, bevor der OCR-Worker startet.
    await nextPaint();
    if (!isCurrentSlotRequest(slot, generation, prepared)) {
      clearOcrInFlight({ slot: key, generation });
      return;
    }
    await analyzeSlot(key, generation);
  } catch (error) {
    if (!isCurrentSlotRequest(slot, generation)) return;
    clearOcrInFlight({ slot: key, generation });
    slot.error = safeError(error);
    slot.state = "error";
    renderSlot(key);
  }
}

async function analyzeSlot(key, expectedGeneration = null) {
  const slot = slots[key];
  const generation = expectedGeneration ?? slot.generation;
  const prepared = slot.prepared;
  if (!prepared || !isCurrentSlotRequest(slot, generation, prepared)) return;
  if (!(await initializeEngine())) {
    if (isCurrentSlotRequest(slot, generation, prepared)) clearOcrInFlight({ slot: key, generation });
    return;
  }
  if (!isCurrentSlotRequest(slot, generation, prepared)) return;
  slot.state = "analyzing";
  renderSlot(key);
  await nextPaint();
  if (!isCurrentSlotRequest(slot, generation, prepared)) {
    clearOcrInFlight({ slot: key, generation });
    releasePreparedImage(prepared);
    return;
  }

  try {
    const preset = currentPreset();
    const policy = getRuntimePolicy();
    markOcrInFlight("predict", {
      slot: key,
      generation,
      backend: policy.backend,
      width: prepared.width,
      height: prepared.height,
      appVersion: APP_VERSION
    });
    const out = await engine.predict(prepared.canvas, {
      textDetLimitSideLen: preset.textDetLimitSideLen,
      textDetLimitType: "min",
      textDetMaxSideLimit: policy.textDetMaxSideLimit,
      textDetThresh: 0.25,
      textDetBoxThresh: preset.textDetBoxThresh,
      textDetUnclipRatio: 1.55,
      textRecScoreThresh: preset.textRecScoreThresh
    });
    if (!isCurrentSlotRequest(slot, generation, prepared)) return;
    slot.result = out.result;
    slot.wallMs = out.wallMs;
    slot.state = "done";
    markDataDirty();
    setEngineStatus(`PaddleOCR bereit · ${out.mode}`, "ok");
    const metrics = out.result?.metrics || {};
    el("engineDetails").textContent = [
      formatRuntimeDetails(engine.summary, out.runtime),
      Number.isFinite(metrics.detMs) ? `Detektion ${formatMilliseconds(metrics.detMs)}` : "",
      Number.isFinite(metrics.recMs) ? `Erkennung ${formatMilliseconds(metrics.recMs)}` : ""
    ].filter(Boolean).join(" · ");
    resolveProfile(key);
  } catch (error) {
    if (!isCurrentSlotRequest(slot, generation, prepared)) return;
    slot.error = safeError(error);
    slot.state = "error";
  } finally {
    clearOcrInFlight({ slot: key, generation });
    if (!isCurrentSlotRequest(slot, generation, prepared)) releasePreparedImage(prepared);
  }
  if (isCurrentSlotRequest(slot, generation, prepared)) renderAll();
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

async function selectProfile(key, id) {
  const slot = slots[key];
  const generation = slot.generation;
  slot.selectedProfileId = id || "";
  slot.profile = id ? profiles.find((profile) => profile.id === id) || null : null;
  markDataDirty();

  if (slot.selectedProfileId && slot.profile?.source?.type === "qr" && slot.prepared) {
    const startedAt = performance.now();
    const qrMatch = detectQrProfile(slot.prepared.canvas, [slot.profile], key);
    if (!isCurrentSlotRequest(slot, generation, slot.prepared)) return;
    slot.wallMs = performance.now() - startedAt;
    slot.extraction = extractQrProfileFields(slot.profile, qrMatch);
    if (qrMatch) {
      slot.result = slot.result || {
        items: [],
        image: { width: slot.prepared.width, height: slot.prepared.height },
        metrics: {}
      };
      slot.result.qr = { raw: qrMatch.raw, parser: qrMatch.parsed.parser };
      slot.result.metrics = { ...(slot.result.metrics || {}), qrMs: slot.wallMs };
    }
    slot.state = "done";
    comparison = slots.product.extraction && slots.vda.extraction
      ? compareExtractions(slots.product.extraction, slots.vda.extraction)
      : null;
    renderAll();
    return;
  }

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
  markDataDirty();
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
  el("saveButton").disabled = !comparison || dataRevision === lastSavedRevision;
  el("excelButton").disabled = !records.length;
}

function renderSlot(key) {
  const slot = slots[key];
  const policy = getRuntimePolicy();
  renderPreview(el(`${key}Preview`), slot.prepared, slot.extraction?.overlays || [], policy.previewMaxSide);
  const status = el(`${key}Status`);
  if (slot.state === "analyzing") {
    status.textContent = `PaddleOCR analysiert …${policy.compatibilityMode ? " · Kompatibilitätsmodus" : ""}`;
    status.className = "slot-status wait";
  } else if (slot.state === "error") {
    status.textContent = `Fehler: ${slot.error}`;
    status.className = "slot-status bad";
  } else if (slot.state === "done") {
    const sourceInfo = slot.extraction?.qr
      ? "QR-Code"
      : `${slot.result?.items?.length || 0} Textzeilen`;
    const quality = imageQualityHint(slot.prepared);
    status.textContent = `${formatMilliseconds(slot.wallMs)} · ${sourceInfo} · ${slot.profile?.name || "Profil nicht erkannt"}${slot.extraction?.warning ? ` · ${slot.extraction.warning}` : ""}${quality ? ` · ${quality}` : ""}`;
    status.className = `slot-status ${slot.profile && !quality ? "ok" : "warn"}`;
  } else {
    const quality = imageQualityHint(slot.prepared);
    status.textContent = slot.prepared ? `Bild vorbereitet${quality ? ` · ${quality}` : ""}` : "Noch kein Bild";
    status.className = `slot-status ${quality ? "warn" : ""}`.trim();
  }
  renderFieldEditor(el(`${key}Fields`), slot.extraction, (field, value) => editField(key, field, value));
}

function storeCurrent() {
  if (!comparison || dataRevision === lastSavedRevision) return;
  const record = {
    timestamp: new Date().toISOString(),
    status: comparison.status,
    result: comparison.message,
    productProfile: slots.product.profile?.name || "",
    vdaProfile: slots.vda.profile?.name || "",
    product: values(slots.product.extraction),
    vda: values(slots.vda.extraction),
    manual: slots.product.manual || slots.vda.manual
  };
  try {
    records = saveRecord(record);
    lastSavedRevision = dataRevision;
    renderAll();
  } catch (error) {
    alert(`Datensatz konnte nicht gespeichert werden. ${safeError(error)}`);
  }
}

function values(extraction) {
  const output = {};
  for (const [key, value] of Object.entries(extraction?.fields || {})) output[key] = value.value || "";
  return output;
}

function renderLog() {
  el("logCount").textContent = `${records.length} Datensätze`;
  const head = el("logHead");
  const body = el("logBody");
  head.replaceChildren();
  body.replaceChildren();

  const headerRow = document.createElement("tr");
  for (const column of LOG_COLUMNS) {
    const th = document.createElement("th");
    th.textContent = column.key;
    headerRow.append(th);
  }
  head.append(headerRow);

  for (const values of recordsToRows(records.slice(0, 30))) {
    const row = document.createElement("tr");
    for (const column of LOG_COLUMNS) {
      const cell = document.createElement("td");
      cell.textContent = values[column.key] || "–";
      row.append(cell);
    }
    body.append(row);
  }
}

function exportDebug() {
  const payload = {
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    runtimePolicy: getRuntimePolicy(),
    crashRecovery,
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

function markDataDirty() {
  dataRevision += 1;
}

function isCurrentSlotRequest(slot, generation, prepared = null) {
  if (!slot || Number(slot.generation) !== Number(generation)) return false;
  return !prepared || slot.prepared === prepared;
}

function imageQualityHint(prepared) {
  const rating = prepared?.quality?.rating;
  if (!rating || rating.level === "ok") return "";
  return `Hinweis: Bild ${rating.text}`;
}

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}
