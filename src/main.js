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
import { clearExportedRecords, clearPendingExport, loadPendingExport, loadRecords, markRecordsExported, savePendingExport, saveRecord } from "./storage.js";
import { exportRecords, manualCorrectionLabel } from "./excel-export.js";
import { formatMilliseconds, safeError, serializableResult } from "./utils.js";
import { captureVideoFrame, isLandscapeViewport, openRearCameraStream, stopCameraStream } from "./camera.js";

const crashRecovery = recoverCompatibilityMode();
const engine = new PaddleOcrEngine();
let profiles = [];
let records = [];
let pendingExport = null;
let comparison = null;
let currentSaved = false;
let saveInProgress = false;
let reviewConfirmed = false;
let reviewConfirmedAt = "";
let photoFlowCompleted = false;
let cameraSession = createCameraSession();
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
  galleryInput.removeAttribute("capture");
  galleryInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await loadFile(key, file);
  });
  el(`${key}Profile`).addEventListener("change", async () => selectProfile(key, el(`${key}Profile`).value));
}

function createCameraSession() {
  return {
    active: false,
    mode: "pair",
    step: "product",
    stream: null,
    captures: { product: null, vda: null }
  };
}

function setupActions() {
  el("initializeButton").onclick = () => initializeEngine(true);
  el("saveButton").onclick = storeCurrent;
  el("reviewButton").onclick = confirmOperatorReview;
  el("newCsvButton").onclick = () => pendingExport ? confirmPendingExport() : shareProtocolExport("new");
  el("allCsvButton").onclick = () => pendingExport ? resendPendingExport() : shareProtocolExport("all");
  el("clearSentButton").onclick = clearSentProtocolRows;
  el("debugButton").onclick = exportDebug;

  el("startCaptureFlowButton").onclick = () => startCameraFlow("pair");
  el("productRetakeButton").onclick = () => startCameraFlow("single", "product");
  el("productRetakeTopButton").onclick = () => startCameraFlow("single", "product");
  el("vdaRetakeButton").onclick = () => startCameraFlow("single", "vda");
  el("vdaRetakeTopButton").onclick = () => startCameraFlow("single", "vda");
  el("cameraCancelButton").onclick = closeCameraOverlay;
  el("cameraShutterButton").onclick = captureCameraStep;
  window.addEventListener("resize", updateCameraOrientationState);
  window.addEventListener("orientationchange", updateCameraOrientationState);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && cameraSession.active) updateCameraOrientationState();
  });
}




async function startCameraFlow(mode = "pair", singleKey = "product") {
  if (cameraSession.active) return;
  if (mode === "single" && !photoFlowCompleted) return;

  cameraSession = createCameraSession();
  cameraSession.active = true;
  cameraSession.mode = mode;
  cameraSession.step = mode === "single" ? singleKey : "product";
  const overlay = el("cameraOverlay");
  overlay.hidden = false;
  document.body.classList.add("camera-open");
  updateCameraOverlayText();
  updateCameraOrientationState();

  try {
    cameraSession.stream = await openRearCameraStream();
    const video = el("cameraVideo");
    video.srcObject = cameraSession.stream;
    await video.play();
    updateCameraOrientationState();
  } catch (error) {
    closeCameraOverlay();
    alert(`Rückkamera konnte nicht geöffnet werden: ${safeError(error)}`);
  }
}

function cameraStepLabel(key, retake = false) {
  if (key === "product") return retake ? "Produktlabel neu fotografieren" : "Produktlabel fotografieren";
  return retake ? "VDA-/TA-Label neu fotografieren" : "VDA-/TA-Label fotografieren";
}

function updateCameraOverlayText() {
  if (!cameraSession.active) return;
  const single = cameraSession.mode === "single";
  el("cameraInstruction").textContent = cameraStepLabel(cameraSession.step, single);
  el("cameraStepBadge").textContent = single
    ? "Neuaufnahme"
    : cameraSession.step === "product" ? "1 / 2" : "2 / 2";
}

function updateCameraOrientationState() {
  if (!cameraSession.active) return;
  const landscape = isLandscapeViewport();
  const hint = el("cameraLandscapeHint");
  const shutter = el("cameraShutterButton");
  hint.hidden = landscape;
  shutter.disabled = !landscape;
  el("cameraOverlay").classList.toggle("portrait-warning", !landscape);
}

async function captureCameraStep() {
  if (!cameraSession.active || !isLandscapeViewport()) return;
  const shutter = el("cameraShutterButton");
  shutter.disabled = true;
  try {
    const key = cameraSession.step;
    const file = await captureVideoFrame(el("cameraVideo"), {
      fileName: `LabelCheck_${key}_${Date.now()}.jpg`
    });

    if (cameraSession.mode === "pair" && key === "product") {
      cameraSession.captures.product = file;
      cameraSession.step = "vda";
      updateCameraOverlayText();
      flashCameraStep();
      updateCameraOrientationState();
      return;
    }

    if (cameraSession.mode === "pair") {
      cameraSession.captures.vda = file;
      const productFile = cameraSession.captures.product;
      const vdaFile = cameraSession.captures.vda;
      closeCameraOverlay();
      photoFlowCompleted = true;
      renderAll();
      // Die beiden Bilder werden bewusst erst nach Abschluss der Aufnahmefolge
      // nacheinander ausgewertet. So bleibt Schritt 1 -> Schritt 2 ohne
      // Zwischenbestätigung flüssig und die Erkennungsengine läuft nie parallel.
      if (productFile) await loadFile("product", productFile);
      if (vdaFile) await loadFile("vda", vdaFile);
      return;
    }

    const singleKey = cameraSession.step;
    closeCameraOverlay();
    await loadFile(singleKey, file);
  } catch (error) {
    alert(`Foto konnte nicht übernommen werden: ${safeError(error)}`);
    updateCameraOrientationState();
  }
}

function flashCameraStep() {
  const overlay = el("cameraOverlay");
  overlay.classList.remove("camera-flash");
  void overlay.offsetWidth;
  overlay.classList.add("camera-flash");
  setTimeout(() => overlay.classList.remove("camera-flash"), 180);
}

function closeCameraOverlay() {
  if (cameraSession.stream) stopCameraStream(cameraSession.stream);
  const video = el("cameraVideo");
  if (video) video.srcObject = null;
  cameraSession.active = false;
  cameraSession.stream = null;
  el("cameraOverlay").hidden = true;
  el("cameraOverlay").classList.remove("portrait-warning", "camera-flash");
  document.body.classList.remove("camera-open");
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
      ? "Kompatibilitätsmodus aktiviert · Erkennung wird neu geladen …"
      : "Normalmodus aktiviert · Erkennung wird neu geladen …", "wait");
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
  setEngineStatus("Erkennung wird vorbereitet …", "wait");
  try {
    const info = await engine.initialize("standard", (message) => setEngineStatus(message, "wait"), force);
    setEngineStatus(`LabelCheck bereit`, "ok");
    const reason = getCompatibilityReason();
    el("engineDetails").textContent = [
      `Initialisierung ${formatMilliseconds(info.initMs)}`,
      formatRuntimeDetails(info.summary),
      isCompatibilityMode() && reason === "ocr-crash-recovery" ? "Stabiler Modus nach vorherigem Analysefehler automatisch aktiviert" : "",
      isCompatibilityMode() && reason === "mobile-default" ? "Mobilgerät · stabiler Modus standardmäßig aktiv" : ""
    ].filter(Boolean).join(" · ");
    return true;
  } catch (error) {
    setEngineStatus(`Erkennung nicht bereit: ${safeError(error)}`, "bad");
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
  resetOperatorReview();
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

    // QR-Profile werden vor PaddleOCR geprüft. Suchbereich und Parserregeln kommen
    // vollständig aus der Profilkonfiguration; kundenspezifischer Code ist nicht nötig.
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
  resetOperatorReview();

  // Auch bei "Erneut analysieren" bleibt der QR-Pfad erhalten. Bei manueller
  // Profilauswahl wird nur dieses QR-Profil geprüft; im Automatikmodus alle passenden QR-Profile.
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
    setEngineStatus(`LabelCheck bereit`, "ok");
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

  // Die Gültigkeitsprüfung eines Produktprofils ist konfigurationsgetrieben.
  // Welche Felder/Anker zwingend sein müssen, legt profile.validation fest.
  if (key === "product" && !isVerifiedConfiguredLabel(slot)) {
    const message = slot.profile?.validation?.errorMessage
      || "Kein gültiges Produktlabel erkannt. Bitte das Produktlabel vollständig und gut lesbar fotografieren.";
    slot.profile = null;
    slot.extraction = null;
    slot.error = message;
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

function isVerifiedConfiguredLabel(slot) {
  const profile = slot?.profile;
  const extraction = slot?.extraction;
  if (!profile || !extraction || String(extraction.warning || "").trim()) return false;

  const validation = profile.validation || {};
  if (profile.source?.type !== "qr") {
    const minAnchorScore = Math.max(0, Math.min(1, Number(validation.minAnchorScore ?? 0.55)));
    const anchorScore = Number(extraction?.anchorMatch?.matchScore || 0);
    if (anchorScore < minAnchorScore) return false;
  }

  const requiredKeys = Array.isArray(validation.requiredValidFields)
    ? validation.requiredValidFields
    : [];
  return requiredKeys.every((key) => {
    const field = extraction?.fields?.[key];
    // Eine Erkennung unter 80 % darf im Eingabefeld bewusst leer bleiben,
    // kann aber trotzdem belegen, dass das erwartete Feld auf dem richtigen
    // Label erkannt wurde. Für die Bedienung muss der Wert anschließend
    // manuell eingetragen werden.
    return Boolean(field && ((field.value && field.valid) || field.autoDetectedValid || field.requiresManualInput));
  });
}

async function selectProfile(key, id) {
  const slot = slots[key];
  slot.selectedProfileId = id || "";
  slot.profile = id ? profiles.find((profile) => profile.id === id) || null : null;
  currentSaved = false;
  resetOperatorReview();

  if (!slot.prepared) {
    renderAll();
    return;
  }

  // QR-Profile werden auch bei manueller Auswahl wieder über detectQrProfile
  // geprüft und fallen nicht in die normale OCR-/Textanker-Extraktion zurück.
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
      if (key === "product" && !isVerifiedConfiguredLabel(slot)) {
        const message = slot.profile?.validation?.errorMessage
          || "Kein gültiges Produktlabel erkannt. Bitte das Produktlabel vollständig und gut lesbar fotografieren.";
        slot.profile = null;
        slot.extraction = null;
        slot.error = message;
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
  const applied = applyManualValue(slot.extraction, field, value);
  if (applied?.ok === false) {
    if (applied.reason === "weight-too-long") {
      alert("Gewicht nicht übernommen: Vor dem Komma dürfen höchstens 5 Ziffern stehen.");
    } else if (applied.reason === "duplicate") {
      alert(`Wert nicht übernommen: Derselbe Inhalt ist bereits im Feld „${applied.duplicateLabel}“ dieses Labels eingetragen.`);
    }
    renderAll();
    return;
  }
  slot.manual = true;
  currentSaved = false;
  resetOperatorReview();
  refreshComparison();
  renderAll();
}

function resetOperatorReview() {
  reviewConfirmed = false;
  reviewConfirmedAt = "";
}

function confirmOperatorReview() {
  if (comparison?.status !== "review") return;
  reviewConfirmed = true;
  reviewConfirmedAt = new Date().toISOString();
  currentSaved = false;
  renderAll();
}

function displayedComparison() {
  if (comparison?.status !== "review" || !reviewConfirmed) return comparison;

  const batchRow = comparison.rows?.find((row) => row.key === "batch");

  // Erst die ausdrückliche Bedienerbestätigung macht aus einem Prüffall ein
  // endgültiges Ergebnis. Das gilt insbesondere nach manuellen Eingaben:
  // vorher bleibt der Banner gelb „ÜBERPRÜFEN“, danach entscheidet die Batch.
  if (comparison.batchMismatch || batchRow?.status === "mismatch") {
    return {
      ...comparison,
      released: false,
      status: "rejected",
      message: "NICHT FREIGEGEBEN – Batchnummern weichen ab. · ✓ Vom Bediener überprüft."
    };
  }

  if (batchRow?.status === "match") {
    return {
      ...comparison,
      released: true,
      status: "released",
      message: "FREIGEGEBEN – Batchnummer stimmt überein. · ✓ Vom Bediener überprüft."
    };
  }

  return {
    ...comparison,
    released: false,
    message: `ÜBERPRÜFT – Bedienerprüfung bestätigt. ${comparison.message.replace(/^ÜBERPRÜFEN\s*[–-]\s*/i, "")}`
  };
}

function renderAll() {
  renderSlot("product");
  renderSlot("vda");
  const visibleComparison = displayedComparison();
  renderComparison(el("comparison"), visibleComparison);
  el("resultCard")?.classList.toggle("rejected-state", visibleComparison?.status === "rejected");
  renderLog();
  updateCaptureButtons();
  const saveButton = el("saveButton");
  const reviewButton = el("reviewButton");
  const reviewRequired = comparison?.status === "review";
  const manualInputRequired = Number(comparison?.manualInputRequiredFields?.length || 0) > 0;
  if (reviewButton) {
    reviewButton.hidden = !reviewRequired;
    reviewButton.disabled = !reviewRequired || manualInputRequired || reviewConfirmed;
    reviewButton.textContent = reviewConfirmed
      ? "✓ Überprüft"
      : manualInputRequired ? "Orange Felder ausfüllen" : "Überprüft";
  }
  saveButton.disabled = !comparison || manualInputRequired || (reviewRequired && !reviewConfirmed) || currentSaved || saveInProgress;
  saveButton.textContent = saveInProgress
    ? "Wird gespeichert …"
    : currentSaved ? "Datensatz übernommen" : "Datensatz übernehmen";
  const unsentCount = records.filter((record) => !record.exportedAt).length;
  const sentCount = records.length - unsentCount;
  const pendingRows = getPendingRows();
  const pendingConfirmRows = getPendingConfirmationRows();
  const newCsvButton = el("newCsvButton");
  const allCsvButton = el("allCsvButton");
  const clearSentButton = el("clearSentButton");

  // Während eine CSV noch auf die Bestätigung wartet, werden dieselben zwei
  // Exportbuttons kontextbezogen weiterverwendet. So entstehen keine
  // zusätzlichen Exportaktionen und Begriffe wie "Stapel" sind nicht nötig.
  if (pendingConfirmRows.length) {
    if (newCsvButton) {
      newCsvButton.disabled = false;
      newCsvButton.textContent = `In OneDrive gespeichert (${pendingConfirmRows.length})`;
    }
    if (allCsvButton) {
      allCsvButton.disabled = !pendingRows.length;
      allCsvButton.textContent = `CSV erneut senden (${pendingRows.length})`;
    }
  } else {
    if (newCsvButton) {
      newCsvButton.disabled = !unsentCount;
      newCsvButton.textContent = unsentCount ? `Neue Teile senden (${unsentCount})` : "Keine neuen Teile";
    }
    if (allCsvButton) {
      allCsvButton.disabled = !records.length;
      allCsvButton.textContent = records.length ? `Gesamtes Protokoll senden (${records.length})` : "Gesamtes Protokoll senden";
    }
  }

  if (clearSentButton) {
    clearSentButton.disabled = !sentCount;
    clearSentButton.textContent = sentCount ? `Gesendete leeren (${sentCount})` : "Gesendete leeren";
  }

  const exportStatus = el("excelExportStatus");
  if (exportStatus) {
    exportStatus.textContent = pendingConfirmRows.length
      ? `${pendingConfirmRows.length} Teile warten auf Bestätigung. Nach dem Speichern in OneDrive bitte bestätigen.`
      : "";
  }
}

function updateCaptureButtons() {
  const retakeDisabled = !photoFlowCompleted || cameraSession.active;
  const startButton = el("startCaptureFlowButton");
  if (startButton) {
    startButton.disabled = cameraSession.active;
    startButton.textContent = photoFlowCompleted
      ? "▣  Beide Fotos neu aufnehmen"
      : "▣  Labelprüfung starten";
  }
  for (const key of ["product", "vda"]) {
    const label = key === "product" ? "Produktfoto" : "VDA-/TA-Foto";
    for (const suffix of ["RetakeButton", "RetakeTopButton"]) {
      const button = el(`${key}${suffix}`);
      if (!button) continue;
      button.disabled = retakeDisabled;
      button.textContent = photoFlowCompleted ? `▣  ${label} neu aufnehmen` : "▣  Foto aufnehmen";
    }
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

function resetScanCycleAfterSave() {
  for (const key of ["product", "vda"]) {
    const slot = slots[key];
    releasePreparedImage(slot.prepared);
    Object.assign(slot, createSlot(key));
    const profileSelect = el(`${key}Profile`);
    if (profileSelect) profileSelect.value = "";
    const galleryInput = el(`${key}Input`);
    if (galleryInput) galleryInput.value = "";
  }
  photoFlowCompleted = false;
  comparison = null;
  currentSaved = false;
  resetOperatorReview();
}

async function storeCurrent() {
  if (!comparison || (comparison.status === "review" && !reviewConfirmed) || currentSaved || saveInProgress) return;
  const beforeSave = displayedComparison();
  const batchMismatch = Boolean(comparison.batchMismatch || comparison.rows?.find((row) => row.key === "batch")?.status === "mismatch");
  if (batchMismatch && beforeSave?.status === "rejected") {
    const confirmed = window.confirm("Achtung: Die Batchnummern stimmen nicht überein. Der Datensatz ist NICHT FREIGEGEBEN. Möchtest du ihn trotzdem übernehmen?");
    if (!confirmed) return;
  }
  saveInProgress = true;
  renderAll();
  const corrections = [
    ...manualCorrections(slots.product.extraction, "Produkt"),
    ...manualCorrections(slots.vda.extraction, "VDA")
  ];
  const finalComparison = displayedComparison();
  const record = {
    timestamp: new Date().toISOString(),
    status: finalComparison?.status || comparison.status,
    result: finalComparison?.message || comparison.message,
    reviewRequired: comparison.status === "review",
    reviewedAt: comparison.status === "review" ? reviewConfirmedAt : "",
    productProfile: slots.product.profile?.name || "",
    vdaProfile: slots.vda.profile?.name || "",
    product: values(slots.product.extraction),
    vda: values(slots.vda.extraction),
    manual: corrections.length > 0,
    manualCorrections: corrections
  };
  try {
    records = await saveRecord(record);
    resetScanCycleAfterSave();
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

function manualCorrections(extraction, sideLabel) {
  const labels = {
    batch: "Batch",
    idh: "IDH",
    weight: "Gewicht",
    delivery_note: "Lieferscheinnummer",
    drum_number: "Fassnummer"
  };
  return Object.entries(extraction?.fields || {})
    .filter(([, field]) => field?.source === "manual")
    .map(([key]) => `${labels[key] || key} ${sideLabel}`);
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
  return records.filter((record) => ids.has(record.id));
}

function getPendingConfirmationRows() {
  const ids = new Set(pendingExport?.confirmRecordIds || pendingExport?.recordIds || []);
  if (!ids.size) return [];
  return records.filter((record) => !record.exportedAt && ids.has(record.id));
}

function getWaitingNewRows() {
  const pendingIds = new Set(getPendingConfirmationRows().map((record) => record.id));
  return records.filter((record) => !record.exportedAt && !pendingIds.has(record.id));
}

function normalizePendingExport() {
  if (!pendingExport?.recordIds?.length) {
    pendingExport = null;
    return;
  }

  const availableIds = new Set(records.map((record) => record.id).filter(Boolean));
  const recordIds = pendingExport.recordIds.filter((id) => availableIds.has(id));
  const confirmRecordIds = (pendingExport.confirmRecordIds || pendingExport.recordIds)
    .filter((id) => availableIds.has(id));

  // Ist nichts mehr zu bestätigen, ist der Export erledigt. Das gilt auch
  // nach einem Browser-Neustart oder einem bereits erfolgreich gespeicherten
  // alten 0.16.17-Export.
  const stillUnsent = new Set(records.filter((record) => !record.exportedAt).map((record) => record.id));
  const openConfirmIds = confirmRecordIds.filter((id) => stillUnsent.has(id));
  if (!recordIds.length || !openConfirmIds.length) {
    pendingExport = clearPendingExport();
    return;
  }

  if (
    recordIds.join("|") !== pendingExport.recordIds.join("|")
    || openConfirmIds.join("|") !== (pendingExport.confirmRecordIds || pendingExport.recordIds).join("|")
  ) {
    pendingExport = savePendingExport({ ...pendingExport, recordIds, confirmRecordIds: openConfirmIds });
  }
}

function refreshComparison() {
  comparison = slots.product.extraction && slots.vda.extraction
    ? compareExtractions(slots.product.extraction, slots.vda.extraction)
    : null;
  if (comparison?.status !== "review") resetOperatorReview();
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
  const sentCount = records.length - unsentCount;
  el("logCount").textContent = `${records.length} Datensätze · ${unsentCount} neu · ${sentCount} gesendet`;
  const body = el("logBody");
  body.replaceChildren();
  records.slice(0, 30).forEach((record) => {
    const row = document.createElement("tr");
    if (record.exportedAt) row.classList.add("log-row-sent");
    const drumNumber = record.product?.drum_number || record.vda?.drum_number || "–";
    const cells = [
      new Date(record.timestamp).toLocaleString(),
      record.result || "–",
      manualCorrectionLabel(record) || "–",
      record.vda?.delivery_note || "–",
      drumNumber,
      record.product?.batch || "–",
      record.vda?.batch || "–",
      record.product?.idh || "–",
      record.vda?.idh || "–",
      record.product?.weight || "–",
      record.vda?.weight || "–",
      record.vdaProfile || "–"
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
  const exportDate = new Date();
  const exportRows = mode === "all"
    ? [...records]
    : records.filter((record) => !record.exportedAt);

  if (!exportRows.length) return;

  const confirmRecordIds = exportRows
    .filter((record) => !record.exportedAt)
    .map((record) => record.id)
    .filter(Boolean);

  // Der aktuelle Export wird VOR dem Öffnen des nativen Share-Sheets
  // dauerhaft gespeichert. Android kann die Webseite während "Senden an"
  // pausieren; dadurch bleibt der Bestätigungszustand beim Zurückkehren
  // trotzdem zuverlässig erhalten.
  if (confirmRecordIds.length) {
    pendingExport = savePendingExport({
      recordIds: exportRows.map((record) => record.id).filter(Boolean),
      confirmRecordIds,
      createdAt: exportDate.toISOString(),
      mode,
      awaitingConfirmation: true
    });
    renderAll();
  }

  const result = await exportRecords(exportRows, navigator, { date: exportDate });

  // Nur ein ausdrücklich abgebrochener Share-Vorgang wird verworfen. Wenn
  // Android die Seite beim Teilen pausiert und der Promise nicht sauber
  // weiterläuft, bleibt der zuvor gespeicherte Zustand absichtlich bestehen.
  if (result?.method === "cancelled" && pendingExport) {
    pendingExport = clearPendingExport();
  }

  renderExportStatus(result);
  renderAll();
}

async function resendPendingExport() {
  const exportRows = getPendingRows();
  if (!pendingExport || !exportRows.length) {
    pendingExport = clearPendingExport();
    renderAll();
    return;
  }

  const exportDate = new Date(pendingExport.createdAt || Date.now());
  const result = await exportRecords(exportRows, navigator, { date: exportDate });
  renderExportStatus(result);

  if (result?.method === "cancelled") {
    const status = el("excelExportStatus");
    if (status) status.textContent = "Senden abgebrochen. Die noch nicht bestätigten Teile bleiben unverändert.";
  }
  renderAll();
}

async function confirmPendingExport() {
  const confirmRows = getPendingConfirmationRows();
  if (!pendingExport || !confirmRows.length) {
    pendingExport = clearPendingExport();
    renderAll();
    return;
  }

  // Diese Bestätigung wird direkt durch den Button-Klick ausgelöst und ist
  // damit auch in mobilen Browsern zuverlässig. Sie hängt nicht mehr hinter
  // einem asynchronen navigator.share()-Aufruf.
  const confirmed = confirm(
    `Wurde die CSV erfolgreich in OneDrive gespeichert?\n\n`
    + `Bei „OK“ werden ${confirmRows.length} Teile als gesendet markiert.`
  );
  if (!confirmed) return;

  const ids = confirmRows.map((record) => record.id).filter(Boolean);
  try {
    await markRecordsExported(ids, new Date().toISOString());
    pendingExport = clearPendingExport();
    records = await loadRecords();
    normalizePendingExport();
    renderAll();

    const status = el("excelExportStatus");
    const remaining = records.filter((record) => !record.exportedAt).length;
    if (status) {
      status.textContent = remaining
        ? `${ids.length} Teile als gesendet bestätigt · ${remaining} neue Teile warten auf den nächsten Export.`
        : `${ids.length} Teile als gesendet bestätigt · keine neuen Teile offen.`;
    }
  } catch (error) {
    alert(`Sendestatus konnte nicht gespeichert werden: ${safeError(error)}`);
  }
}


async function clearSentProtocolRows() {
  const sentCount = records.filter((record) => record.exportedAt).length;
  if (!sentCount) return;
  const confirmed = confirm(`Bereits gesendete Teile aus dem lokalen Protokoll löschen?\n\n${sentCount} bestätigte Datensätze werden entfernt. Neue bzw. noch nicht bestätigte Teile bleiben vollständig erhalten.`);
  if (!confirmed) return;
  try {
    records = await clearExportedRecords();
    normalizePendingExport();
    renderAll();
    const status = el("excelExportStatus");
    if (status) status.textContent = `${sentCount} bereits gesendete Teile aus dem lokalen Verlauf entfernt.`;
  } catch (error) {
    alert(`Gesendete Datensätze konnten nicht gelöscht werden: ${safeError(error)}`);
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
