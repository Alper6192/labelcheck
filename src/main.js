import "./styles.css";
import { APP_VERSION, MODEL_OPTIONS, QUALITY_PRESETS } from "./config.js";
import { PaddleOcrEngine, formatRuntimeDetails } from "./ocr-engine.js";
import { prepareImage, readImageOrientationInfo, releasePreparedImage } from "./image-tools.js";
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
import { clearPendingExport, loadPendingExport, loadRecords, markRecordsExported, savePendingExport, saveRecord } from "./storage.js";
import { exportRecords } from "./excel-export.js";
import { formatMilliseconds, safeError, serializableResult } from "./utils.js";

const crashRecovery = recoverCompatibilityMode();
const engine = new PaddleOcrEngine();
let profiles = [];
let records = [];
let pendingExport = null;
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
  const galleryInput = el(`${key}Input`);
  const cameraInput = el(`${key}CameraInput`);

  // Galerie und native Kamera bleiben getrennt. capture="environment" ist
  // weiterhin der standardisierte Hinweis an die externe Kamera-App, die
  // Rückkamera zu verwenden. Vor dem Öffnen wird zusätzlich geprüft, ob das
  // Gerät bereits quer gehalten wird.
  galleryInput.removeAttribute("capture");
  cameraInput?.setAttribute("capture", "environment");

  const cameraLabels = document.querySelectorAll(`label[for="${key}CameraInput"]`);
  cameraLabels.forEach((label) => label.addEventListener("click", (event) => {
    event.preventDefault();
    cameraInput?.setAttribute("capture", "environment");
    if (isViewportPortrait()) {
      const status = el(`${key}Status`);
      status.textContent = "Bitte das Smartphone quer halten und dann erneut „Foto aufnehmen“ tippen.";
      status.className = "slot-status warn";
      return;
    }
    if (cameraInput) {
      cameraInput.value = "";
      cameraInput.click();
    }
  }));

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await loadFile(key, file);
  };
  galleryInput.addEventListener("change", handleFile);
  cameraInput?.addEventListener("change", handleFile);
  el(`${key}Profile`).addEventListener("change", async () => selectProfile(key, el(`${key}Profile`).value));
}

function setupActions() {
  el("initializeButton").onclick = () => initializeEngine(true);
  el("saveButton").onclick = storeCurrent;
  el("newCsvButton").onclick = () => shareProtocolExport("new");
  el("allCsvButton").onclick = () => shareProtocolExport("all");
  el("debugButton").onclick = exportDebug;
}



function isViewportPortrait() {
  const orientationType = String(globalThis.screen?.orientation?.type || "").toLowerCase();
  if (orientationType.startsWith("portrait")) return true;
  if (orientationType.startsWith("landscape")) return false;
  try {
    if (globalThis.matchMedia?.("(orientation: portrait)")?.matches) return true;
    if (globalThis.matchMedia?.("(orientation: landscape)")?.matches) return false;
  } catch { /* Fallback unten. */ }
  return Number(globalThis.innerHeight || 0) > Number(globalThis.innerWidth || 0);
}

function isPortraitPhoto(orientationInfo, prepared) {
  if (orientationInfo?.portrait === true) return true;
  return Number(prepared?.height || 0) > Number(prepared?.width || 0);
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
    const orientationInfo = await readImageOrientationInfo(file).catch(() => null);
    slot.prepared = await prepareImage(file, preset.maxImageSide, {
      resizeDuringDecode: policy.resizeDuringDecode
    });

    // Hochkant wird zweifach geprüft: anhand der EXIF-orientierten
    // Originalabmessungen UND anhand des tatsächlich decodierten Bildes.
    // Dadurch funktionieren auch Samsung-/iPhone-Fotos, deren JPEG-Rohdaten
    // quer gespeichert sind und erst über EXIF gedreht werden.
    if (isPortraitPhoto(orientationInfo, slot.prepared)) {
      slot.error = "Bitte das Label quer fotografieren und erneut aufnehmen.";
      slot.state = "orientation";
      clearOcrInFlight();
      renderAll();
      return;
    }

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

  // Ein Produktfoto wird nur akzeptiert, wenn der Henkel-Produktanker UND eine
  // gültige Batchnummer erkannt wurden. Dadurch kann irgendein anderes Foto
  // nicht mehr stillschweigend als einzig vorhandenes Produktprofil durchgehen.
  if (key === "product" && !isVerifiedProductLabel(slot)) {
    slot.profile = null;
    slot.extraction = null;
    slot.error = "Kein gültiges Produktlabel erkannt. Bitte das Henkel-Produktlabel vollständig und gut lesbar fotografieren.";
    slot.state = "error";
  } else if (key === "product") {
    slot.error = "";
    slot.state = "done";
  }

  // Wichtig: automatisch erkanntes Profil NICHT in den Select schreiben.
  el(`${key}Profile`).value = slot.selectedProfileId || "";
  comparison = slots.product.extraction && slots.vda.extraction
    ? compareExtractions(slots.product.extraction, slots.vda.extraction)
    : null;
}

function isVerifiedProductLabel(slot) {
  const extraction = slot?.extraction;
  const anchorScore = Number(extraction?.anchorMatch?.matchScore || 0);
  const batch = extraction?.fields?.batch;
  return String(slot?.profile?.id || "").toUpperCase() === "HENKEL"
    && !String(extraction?.warning || "").trim()
    && anchorScore >= 0.55
    && Boolean(batch?.value && batch?.valid);
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
      if (key === "product" && !isVerifiedProductLabel(slot)) {
        slot.profile = null;
        slot.extraction = null;
        slot.error = "Kein gültiges Produktlabel erkannt. Bitte das Henkel-Produktlabel vollständig und gut lesbar fotografieren.";
        slot.state = "error";
      } else {
        slot.error = "";
        slot.state = "done";
      }
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
  const unsentCount = records.filter((record) => !record.exportedAt).length;
  const currentStack = getPendingRows();
  const waitingCount = getWaitingNewRows().length;
  const newCsvButton = el("newCsvButton");
  const allCsvButton = el("allCsvButton");
  if (newCsvButton) {
    const nextCount = currentStack.length || unsentCount;
    newCsvButton.disabled = !nextCount;
    newCsvButton.textContent = nextCount ? `Neue Teile senden (${nextCount})` : "Keine neuen Teile";
  }
  if (allCsvButton) {
    allCsvButton.disabled = !records.length;
    allCsvButton.textContent = records.length ? `Gesamtes Protokoll senden (${records.length})` : "Gesamtes Protokoll senden";
  }
  const exportStatus = el("excelExportStatus");
  if (exportStatus && currentStack.length) {
    exportStatus.textContent = waitingCount
      ? `Offener Exportstapel: ${currentStack.length} Teile · ${waitingCount} weitere neue Teile warten auf den nächsten Stapel.`
      : `Offener Exportstapel: ${currentStack.length} Teile.`;
  }
}

function renderSlot(key) {
  const slot = slots[key];
  const policy = getRuntimePolicy();
  renderPreview(el(`${key}Preview`), slot.prepared, slot.extraction?.overlays || [], policy.previewMaxSide);
  const status = el(`${key}Status`);
  if (slot.state === "analyzing") {
    status.textContent = "Bild wird analysiert …";
    status.className = "slot-status wait";
  } else if (slot.state === "orientation") {
    status.textContent = `Hinweis: ${slot.error}`;
    status.className = "slot-status warn";
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
    pendingExport = loadPendingExport();
    normalizePendingExport();
  } catch (error) {
    console.warn("Scanprotokoll konnte nicht geladen werden:", error);
    records = [];
    pendingExport = null;
  }
  renderAll();
}

function getPendingRows() {
  const ids = new Set(pendingExport?.recordIds || []);
  if (!ids.size) return [];
  return records.filter((record) => !record.exportedAt && ids.has(record.id));
}

function getWaitingNewRows() {
  const pendingIds = new Set(getPendingRows().map((record) => record.id));
  return records.filter((record) => !record.exportedAt && !pendingIds.has(record.id));
}

function normalizePendingExport() {
  if (!pendingExport?.recordIds?.length) {
    pendingExport = null;
    return;
  }
  const rows = getPendingRows();
  if (!rows.length) {
    pendingExport = clearPendingExport();
    return;
  }
  const recordIds = rows.map((record) => record.id).filter(Boolean);
  if (recordIds.join("|") !== pendingExport.recordIds.join("|")) {
    pendingExport = savePendingExport({ ...pendingExport, recordIds });
  }
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
  const unsentCount = records.filter((record) => !record.exportedAt).length;
  el("logCount").textContent = `${records.length} Datensätze · ${unsentCount} neu`;
  const body = el("logBody");
  body.replaceChildren();
  records.slice(0, 30).forEach((record) => {
    const row = document.createElement("tr");
    if (record.exportedAt) row.classList.add("log-row-sent");
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
      record.result || "–",
      record.exportedAt ? "✓ gesendet" : "neu"
    ];
    cells.forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    body.append(row);
  });
}

async function shareProtocolExport(mode = "new") {
  let exportRows;
  let exportDate = new Date();

  if (mode === "all") {
    // Gesamtexport ist immer ein Schnappschuss des aktuell sichtbaren
    // Protokolls. Neue Scans nach dem Öffnen des Share-Sheets werden dadurch
    // nicht nachträglich als gesendet markiert.
    exportRows = [...records];
  } else {
    // "Neue Teile" arbeitet als echter Stapel. Solange ein gestarteter Stapel
    // noch nicht als gespeichert bestätigt wurde, bleibt genau diese ID-Liste
    // eingefroren. Später gescannte Teile warten auf den nächsten Stapel.
    let stackRows = getPendingRows();
    if (!stackRows.length) {
      stackRows = records.filter((record) => !record.exportedAt);
      if (!stackRows.length) return;
      pendingExport = savePendingExport({
        recordIds: stackRows.map((record) => record.id).filter(Boolean),
        createdAt: new Date().toISOString()
      });
    }
    exportRows = getPendingRows();
    exportDate = new Date(pendingExport?.createdAt || Date.now());
  }

  if (!exportRows.length) return;
  const unsentIds = exportRows.filter((record) => !record.exportedAt).map((record) => record.id).filter(Boolean);
  const result = await exportRecords(exportRows, navigator, { date: exportDate });
  renderExportStatus(result);

  if ((result?.method === "share-csv" || result?.method === "download-csv") && unsentIds.length) {
    const confirmed = confirm(`Wurde die CSV in OneDrive gespeichert?\n\nBei „OK“ werden ${unsentIds.length} neue Teile dieses Exports als gesendet markiert. Die Datensätze bleiben im lokalen Protokoll erhalten.`);
    if (confirmed) {
      try {
        records = await markRecordsExported(unsentIds, new Date().toISOString());
        if (mode === "new") {
          pendingExport = clearPendingExport();
        } else if (pendingExport?.recordIds?.some((id) => unsentIds.includes(id))) {
          // Ein bestätigter Gesamtexport enthält auch den offenen Stapel.
          pendingExport = clearPendingExport();
        }
        normalizePendingExport();
        renderAll();
        const status = el("excelExportStatus");
        const waiting = getWaitingNewRows().length;
        if (status) status.textContent = waiting
          ? `${unsentIds.length} Teile als gesendet bestätigt · ${waiting} neue Teile warten auf den nächsten Stapel.`
          : `${unsentIds.length} Teile als gesendet bestätigt.`;
      } catch (error) {
        alert(`Sendestatus konnte nicht gespeichert werden: ${safeError(error)}`);
      }
    } else {
      renderAll();
    }
  } else {
    renderAll();
  }
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
