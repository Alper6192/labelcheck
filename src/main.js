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
import { downloadCsvRecords, exportRecords } from "./excel-export.js";
import { openNativeRearCamera } from "./camera.js";
import { formatMilliseconds, safeError, serializableResult } from "./utils.js";

const crashRecovery = recoverCompatibilityMode();
const engine = new PaddleOcrEngine();
let profiles = [];
let records = [];
let comparison = null;
let currentSaved = false;
let saveInProgress = false;
const slots = { product: createSlot("product"), vda: createSlot("vda") };
const el = (id) => document.getElementById(id);

el("version").textContent = `v${APP_VERSION}`;
setupOptions();
setupSlot("product");
setupSlot("vda");
setupActions();
setupCameraCapture();
setupCompatibilityMode();
renderAll();
loadStoredRecords();
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
  const input = el(`${key}Input`);
  // Der Datei-Input ist nur für "Auswählen"/Galerie zuständig.
  // Für "Foto aufnehmen" wird jedes Mal ein frischer nativer Kamera-Input
  // mit capture="environment" erzeugt.
  input.removeAttribute("capture");
  input.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await loadFile(key, file);
  });
  el(`${key}Profile`).addEventListener("change", async () => selectProfile(key, el(`${key}Profile`).value));
}

function setupActions() {
  el("initializeButton").onclick = () => initializeEngine(true);
  el("analyzeAllButton").onclick = analyzeAll;
  el("saveButton").onclick = storeCurrent;
  el("excelButton").onclick = async () => {
    const result = await exportRecords(records);
    renderExportStatus(result);
  };
  el("excelDownloadButton").onclick = () => {
    const result = downloadCsvRecords(records);
    renderExportStatus(result);
  };
  el("clearButton").onclick = async () => {
    if (confirm("Lokales Protokoll wirklich leeren?")) {
      records = await clearRecords();
      renderAll();
    }
  };
  el("debugButton").onclick = exportDebug;
}


function setupCameraCapture() {
  document.querySelectorAll("[data-camera-slot]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.cameraSlot;
      openNativeRearCamera({
        key,
        onFile: (file) => loadFile(key, file)
      });
    });
  });
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
  comparison = null;
  currentSaved = false;
  renderAll();

  try {
    const preset = currentPreset();
    const policy = getRuntimePolicy();
    slot.prepared = await prepareImage(file, preset.maxImageSide, {
      resizeDuringDecode: policy.resizeDuringDecode
    });

    // QR-Profile werden vor PaddleOCR geprüft. Tesla kann dadurch vollständig
    // aus dem kleinen QR-Code links unten gelesen werden und benötigt weder OCR
    // noch einen geometrischen Textanker.
    try { await profilesReady; } catch { /* OCR-Fallback bleibt möglich. */ }
    const qrStartedAt = performance.now();
    const qrMatch = detectQrProfile(slot.prepared.canvas, profiles, key);
    if (qrMatch) {
      slot.wallMs = performance.now() - qrStartedAt;
      slot.result = {
        items: [],
        image: { width: slot.prepared.width, height: slot.prepared.height },
        metrics: { qrMs: slot.wallMs },
        qr: { raw: qrMatch.raw, parser: qrMatch.parsed.parser }
      };
      slot.profile = qrMatch.profile;
      slot.extraction = extractQrProfileFields(qrMatch.profile, qrMatch);
      slot.state = "done";
      comparison = slots.product.extraction && slots.vda.extraction
        ? compareExtractions(slots.product.extraction, slots.vda.extraction)
        : null;
      clearOcrInFlight();
      renderAll();
      return;
    }

    markOcrInFlight("photo-prepared", {
      slot: key,
      backend: policy.backend,
      width: slot.prepared.width,
      height: slot.prepared.height,
      appVersion: APP_VERSION
    });
    slot.state = "ready";
    renderSlot(key);
    // Safari/iOS bekommt einen Paint-Zyklus, bevor der OCR-Worker startet.
    await nextPaint();
    await analyzeSlot(key);
  } catch (error) {
    clearOcrInFlight();
    slot.error = safeError(error);
    slot.state = "error";
    renderSlot(key);
  }
}

async function analyzeSlot(key) {
  const slot = slots[key];
  if (!slot.prepared) return;
  currentSaved = false;

  // Auch bei "Erneut analysieren" bleibt der QR-Pfad erhalten. Bei manueller
  // Tesla-Auswahl wird nur dieses QR-Profil geprüft; im Automatikmodus alle
  // passenden QR-Profile.
  const selected = slot.selectedProfileId
    ? profiles.find((profile) => profile.id === slot.selectedProfileId) || null
    : null;
  const qrCandidates = selected?.source?.type === "qr"
    ? [selected]
    : slot.selectedProfileId ? [] : profiles;
  if (qrCandidates.length) {
    const qrStartedAt = performance.now();
    const qrMatch = detectQrProfile(slot.prepared.canvas, qrCandidates, key);
    if (qrMatch) {
      slot.wallMs = performance.now() - qrStartedAt;
      slot.profile = qrMatch.profile;
      slot.result = qrResult(slot, qrMatch);
      slot.extraction = extractQrProfileFields(qrMatch.profile, qrMatch);
      slot.state = "done";
      refreshComparison();
      clearOcrInFlight();
      renderAll();
      return;
    }
    if (selected?.source?.type === "qr") {
      slot.profile = selected;
      slot.extraction = warningExtraction(selected, "QR-Code für dieses Profil wurde nicht erkannt.");
      slot.state = "done";
      refreshComparison();
      clearOcrInFlight();
      renderAll();
      return;
    }
  }

  if (!(await initializeEngine())) {
    clearOcrInFlight();
    return;
  }
  slot.state = "analyzing";
  renderSlot(key);
  await nextPaint();

  try {
    const preset = currentPreset();
    const policy = getRuntimePolicy();
    markOcrInFlight("predict", {
      slot: key,
      backend: policy.backend,
      width: slot.prepared.width,
      height: slot.prepared.height,
      appVersion: APP_VERSION
    });
    const out = await engine.predict(slot.prepared.canvas, {
      textDetLimitSideLen: preset.textDetLimitSideLen,
      textDetLimitType: "min",
      textDetMaxSideLimit: policy.textDetMaxSideLimit,
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
  } finally {
    clearOcrInFlight();
  }
  renderAll();
}

async function analyzeAll() {
  for (const key of ["product", "vda"]) if (slots[key].prepared) await analyzeSlot(key);
}

function resolveProfile(key) {
  const slot = slots[key];
  if (!slot.result) return;
  currentSaved = false;

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
  slot.selectedProfileId = id || "";
  slot.profile = id ? profiles.find((profile) => profile.id === id) || null : null;
  currentSaved = false;

  if (!slot.prepared) {
    renderAll();
    return;
  }

  // QR-Profile (aktuell Tesla) werden auch bei manueller Auswahl wieder über
  // detectQrProfile geprüft. Damit fällt eine manuelle Tesla-Auswahl nicht in
  // die normale PaddleOCR-/Textanker-Extraktion zurück.
  if (slot.selectedProfileId && slot.profile?.source?.type === "qr") {
    const qrStartedAt = performance.now();
    const qrMatch = detectQrProfile(slot.prepared.canvas, [slot.profile], key);
    if (qrMatch) {
      slot.wallMs = performance.now() - qrStartedAt;
      slot.result = qrResult(slot, qrMatch);
      slot.extraction = extractQrProfileFields(slot.profile, qrMatch);
      slot.state = "done";
    } else {
      slot.extraction = warningExtraction(slot.profile, "QR-Code für dieses Profil wurde nicht erkannt.");
      slot.state = "done";
    }
    refreshComparison();
    renderAll();
    return;
  }

  if (!slot.selectedProfileId) {
    const qrStartedAt = performance.now();
    const qrMatch = detectQrProfile(slot.prepared.canvas, profiles, key);
    if (qrMatch) {
      slot.wallMs = performance.now() - qrStartedAt;
      slot.profile = qrMatch.profile;
      slot.result = qrResult(slot, qrMatch);
      slot.extraction = extractQrProfileFields(qrMatch.profile, qrMatch);
      slot.state = "done";
      refreshComparison();
      renderAll();
      return;
    }
  }

  // Wurde das Bild zuvor nur per QR gelesen, existieren keine OCR-Textzeilen.
  // Beim Wechsel auf ein Textprofil wird deshalb einmal PaddleOCR ausgeführt.
  if (!slot.result?.items?.length && slot.result?.qr) {
    await analyzeSlot(key);
    return;
  }

  if (slot.result) {
    if (slot.selectedProfileId) {
      slot.extraction = slot.profile ? extractProfileFields(slot.result.items, slot.profile, slot.result.image) : null;
      refreshComparison();
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
  currentSaved = false;
  refreshComparison();
  renderAll();
}

function renderAll() {
  renderSlot("product");
  renderSlot("vda");
  renderComparison(el("comparison"), comparison);
  renderLog();
  const saveButton = el("saveButton");
  saveButton.disabled = !comparison || currentSaved || saveInProgress;
  saveButton.textContent = saveInProgress
    ? "Wird gespeichert …"
    : currentSaved ? "Datensatz übernommen" : "Datensatz übernehmen";
  el("excelButton").disabled = !records.length;
  el("excelDownloadButton").disabled = !records.length;
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
    const quality = slot.prepared?.quality?.rating;
    const qualityHint = quality && quality.level !== "ok" ? ` · Hinweis: Bild ${quality.text}` : "";
    status.textContent = `${formatMilliseconds(slot.wallMs)} · ${sourceInfo} · ${slot.profile?.name || "Profil nicht erkannt"}${slot.extraction?.warning ? ` · ${slot.extraction.warning}` : ""}${qualityHint}`;
    status.className = `slot-status ${slot.extraction?.warning || !slot.profile ? "warn" : "ok"}`;
  } else {
    status.textContent = slot.prepared ? "Bild vorbereitet" : "Noch kein Bild";
    status.className = "slot-status";
  }
  renderFieldEditor(el(`${key}Fields`), slot.extraction, (field, value) => editField(key, field, value));
}

async function storeCurrent() {
  if (!comparison || currentSaved || saveInProgress) return;
  saveInProgress = true;
  renderAll();
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
    records = await saveRecord(record);
    currentSaved = true;
  } catch (error) {
    currentSaved = false;
    alert(`Datensatz konnte nicht gespeichert werden: ${safeError(error)}`);
  } finally {
    saveInProgress = false;
    renderAll();
  }
}

function values(extraction) {
  const output = {};
  for (const [key, value] of Object.entries(extraction?.fields || {})) output[key] = value.value || "";
  return output;
}

async function loadStoredRecords() {
  try {
    records = await loadRecords();
  } catch (error) {
    console.warn("Scanprotokoll konnte nicht geladen werden:", error);
    records = [];
  }
  renderAll();
}

function refreshComparison() {
  comparison = slots.product.extraction && slots.vda.extraction
    ? compareExtractions(slots.product.extraction, slots.vda.extraction)
    : null;
}

function qrResult(slot, qrMatch) {
  return {
    items: [],
    image: { width: slot.prepared.width, height: slot.prepared.height },
    metrics: { qrMs: slot.wallMs },
    qr: { raw: qrMatch.raw, parser: qrMatch.parsed.parser }
  };
}

function warningExtraction(profile, warning) {
  return { profile, anchorMatch: null, transform: null, fields: {}, overlays: [], warning };
}

function renderLog() {
  el("logCount").textContent = `${records.length} Datensätze`;
  const body = el("logBody");
  body.replaceChildren();
  records.slice(0, 30).forEach((record) => {
    const row = document.createElement("tr");
    const drumNumber = record.product?.drum_number || record.vda?.drum_number || "–";
    const cells = [
      new Date(record.timestamp).toLocaleString(),
      record.product?.idh || "–",
      record.vda?.idh || "–",
      record.product?.batch || "–",
      record.vda?.batch || "–",
      record.vda?.delivery_note || "–",
      drumNumber,
      record.product?.weight || "–",
      record.vda?.weight || "–",
      record.result || "–"
    ];
    cells.forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    body.append(row);
  });
}

function renderExportStatus(result) {
  const status = el("excelExportStatus");
  if (!status || !result) return;
  if (result.method === "share-csv") {
    status.textContent = `CSV geteilt: ${result.filename}`;
  } else if (result.method === "download-csv") {
    status.textContent = `CSV heruntergeladen: ${result.filename}`;
  } else if (result.method === "cancelled") {
    status.textContent = "Teilen abgebrochen.";
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
  const ready = className === "ok";
  const loading = className === "wait" || className === "warn";
  el("engineBadge").textContent = ready ? "Bereit" : loading ? "Lädt …" : "Nicht bereit";
  el("engineBadge").className = `engine-badge ${className}`;
  const symbol = document.querySelector(".version-status-row .status-symbol");
  if (symbol) {
    symbol.textContent = ready ? "✓" : loading ? "…" : "×";
    symbol.classList.toggle("ok", ready);
    symbol.classList.toggle("wait", loading);
    symbol.classList.toggle("bad", !ready && !loading);
  }
}

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}
