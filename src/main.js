import "./styles.css";
import { APP_VERSION, MODEL_OPTIONS, QUALITY_PRESETS } from "./config.js";
import { PaddleOcrEngine } from "./ocr-engine.js";
import { prepareImage } from "./image-tools.js";
import { renderItemsTable, renderPreview } from "./render.js";
import { formatMilliseconds, safeError, serializableResult } from "./utils.js";

const engine = new PaddleOcrEngine();
const slots = {
  product: createSlot("product"),
  vda: createSlot("vda")
};

const elements = {
  version: document.getElementById("version"),
  engineBadge: document.getElementById("engineBadge"),
  engineDetails: document.getElementById("engineDetails"),
  modelSelect: document.getElementById("modelSelect"),
  qualitySelect: document.getElementById("qualitySelect"),
  autoAnalyze: document.getElementById("autoAnalyze"),
  initializeButton: document.getElementById("initializeButton"),
  analyzeAllButton: document.getElementById("analyzeAllButton"),
  exportButton: document.getElementById("exportButton"),
  resetButton: document.getElementById("resetButton"),
  deviceInfo: document.getElementById("deviceInfo")
};

elements.version.textContent = `v${APP_VERSION}`;
populateOptions();
renderDeviceInfo();
setupSlot("product");
setupSlot("vda");
renderAll();

navigator.storage?.persist?.().catch(() => false);

setTimeout(() => initializeEngine().catch(() => undefined), 100);

elements.initializeButton.addEventListener("click", () => initializeEngine(true));
elements.analyzeAllButton.addEventListener("click", analyzeAll);
elements.exportButton.addEventListener("click", exportResults);
elements.resetButton.addEventListener("click", resetAll);
elements.modelSelect.addEventListener("change", () => {
  setEngineStatus("Modellwechsel gewählt. Neu initialisieren.", "warn");
});

elements.qualitySelect.addEventListener("change", () => {
  for (const slot of Object.values(slots)) {
    if (slot.file) loadSlotFile(slot.key, slot.file, false);
  }
});

function createSlot(key) {
  return {
    key,
    file: null,
    prepared: null,
    result: null,
    wallMs: null,
    error: "",
    state: "empty"
  };
}

function setupSlot(key) {
  const input = document.getElementById(`${key}Input`);
  const analyzeButton = document.getElementById(`${key}Analyze`);
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = "";
    if (file) await loadSlotFile(key, file, true);
  });
  analyzeButton.addEventListener("click", () => analyzeSlot(key));
}

function populateOptions() {
  for (const model of Object.values(MODEL_OPTIONS)) {
    const option = document.createElement("option");
    option.value = model.key;
    option.textContent = model.label;
    elements.modelSelect.append(option);
  }
  elements.modelSelect.value = "latin";

  for (const preset of Object.values(QUALITY_PRESETS)) {
    const option = document.createElement("option");
    option.value = preset.key;
    option.textContent = preset.label;
    elements.qualitySelect.append(option);
  }
  elements.qualitySelect.value = "balanced";
}

async function initializeEngine(force = false) {
  const modelKey = elements.modelSelect.value;
  if (!force && engine.ready && engine.modelKey === modelKey) return true;

  elements.initializeButton.disabled = true;
  setEngineStatus("PaddleOCR wird vorbereitet …", "wait");
  try {
    const info = await engine.initialize(modelKey, (message) => setEngineStatus(message, "wait"));
    const model = MODEL_OPTIONS[modelKey];
    setEngineStatus(`PaddleOCR bereit · ${info.mode}`, "ok");
    elements.engineDetails.textContent = `${model.description} Initialisierung: ${formatMilliseconds(info.initMs)}.`;
    renderAll();
    return true;
  } catch (error) {
    setEngineStatus(`PaddleOCR nicht bereit: ${safeError(error)}`, "bad");
    elements.engineDetails.textContent = "Die erste Initialisierung lädt die offiziellen PP-OCRv5-Modelle. Prüfe Netzwerk und Browserkonsole.";
    return false;
  } finally {
    elements.initializeButton.disabled = false;
  }
}

async function loadSlotFile(key, file, mayAnalyze) {
  const slot = slots[key];
  slot.file = file;
  slot.result = null;
  slot.error = "";
  slot.state = "preparing";
  renderSlot(key);

  try {
    const preset = QUALITY_PRESETS[elements.qualitySelect.value];
    slot.prepared = await prepareImage(file, preset.maxImageSide);
    slot.state = "ready";
  } catch (error) {
    slot.error = safeError(error);
    slot.state = "error";
  }
  renderSlot(key);

  if (mayAnalyze && slot.state === "ready" && elements.autoAnalyze.checked) {
    await analyzeSlot(key);
  }
}

async function analyzeSlot(key) {
  const slot = slots[key];
  if (!slot.prepared) return;
  const ready = await initializeEngine();
  if (!ready) return;

  slot.state = "analyzing";
  slot.error = "";
  renderSlot(key);
  try {
    const preset = QUALITY_PRESETS[elements.qualitySelect.value];
    const { result, wallMs } = await engine.predict(slot.prepared.canvas, {
      textDetLimitSideLen: preset.textDetLimitSideLen,
      textDetLimitType: "min",
      textDetMaxSideLimit: 2400,
      textDetThresh: 0.25,
      textDetBoxThresh: preset.textDetBoxThresh,
      textDetUnclipRatio: 1.55,
      textRecScoreThresh: preset.textRecScoreThresh
    });
    slot.result = result;
    slot.wallMs = wallMs;
    slot.state = "done";
  } catch (error) {
    slot.error = safeError(error);
    slot.state = "error";
  }
  renderSlot(key);
  updateActions();
}

async function analyzeAll() {
  elements.analyzeAllButton.disabled = true;
  try {
    for (const key of ["product", "vda"]) {
      if (slots[key].prepared) await analyzeSlot(key);
    }
  } finally {
    elements.analyzeAllButton.disabled = false;
  }
}

function renderAll() {
  renderSlot("product");
  renderSlot("vda");
  updateActions();
}

function renderSlot(key) {
  const slot = slots[key];
  const preview = document.getElementById(`${key}Preview`);
  const status = document.getElementById(`${key}Status`);
  const metrics = document.getElementById(`${key}Metrics`);
  const tbody = document.getElementById(`${key}Items`);
  const raw = document.getElementById(`${key}Raw`);
  const analyzeButton = document.getElementById(`${key}Analyze`);

  renderPreview(preview, slot.prepared, slot.result);
  analyzeButton.disabled = !slot.prepared || slot.state === "analyzing";

  if (!slot.prepared) {
    status.textContent = "Noch kein Bild ausgewählt.";
    status.className = "slot-status";
    metrics.textContent = "–";
    renderItemsTable(tbody, []);
    raw.textContent = "";
    return;
  }

  const quality = slot.prepared.quality;
  const qualityText = `Bild ${slot.prepared.width} × ${slot.prepared.height} · Schärfe ${quality.sharpness} · Helligkeit ${quality.brightness} · Qualität ${quality.rating.text}`;

  if (slot.state === "analyzing") {
    status.textContent = "PaddleOCR analysiert das vollständige Bild …";
    status.className = "slot-status wait";
  } else if (slot.state === "error") {
    status.textContent = `Fehler: ${slot.error}`;
    status.className = "slot-status bad";
  } else if (slot.state === "done") {
    status.textContent = `${qualityText} · ${slot.result?.items?.length || 0} Textzeilen`;
    status.className = `slot-status ${quality.rating.level}`;
  } else {
    status.textContent = qualityText;
    status.className = `slot-status ${quality.rating.level}`;
  }

  const m = slot.result?.metrics;
  metrics.textContent = slot.result
    ? `Gesamt ${formatMilliseconds(slot.wallMs)} · Detektion ${formatMilliseconds(m?.detMs)} · Erkennung ${formatMilliseconds(m?.recMs)} · Boxen ${m?.detectedBoxes ?? "–"} · erkannt ${m?.recognizedCount ?? "–"}`
    : "Noch nicht analysiert";
  renderItemsTable(tbody, slot.result?.items || []);
  raw.textContent = slot.result ? JSON.stringify(serializableResult(slot.result), null, 2) : "";
}

function setEngineStatus(text, state) {
  elements.engineBadge.textContent = text;
  elements.engineBadge.className = `engine-badge ${state}`;
}

function updateActions() {
  elements.analyzeAllButton.disabled = !Object.values(slots).some((slot) => slot.prepared);
  elements.exportButton.disabled = !Object.values(slots).some((slot) => slot.result);
}

function exportResults() {
  const payload = {
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    model: MODEL_OPTIONS[elements.modelSelect.value],
    qualityPreset: QUALITY_PRESETS[elements.qualitySelect.value],
    engine: {
      mode: engine.mode,
      summary: engine.summary
    },
    userAgent: navigator.userAgent,
    product: exportSlot(slots.product),
    vda: exportSlot(slots.vda)
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `paddleocr-test-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportSlot(slot) {
  return {
    fileName: slot.file?.name || null,
    image: slot.prepared
      ? {
          width: slot.prepared.width,
          height: slot.prepared.height,
          quality: slot.prepared.quality
        }
      : null,
    wallMs: slot.wallMs,
    result: serializableResult(slot.result),
    error: slot.error || null
  };
}

function resetAll() {
  for (const slot of Object.values(slots)) {
    slot.file = null;
    slot.prepared = null;
    slot.result = null;
    slot.wallMs = null;
    slot.error = "";
    slot.state = "empty";
  }
  renderAll();
}

function renderDeviceInfo() {
  const memory = navigator.deviceMemory ? `${navigator.deviceMemory} GB geschätzt` : "nicht gemeldet";
  const cores = navigator.hardwareConcurrency || "nicht gemeldet";
  const isolated = window.crossOriginIsolated ? "ja" : "nein";
  elements.deviceInfo.textContent = `Browser: ${navigator.userAgent} | Kerne: ${cores} | Gerätespeicher: ${memory} | Cross-Origin-isoliert: ${isolated} | Backend: WASM/SIMD, 1 Thread`;
}
