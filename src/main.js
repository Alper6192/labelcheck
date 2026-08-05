import "./styles.css";
import { APP_VERSION, MODEL_ID } from "./config.js";
import { cropImageToDetectedText, prepareImage } from "./image-tools.js";
import { mergeParsedResults, needsRefinement, parseFlorenceOcr } from "./ocr-parser.js";
import { compareLabels } from "./comparison.js";
import { FlorenceClient } from "./model-client.js";
import { clearRecords, deleteRecord, loadRecords, saveRecord } from "./storage.js";
import { exportRecordsToExcel } from "./excel-export.js";

const FIELD_DEFINITIONS = [
  ["batch", "Batch"],
  ["idh", "IDH"],
  ["weight", "Gewicht"],
  ["drum", "Fassnummer"],
  ["deliveryNote", "Lieferscheinnummer"],
];

const state = {
  client: null,
  busy: false,
  modelReady: false,
  product: emptyLabel("product"),
  vda: emptyLabel("vda"),
  comparison: null,
  records: [],
  currentSaved: false,
};

document.querySelector("#app").innerHTML = `
  <header>
    <h1>LabelCheck Florence <small class="small">v${APP_VERSION}</small></h1>
    <p>Produktlabel und VDA-Label lokal mit Microsoft Florence-2 vergleichen.</p>
  </header>
  <main>
    <div class="statusbar">
      <span id="webgpuBadge" class="badge warn">WebGPU wird geprüft …</span>
      <span id="modelBadge" class="badge warn">Florence-2 noch nicht geladen</span>
      <span id="storageBadge" class="badge">Lokales Protokoll</span>
    </div>
    <div class="privacy">Fotos werden nicht hochgeladen. Florence-2 und die gesamte Auswertung laufen im Browser auf diesem Gerät. Die Excel-Datei wird lokal erzeugt.</div>

    <section class="grid">
      ${labelCard("product", "Etikett 1 – Produktlabel")}
      ${labelCard("vda", "Etikett 2 – VDA-Label")}
    </section>

    <section class="card result-card">
      <div class="card-head"><h2>Analyse und Vergleich</h2><span id="analysisTime" class="small">—</span></div>
      <div class="card-body">
        <div id="overall" class="overall review">Bitte beide Etiketten fotografieren.</div>
        <div id="progressWrap" class="progress-wrap">
          <progress id="progress" max="100" value="0"></progress>
          <div id="progressText" class="progress-text">Vorbereitung …</div>
        </div>
        <div class="actions">
          <button id="analyzeButton" class="primary" disabled>Beide Etiketten analysieren</button>
          <button id="saveButton" class="good" disabled>Datensatz übernehmen</button>
          <button id="demoButton" class="secondary">Demo-Daten laden</button>
          <button id="resetButton" class="danger">Aufnahmen zurücksetzen</button>
        </div>
        <div style="overflow-x:auto">
          <table class="comparison-table">
            <thead><tr><th>Prüfung</th><th>Produktlabel</th><th>VDA-Label</th><th>Ergebnis</th></tr></thead>
            <tbody id="comparisonBody"></tbody>
          </table>
        </div>
        <details class="raw-details"><summary>Florence-Rohdaten und erkannte Textblöcke</summary><pre id="rawOutput">Noch keine Analyse.</pre></details>
      </div>
    </section>

    <section class="card result-card">
      <div class="card-head"><h2>Lokales Scanprotokoll</h2><span id="recordCount" class="small">0 Datensätze</span></div>
      <div class="card-body">
        <div class="actions">
          <button id="exportButton" disabled>Excel speichern / teilen</button>
          <button id="clearButton" class="danger" disabled>Protokoll leeren</button>
        </div>
        <div class="log-wrap">
          <table class="log-table">
            <thead><tr><th>Zeit</th><th>Ergebnis</th><th>Batch Produkt</th><th>Batch VDA</th><th>IDH Produkt</th><th>IDH VDA</th><th>Gewicht Produkt</th><th>Gewicht VDA</th><th>Fass</th><th>Lieferschein</th><th></th></tr></thead>
            <tbody id="logBody"></tbody>
          </table>
        </div>
      </div>
    </section>
  </main>
`;

const elements = Object.fromEntries([
  "webgpuBadge", "modelBadge", "storageBadge", "overall", "progressWrap", "progress", "progressText", "analyzeButton", "saveButton", "demoButton", "resetButton", "comparisonBody", "rawOutput", "analysisTime", "recordCount", "exportButton", "clearButton", "logBody"
].map((id) => [id, document.getElementById(id)]));

initialize().catch(showFatal);

async function initialize() {
  const hasWebGpu = Boolean(navigator.gpu);
  elements.webgpuBadge.textContent = hasWebGpu ? "WebGPU verfügbar" : "WebGPU nicht verfügbar";
  elements.webgpuBadge.className = `badge ${hasWebGpu ? "ok" : "bad"}`;
  if (!hasWebGpu) elements.overall.textContent = "Dieses Gerät oder dieser Browser unterstützt WebGPU nicht. Bitte aktuelles Chrome oder Edge auf Android verwenden.";

  for (const role of ["product", "vda"]) {
    document.getElementById(`${role}Input`).addEventListener("change", (event) => handleFile(role, event));
  }
  elements.analyzeButton.addEventListener("click", analyzeBoth);
  elements.saveButton.addEventListener("click", persistCurrentRecord);
  elements.demoButton.addEventListener("click", loadDemo);
  elements.resetButton.addEventListener("click", resetCurrent);
  elements.exportButton.addEventListener("click", () => runAction(() => exportRecordsToExcel([...state.records].reverse())));
  elements.clearButton.addEventListener("click", clearLog);
  elements.logBody.addEventListener("click", handleLogClick);
  elements.comparisonBody.addEventListener("change", handleManualEdit);

  state.records = await loadRecords();
  renderLog();
  registerServiceWorker();
}

function labelCard(role, title) {
  return `
    <article class="card">
      <div class="card-head"><h2>${title}</h2><span id="${role}Status" class="small">Noch kein Bild</span></div>
      <div class="card-body">
        <label class="capture">Foto aufnehmen / auswählen<input id="${role}Input" type="file" accept="image/*" capture="environment"></label>
        <div id="${role}Preview" class="preview"><div class="placeholder">Etikett möglichst gerade, vollständig und ohne Reflexion fotografieren.</div></div>
        <div id="${role}Quality" class="quality">Bereit.</div>
      </div>
    </article>`;
}

async function handleFile(role, event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  await runAction(async () => {
    setLabelStatus(role, "Bild wird vorbereitet …");
    const prepared = await prepareImage(file);
    state[role] = { ...emptyLabel(role), image: prepared };
    renderImage(role);
    const qualityElement = document.getElementById(`${role}Quality`);
    qualityElement.textContent = prepared.quality.warnings.length ? prepared.quality.warnings.join(" ") : `Bildqualität plausibel · Schärfewert ${prepared.quality.sharpness}`;
    qualityElement.className = `quality ${prepared.quality.acceptable ? "ok" : "warn"}`;
    setLabelStatus(role, `${prepared.width} × ${prepared.height}px`);
    state.comparison = null;
    state.currentSaved = false;
    renderComparison();
    updateButtons();
  });
}

async function analyzeBoth() {
  if (!state.product.image || !state.vda.image) return;
  await runAction(async () => {
    showProgress(true, "Florence-2 wird vorbereitet …", 0);
    const client = getClient();
    await client.load();
    state.modelReady = true;
    elements.modelBadge.textContent = `Florence-2 bereit · ${MODEL_ID}`;
    elements.modelBadge.className = "badge ok";

    let totalMs = 0;
    for (const role of ["product", "vda"]) {
      showProgress(true, `${role === "product" ? "Produktlabel" : "VDA-Label"} wird analysiert …`, role === "product" ? 35 : 65);
      const response = await client.analyze(state[role].image.dataUrl, role);
      totalMs += response.elapsedMs || 0;
      let parsed = parseFlorenceOcr(response.result, { role, imageSize: response.imageSize });
      let refinement = null;

      const detailImage = await cropImageToDetectedText(state[role].image, parsed.entries);
      if (detailImage && (needsRefinement(parsed) || detailImage.cropRect.areaRatio < 0.72)) {
        showProgress(true, `${role === "product" ? "Produktlabel" : "VDA-Label"}: Detailausschnitt wird erneut gelesen …`, role === "product" ? 48 : 82);
        const detailResponse = await client.analyze(detailImage.dataUrl, role);
        totalMs += detailResponse.elapsedMs || 0;
        const detailParsed = parseFlorenceOcr(detailResponse.result, { role, imageSize: detailResponse.imageSize });
        parsed = mergeParsedResults(parsed, detailParsed);
        refinement = { image: detailImage, response: detailResponse, parsed: detailParsed };
      }

      state[role].ocr = response;
      state[role].refinement = refinement;
      state[role].fields = parsed.fields;
      state[role].entries = parsed.entries;
      state[role].refinedEntries = parsed.refinedEntries || [];
      drawBoxes(role, parsed.entries);
      const detailText = refinement ? " · Detailpass aktiv" : "";
      setLabelStatus(role, `Analysiert in ${formatDuration((response.elapsedMs || 0) + (refinement?.response?.elapsedMs || 0))}${detailText}`);
    }

    state.comparison = compareLabels(state.product.fields, state.vda.fields);
    state.currentSaved = false;
    elements.analysisTime.textContent = `Gesamt ${formatDuration(totalMs)}`;
    showProgress(false);
    renderComparison();
    renderRawOutput();
    updateButtons();
  });
}

function getClient() {
  if (state.client) return state.client;
  state.client = new FlorenceClient();
  state.client.addEventListener("status", (event) => showProgress(true, event.detail.text, Number(elements.progress.value) || 5));
  state.client.addEventListener("progress", (event) => {
    const info = event.detail.progress || {};
    const percent = Number(info.progress);
    const text = info.file ? `${info.status || "Laden"}: ${info.file}` : info.status || "Modelldateien werden geladen …";
    showProgress(true, text, Number.isFinite(percent) ? percent : Number(elements.progress.value) || 10);
  });
  return state.client;
}

function renderImage(role) {
  const preview = document.getElementById(`${role}Preview`);
  preview.innerHTML = `<img id="${role}Image" alt="${role === "product" ? "Produktlabel" : "VDA-Label"}"><canvas id="${role}Canvas"></canvas>`;
  document.getElementById(`${role}Image`).src = state[role].image.dataUrl;
}

function drawBoxes(role, entries) {
  const image = document.getElementById(`${role}Image`);
  const canvas = document.getElementById(`${role}Canvas`);
  if (!image || !canvas) return;
  const draw = () => {
    const rect = image.getBoundingClientRect();
    const source = state[role].image;
    canvas.width = Math.max(1, Math.round(rect.width * devicePixelRatio));
    canvas.height = Math.max(1, Math.round(rect.height * devicePixelRatio));
    const context = canvas.getContext("2d");
    context.scale(devicePixelRatio, devicePixelRatio);
    const scale = Math.min(rect.width / source.width, rect.height / source.height);
    const offsetX = (rect.width - source.width * scale) / 2;
    const offsetY = (rect.height - source.height * scale) / 2;
    context.lineWidth = 1.5;
    context.strokeStyle = "#ffad35";
    context.fillStyle = "rgba(255,173,53,.12)";
    for (const entry of entries) {
      if (!entry.box?.length) continue;
      context.beginPath();
      for (let index = 0; index < 8; index += 2) {
        const x = offsetX + entry.box[index] * scale;
        const y = offsetY + entry.box[index + 1] * scale;
        index === 0 ? context.moveTo(x, y) : context.lineTo(x, y);
      }
      context.closePath();
      context.fill();
      context.stroke();
    }
  };
  image.complete ? requestAnimationFrame(draw) : image.addEventListener("load", draw, { once: true });
}

function renderComparison() {
  if (!state.product.fields || !state.vda.fields) {
    elements.overall.textContent = state.product.image && state.vda.image ? "Beide Bilder sind bereit. Analyse starten." : "Bitte beide Etiketten fotografieren.";
    elements.overall.className = "overall review";
    elements.comparisonBody.innerHTML = "";
    return;
  }

  if (!state.comparison) state.comparison = compareLabels(state.product.fields, state.vda.fields);
  elements.overall.textContent = state.comparison.summary;
  elements.overall.className = `overall ${state.comparison.status}`;
  elements.comparisonBody.innerHTML = FIELD_DEFINITIONS.map(([key, label]) => {
    const check = state.comparison.checks[key];
    const status = check ? check.status : "info";
    const resultText = check ? ({ match: "stimmt", mismatch: "abweichend", missing: "fehlt" }[status]) : "nur Information";
    return `<tr data-field="${key}">
      <td class="field-name">${label}</td>
      <td data-label="Produktlabel">${fieldInput("product", key)}</td>
      <td data-label="VDA-Label">${fieldInput("vda", key)}</td>
      <td data-label="Ergebnis" class="${status}">${resultText}</td>
    </tr>`;
  }).join("");
}

function fieldInput(role, key) {
  const field = state[role].fields?.[key] || { value: "", score: 0, manual: false };
  const uncertain = field.value && field.score < 80;
  const css = field.manual ? "manual" : uncertain ? "uncertain" : "";
  return `<input class="field-input ${css}" data-role="${role}" data-key="${key}" value="${escapeAttribute(field.value || "")}" aria-label="${role} ${key}"><div class="small">${field.manual ? "manuell korrigiert" : field.value ? `${field.source} · Score ${field.score}` : "nicht erkannt"}</div>`;
}

function handleManualEdit(event) {
  const input = event.target.closest("input[data-role][data-key]");
  if (!input) return;
  const { role, key } = input.dataset;
  state[role].fields[key] = { ...(state[role].fields[key] || {}), value: input.value.trim(), score: 100, source: "Manuelle Eingabe", manual: true };
  state.comparison = compareLabels(state.product.fields, state.vda.fields);
  state.currentSaved = false;
  renderComparison();
  updateButtons();
}

async function persistCurrentRecord() {
  if (!state.comparison) return;
  const record = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    status: state.comparison.status,
    product: valuesOnly(state.product.fields),
    vda: valuesOnly(state.vda.fields),
    comparison: structuredClone(state.comparison),
    manuallyCorrected: hasManualFields(state.product.fields) || hasManualFields(state.vda.fields),
    appVersion: APP_VERSION,
    model: MODEL_ID,
  };
  await saveRecord(record);
  state.records.unshift(record);
  renderLog();
  state.currentSaved = true;
  elements.saveButton.disabled = true;
  elements.storageBadge.textContent = "Datensatz gespeichert";
  elements.storageBadge.className = "badge ok";
}

function renderLog() {
  elements.recordCount.textContent = `${state.records.length} Datensätze`;
  elements.exportButton.disabled = state.records.length === 0;
  elements.clearButton.disabled = state.records.length === 0;
  elements.logBody.innerHTML = state.records.map((record) => `<tr>
    <td>${new Date(record.timestamp).toLocaleString("de-DE")}</td>
    <td class="${record.status}">${record.status === "released" ? "FREIGEGEBEN" : record.status === "rejected" ? "NICHT FREIGEGEBEN" : "PRÜFUNG"}</td>
    <td>${escapeHtml(record.product.batch)}</td><td>${escapeHtml(record.vda.batch)}</td>
    <td>${escapeHtml(record.product.idh)}</td><td>${escapeHtml(record.vda.idh)}</td>
    <td>${escapeHtml(record.product.weight)}</td><td>${escapeHtml(record.vda.weight)}</td>
    <td>${escapeHtml(record.vda.drum)}</td><td>${escapeHtml(record.vda.deliveryNote)}</td>
    <td><button class="danger" data-delete="${record.id}">Löschen</button></td>
  </tr>`).join("");
}

async function handleLogClick(event) {
  const button = event.target.closest("button[data-delete]");
  if (!button || !confirm("Diesen Datensatz löschen?")) return;
  await deleteRecord(button.dataset.delete);
  state.records = state.records.filter((record) => record.id !== button.dataset.delete);
  renderLog();
}

async function clearLog() {
  if (!confirm("Das gesamte lokale Scanprotokoll löschen? Vorher bei Bedarf als Excel exportieren.")) return;
  await clearRecords();
  state.records = [];
  renderLog();
}

function loadDemo() {
  state.product = { ...emptyLabel("product"), image: demoImage("Produktlabel"), fields: demoFields("product"), entries: [] };
  state.vda = { ...emptyLabel("vda"), image: demoImage("VDA-Label"), fields: demoFields("vda"), entries: [] };
  renderDemoPreview("product", "Produktlabel – Demo");
  renderDemoPreview("vda", "VDA-Label – Demo");
  state.comparison = compareLabels(state.product.fields, state.vda.fields);
  state.currentSaved = false;
  renderComparison();
  renderRawOutput();
  updateButtons();
}

function demoFields(role) {
  const values = role === "product"
    ? { batch: "D123456789", idh: "2847365", weight: "200 KG", drum: "", deliveryNote: "" }
    : { batch: "D123456789", idh: "2847365", weight: "200 KG", drum: "17", deliveryNote: "47110815" };
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value, score: 100, source: "Demo", manual: false }]));
}

function demoImage(label) {
  return { dataUrl: "", width: 1000, height: 700, quality: { warnings: [], acceptable: true, sharpness: 999 }, originalName: "demo" };
}

function renderDemoPreview(role, text) {
  const preview = document.getElementById(`${role}Preview`);
  preview.innerHTML = `<div class="placeholder"><strong>${text}</strong><br>Nur zum Testen von Vergleich, Speicherung und Excel-Export.</div>`;
  document.getElementById(`${role}Quality`).textContent = "Demo-Daten aktiv";
  document.getElementById(`${role}Quality`).className = "quality ok";
  setLabelStatus(role, "Demo");
}

function resetCurrent() {
  state.product = emptyLabel("product");
  state.vda = emptyLabel("vda");
  state.comparison = null;
  state.currentSaved = false;
  for (const role of ["product", "vda"]) {
    document.getElementById(`${role}Preview`).innerHTML = '<div class="placeholder">Etikett möglichst gerade, vollständig und ohne Reflexion fotografieren.</div>';
    document.getElementById(`${role}Quality`).textContent = "Bereit.";
    document.getElementById(`${role}Quality`).className = "quality";
    setLabelStatus(role, "Noch kein Bild");
  }
  elements.rawOutput.textContent = "Noch keine Analyse.";
  elements.analysisTime.textContent = "—";
  renderComparison();
  updateButtons();
}

function renderRawOutput() {
  elements.rawOutput.textContent = JSON.stringify({
    product: {
      fields: valuesOnly(state.product.fields),
      blocks: state.product.entries?.map((entry) => ({ text: entry.text, box: entry.box })) || [],
      detailBlocks: state.product.refinedEntries?.map((entry) => ({ text: entry.text, box: entry.box })) || [],
    },
    vda: {
      fields: valuesOnly(state.vda.fields),
      blocks: state.vda.entries?.map((entry) => ({ text: entry.text, box: entry.box })) || [],
      detailBlocks: state.vda.refinedEntries?.map((entry) => ({ text: entry.text, box: entry.box })) || [],
    },
  }, null, 2);
}

function updateButtons() {
  elements.analyzeButton.disabled = state.busy || !navigator.gpu || !state.product.image?.dataUrl || !state.vda.image?.dataUrl;
  elements.saveButton.disabled = state.busy || !state.comparison || state.currentSaved;
}

async function runAction(action) {
  if (state.busy) return;
  state.busy = true;
  updateButtons();
  try {
    await action();
  } catch (error) {
    console.error(error);
    showProgress(false);
    elements.overall.textContent = `Fehler: ${error.message || error}`;
    elements.overall.className = "overall rejected";
  } finally {
    state.busy = false;
    updateButtons();
  }
}

function showProgress(visible, text = "", value = 0) {
  elements.progressWrap.classList.toggle("visible", visible);
  if (text) elements.progressText.textContent = text;
  if (Number.isFinite(Number(value))) elements.progress.value = Math.max(0, Math.min(100, Number(value)));
}

function setLabelStatus(role, text) {
  document.getElementById(`${role}Status`).textContent = text;
}

function emptyLabel(role) {
  return { role, image: null, ocr: null, refinement: null, fields: null, entries: [], refinedEntries: [] };
}

function valuesOnly(fields) {
  return Object.fromEntries(FIELD_DEFINITIONS.map(([key]) => [key, fields?.[key]?.value || ""]));
}

function hasManualFields(fields) {
  return Object.values(fields || {}).some((field) => field.manual);
}

function formatDuration(milliseconds) {
  const seconds = Math.max(0, Number(milliseconds || 0)) / 1000;
  return seconds < 60 ? `${seconds.toFixed(1)} s` : `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function showFatal(error) {
  console.error(error);
  elements.overall.textContent = `Initialisierung fehlgeschlagen: ${error.message || error}`;
  elements.overall.className = "overall rejected";
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register(new URL("sw.js", new URL(import.meta.env.BASE_URL, location.origin))).catch(console.warn);
  }
}
