import "./styles.css";
import { APP_VERSION, MODEL_ID } from "./config.js";
import { prepareImage } from "./image-tools.js";
import { parseFlorenceEntries } from "./ocr-entries.js";
import { resolveLabelProfile, mapWithProfile } from "./profile-engine.js";
import { loadProfileConfig, profilesForRole } from "./profiles.js";
import { compareLabels } from "./comparison.js";
import { FlorenceClient } from "./model-client.js";
import { clearRecords, deleteRecord, loadRecords, saveRecord } from "./storage.js";
import { exportRecordsToExcel } from "./excel-export.js";
import { readConfiguredCodes } from "./barcode.js";

const FIELD_DEFINITIONS = [
  ["batch", "Batch"], ["idh", "IDH"], ["weight", "Gewicht"], ["drum", "Fassnummer"], ["deliveryNote", "Lieferscheinnummer"],
];

const state = {
  client: null,
  modelLoadPromise: null,
  config: null,
  busy: false,
  analysisQueue: Promise.resolve(),
  pendingAnalyses: 0,
  imageRevision: { product: 0, vda: 0 },
  timings: { model: 0, product: 0, vda: 0 },
  product: emptyLabel("product"),
  vda: emptyLabel("vda"),
  comparison: null,
  records: [],
  currentSaved: false,
};

document.querySelector("#app").innerHTML = `
  <header>
    <div><h1>LabelCheck Florence <small class="small">v${APP_VERSION}</small></h1><p>Florence wird vorab geladen und jedes Foto direkt nach der Aufnahme analysiert.</p></div>
    <a class="header-link" href="./editor.html">Profileditor öffnen</a>
  </header>
  <main>
    <div class="statusbar">
      <span id="webgpuBadge" class="badge warn">WebGPU wird geprüft …</span>
      <span id="modelBadge" class="badge warn">Florence-2 noch nicht geladen</span>
      <span id="configBadge" class="badge warn">Profile werden geladen …</span>
      <span id="storageBadge" class="badge">Lokales Protokoll</span>
    </div>
    <div class="privacy">Die Fotos verlassen das Smartphone nicht. Das Produktlabel wird bereits analysiert, während du das VDA-Label aufnimmst. Es findet keine Randerkennung und kein automatischer Zuschnitt statt.</div>

    <section class="grid">
      ${labelCard("product", "Etikett 1 – Produktlabel")}
      ${labelCard("vda", "Etikett 2 – VDA-Label")}
    </section>

    <section class="card result-card">
      <div class="card-head"><h2>Analyse und Vergleich</h2><span id="analysisTime" class="small">—</span></div>
      <div class="card-body">
        <div id="overall" class="overall review">Bitte beide Etiketten fotografieren.</div>
        <div id="profileWarning" class="editor-message hidden"></div>
        <div id="progressWrap" class="progress-wrap"><progress id="progress" max="100" value="0"></progress><div id="progressText" class="progress-text">Vorbereitung …</div></div>
        <div class="actions">
          <button id="analyzeButton" class="primary" disabled>Beide Etiketten erneut analysieren</button>
          <button id="saveButton" class="good" disabled>Datensatz übernehmen</button>
          <button id="demoButton" class="secondary">Demo-Daten laden</button>
          <button id="resetButton" class="danger">Aufnahmen zurücksetzen</button>
        </div>
        <div style="overflow-x:auto"><table class="comparison-table"><thead><tr><th>Prüfung</th><th>Produktlabel</th><th>VDA-Label</th><th>Ergebnis</th></tr></thead><tbody id="comparisonBody"></tbody></table></div>
        <details class="raw-details"><summary>Florence-Rohdaten, Profil und Positionszuordnung</summary><pre id="rawOutput">Noch keine Analyse.</pre></details>
      </div>
    </section>

    <section class="card result-card">
      <div class="card-head"><h2>Lokales Scanprotokoll</h2><span id="recordCount" class="small">0 Datensätze</span></div>
      <div class="card-body">
        <div class="actions"><button id="exportButton" disabled>Excel speichern / teilen</button><button id="clearButton" class="danger" disabled>Protokoll leeren</button></div>
        <div class="log-wrap"><table class="log-table"><thead><tr><th>Zeit</th><th>Ergebnis</th><th>Profil Produkt</th><th>Profil VDA</th><th>Batch Produkt</th><th>Batch VDA</th><th>IDH Produkt</th><th>IDH VDA</th><th>Gewicht Produkt</th><th>Gewicht VDA</th><th></th></tr></thead><tbody id="logBody"></tbody></table></div>
      </div>
    </section>
  </main>`;

const elements = Object.fromEntries([
  "webgpuBadge", "modelBadge", "configBadge", "storageBadge", "overall", "profileWarning", "progressWrap", "progress", "progressText", "analyzeButton", "saveButton", "demoButton", "resetButton", "comparisonBody", "rawOutput", "analysisTime", "recordCount", "exportButton", "clearButton", "logBody",
].map((id) => [id, document.getElementById(id)]));

initialize().catch(showFatal);

async function initialize() {
  const hasWebGpu = Boolean(navigator.gpu);
  elements.webgpuBadge.textContent = hasWebGpu ? "WebGPU verfügbar" : "WebGPU nicht verfügbar";
  elements.webgpuBadge.className = `badge ${hasWebGpu ? "ok" : "bad"}`;

  state.config = await loadProfileConfig();
  const activeCount = Object.values(state.config.profiles).filter((profile) => profile.active !== false && profile.configured !== false).length;
  elements.configBadge.textContent = `${activeCount} Profile · Konfiguration ${state.config.configVersion}`;
  elements.configBadge.className = "badge ok";
  populateProfileSelectors();

  for (const role of ["product", "vda"]) {
    document.getElementById(`${role}Input`).addEventListener("change", (event) => handleFile(role, event));
    document.getElementById(`${role}Profile`).addEventListener("change", () => remapRole(role));
  }
  elements.analyzeButton.addEventListener("click", reanalyzeBoth);
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
  updateButtons();

  // Das große Modell wird sofort im Hintergrund vorbereitet. So fällt die
  // Initialisierung nicht erst nach beiden Kameraaufnahmen an.
  void preloadModel().catch((error) => {
    console.error(error);
    elements.modelBadge.textContent = `Florence nicht bereit: ${error.message || error}`;
    elements.modelBadge.className = "badge bad";
    showProgress(false);
  });
}

function labelCard(role, title) {
  return `<article class="card">
    <div class="card-head"><h2>${title}</h2><span id="${role}Status" class="small">Noch kein Bild</span></div>
    <div class="card-body">
      <label class="capture">Foto aufnehmen / auswählen<input id="${role}Input" type="file" accept="image/*" capture="environment"></label>
      <label class="profile-select-label">Layoutprofil<select id="${role}Profile"><option value="">Automatisch erkennen</option></select></label>
      <div id="${role}ProfileInfo" class="profile-info">Noch nicht bestimmt.</div>
      <div id="${role}Preview" class="preview"><div class="placeholder">Etikett vollständig, möglichst gerade und ohne Reflexion fotografieren.</div></div>
      <div id="${role}Quality" class="quality">Bereit.</div>
    </div>
  </article>`;
}

function populateProfileSelectors() {
  for (const role of ["product", "vda"]) {
    const select = document.getElementById(`${role}Profile`);
    const profiles = profilesForRole(state.config, role);
    const autoLabel = role === "product" ? "Produktprofil aus Konfiguration" : "Kundenname automatisch erkennen";
    select.innerHTML = `<option value="">${autoLabel}</option>${profiles.map((profile) => `<option value="${escapeAttribute(profile.id)}">${escapeHtml(profile.name)}${profile.manualOnly ? " · manuell" : ""}</option>`).join("")}`;
  }
}

async function handleFile(role, event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  const revision = ++state.imageRevision[role];
  try {
    setLabelStatus(role, "Bild wird vorbereitet …");
    const prepared = await prepareImage(file);
    if (revision !== state.imageRevision[role]) return;

    state[role] = {
      ...emptyLabel(role),
      image: prepared,
      revision,
      preferredProfileId: document.getElementById(`${role}Profile`).value,
    };
    renderImage(role);
    const quality = document.getElementById(`${role}Quality`);
    quality.textContent = prepared.quality.warnings.length
      ? prepared.quality.warnings.join(" ")
      : `Bildqualität plausibel · Schärfewert ${prepared.quality.sharpness}`;
    quality.className = `quality ${prepared.quality.acceptable ? "ok" : "warn"}`;
    setLabelStatus(role, "Wartet auf Florence …");
    state.comparison = null;
    state.currentSaved = false;
    renderComparison();
    updateButtons();

    scheduleRoleAnalysis(role);
  } catch (error) {
    console.error(error);
    setLabelStatus(role, `Fehler: ${error.message || error}`);
    elements.overall.textContent = `Bild konnte nicht vorbereitet werden: ${error.message || error}`;
    elements.overall.className = "overall rejected";
  }
}

function preloadModel() {
  if (state.modelLoadPromise) return state.modelLoadPromise;
  if (!navigator.gpu) return Promise.reject(new Error("WebGPU ist nicht verfügbar."));

  const started = performance.now();
  elements.modelBadge.textContent = "Florence-2 wird im Hintergrund geladen …";
  elements.modelBadge.className = "badge warn";
  showProgress(true, "Florence-2 wird im Hintergrund vorbereitet …", 2);

  state.modelLoadPromise = getClient().load().then((result) => {
    state.timings.model = performance.now() - started;
    elements.modelBadge.textContent = `Florence-2 bereit · ${MODEL_ID}`;
    elements.modelBadge.className = "badge ok";
    if (state.pendingAnalyses === 0) showProgress(false);
    renderAnalysisTiming();
    return result;
  }).catch((error) => {
    state.modelLoadPromise = null;
    throw error;
  });

  return state.modelLoadPromise;
}

function scheduleRoleAnalysis(role, { force = false } = {}) {
  const label = state[role];
  if (!label.image?.dataUrl) return;
  if (!force && ["queued", "running"].includes(label.analysisStatus)) return;

  const revision = label.revision;
  const jobId = crypto.randomUUID();
  label.analysisStatus = "queued";
  label.analysisJobId = jobId;
  state.pendingAnalyses += 1;
  setLabelStatus(role, "Analyse vorgemerkt …");
  renderComparison();
  updateButtons();

  const run = async () => {
    try {
      await analyzeRole(role, revision, jobId);
    } catch (error) {
      console.error(error);
      if (state[role].analysisJobId === jobId) {
        state[role].analysisStatus = "error";
        setLabelStatus(role, `Florence-Fehler: ${error.message || error}`);
        elements.overall.textContent = `Fehler: ${error.message || error}`;
        elements.overall.className = "overall rejected";
      }
    } finally {
      state.pendingAnalyses = Math.max(0, state.pendingAnalyses - 1);
      if (state.pendingAnalyses === 0) showProgress(false);
      renderComparison();
      updateButtons();
    }
  };

  state.analysisQueue = state.analysisQueue.catch(() => {}).then(run);
}

async function analyzeRole(role, revision, jobId) {
  if (!isCurrentJob(role, revision, jobId)) return;
  state[role].analysisStatus = "running";
  const labelName = role === "product" ? "Produktlabel" : "VDA-Label";
  setLabelStatus(role, "Florence läuft …");
  showProgress(true, `${labelName}: Florence wird vorbereitet …`, role === "product" ? 28 : 68);

  await preloadModel();
  if (!isCurrentJob(role, revision, jobId)) return;

  showProgress(true, `${labelName} wird vollständig gelesen …`, role === "product" ? 35 : 72);
  const response = await getClient().analyze(state[role].image.dataUrl, role);
  if (!isCurrentJob(role, revision, jobId)) return;

  applyOcrResult(role, response);
  await applyConfiguredCodes(role);
  if (!isCurrentJob(role, revision, jobId)) return;
  state[role].analysisStatus = "done";
  state.timings[role] = Number(response.elapsedMs || 0);
  setLabelStatus(role, `Florence ${formatDuration(response.elapsedMs)} · ${state[role].mapping.profile?.name || "Profil offen"}`);
  renderAnalysisTiming();

  if (state.product.fields && state.vda.fields) {
    state.comparison = compareLabels(state.product.fields, state.vda.fields);
    state.currentSaved = false;
  }
  renderComparison();
  renderRawOutput();
  renderWarnings();
  updateButtons();
}

function applyOcrResult(role, response) {
  const entries = parseFlorenceEntries(response.result, response.imageSize);
  state[role].ocr = response;
  state[role].entries = entries;
  state[role].mapping = resolveLabelProfile(
    state.config,
    role,
    entries,
    response.imageSize,
    document.getElementById(`${role}Profile`).value,
  );
  state[role].fields = state[role].mapping.fields;

  // Barcodefelder werden später im selben Job ergänzt. Der Florence-Lauf
  // selbst bleibt weiterhin genau einmal pro Etikett.
  if (state[role].mapping.profile) {
    document.getElementById(`${role}Profile`).value = state[role].mapping.profile.id;
  }
  renderProfileInfo(role);
  drawOverlay(role);
}

async function applyConfiguredCodes(role) {
  const profile = state[role].mapping?.profile;
  if (!profile?.codeRegions?.length) return;
  const codeResult = await readConfiguredCodes(state[role].image.dataUrl, profile);
  state[role].codeResult = codeResult;
  state[role].fields = { ...state[role].fields, ...codeResult.fields };
  if (codeResult.warning) {
    state[role].mapping.warning = [state[role].mapping.warning, codeResult.warning].filter(Boolean).join(" ");
  }
}

function isCurrentJob(role, revision, jobId) {
  const label = state[role];
  return label.revision === revision && label.analysisJobId === jobId;
}

function reanalyzeBoth() {
  if (!state.product.image || !state.vda.image || state.pendingAnalyses > 0) return;
  state.product.fields = null;
  state.vda.fields = null;
  state.comparison = null;
  scheduleRoleAnalysis("product", { force: true });
  scheduleRoleAnalysis("vda", { force: true });
}

function renderAnalysisTiming() {
  const parts = [];
  if (state.timings.product) parts.push(`Produkt ${formatDuration(state.timings.product)}`);
  if (state.timings.vda) parts.push(`VDA ${formatDuration(state.timings.vda)}`);
  if (!parts.length && state.timings.model) parts.push(`Modellstart ${formatDuration(state.timings.model)}`);
  elements.analysisTime.textContent = parts.length ? parts.join(" · ") : "—";
}

function remapRole(role) {
  const label = state[role];
  if (!label.entries.length || !label.ocr?.imageSize) return;
  const profileId = document.getElementById(`${role}Profile`).value;
  const profile = state.config.profiles[profileId];
  label.mapping = profile
    ? mapWithProfile(profile, label.entries, label.ocr.imageSize, { forced: true })
    : resolveLabelProfile(state.config, role, label.entries, label.ocr.imageSize, "");
  label.fields = label.mapping.fields;
  if (label.mapping.profile) document.getElementById(`${role}Profile`).value = label.mapping.profile.id;
  state.comparison = state.product.fields && state.vda.fields ? compareLabels(state.product.fields, state.vda.fields) : null;
  state.currentSaved = false;
  renderProfileInfo(role); drawOverlay(role); renderComparison(); renderRawOutput(); renderWarnings(); updateButtons();
}

function renderProfileInfo(role) {
  const mapping = state[role].mapping;
  const element = document.getElementById(`${role}ProfileInfo`);
  if (!mapping?.profile) {
    element.textContent = mapping?.warning || "Profil nicht erkannt.";
    element.className = "profile-info warn";
    return;
  }
  const refinement = mapping.refinement?.used ? ` · Geometrie ${mapping.refinement.inliers} Treffer` : "";
  element.textContent = `${mapping.profile.name} · Profilscore ${mapping.profileScore} · Anker ${Math.round(mapping.anchor.score)}${refinement}`;
  element.className = `profile-info ${mapping.resolved ? "ok" : "warn"}`;
}

function getClient() {
  if (state.client) return state.client;
  state.client = new FlorenceClient();
  state.client.addEventListener("status", (event) => showProgress(true, event.detail.text, Number(elements.progress.value) || 5));
  state.client.addEventListener("progress", (event) => {
    const info = event.detail.progress || {}; const percent = Number(info.progress);
    showProgress(true, info.file ? `${info.status || "Laden"}: ${info.file}` : info.status || "Modelldateien werden geladen …", Number.isFinite(percent) ? percent : Number(elements.progress.value) || 10);
  });
  return state.client;
}

function renderImage(role) {
  const preview = document.getElementById(`${role}Preview`);
  preview.innerHTML = `<img id="${role}Image" alt="${role}"><canvas id="${role}Canvas"></canvas>`;
  document.getElementById(`${role}Image`).src = state[role].image.dataUrl;
}

function drawOverlay(role) {
  const image = document.getElementById(`${role}Image`); const canvas = document.getElementById(`${role}Canvas`);
  if (!image || !canvas) return;
  const draw = () => {
    const rect = image.getBoundingClientRect(); const source = state[role].image;
    canvas.width = Math.max(1, Math.round(rect.width * devicePixelRatio)); canvas.height = Math.max(1, Math.round(rect.height * devicePixelRatio));
    const context = canvas.getContext("2d"); context.scale(devicePixelRatio, devicePixelRatio);
    const scale = Math.min(rect.width / source.width, rect.height / source.height); const offsetX = (rect.width - source.width * scale) / 2; const offsetY = (rect.height - source.height * scale) / 2;
    context.font = "bold 12px system-ui";
    for (const entry of state[role].entries || []) drawQuad(context, entry.box, scale, offsetX, offsetY, "#ffad35", "rgba(255,173,53,.08)");
    const mapping = state[role].mapping;
    if (mapping?.anchor?.entry) drawQuad(context, mapping.anchor.entry.box, scale, offsetX, offsetY, "#63e6be", "rgba(99,230,190,.13)", "ANKER");
    for (const [key, label] of FIELD_DEFINITIONS) {
      const field = mapping?.fields?.[key]; if (!field?.expectedQuad) continue;
      drawQuad(context, field.expectedQuad, scale, offsetX, offsetY, field.value ? "#55c2f2" : "#ff666e", field.value ? "rgba(85,194,242,.10)" : "rgba(255,102,110,.10)", label);
    }
  };
  image.complete ? requestAnimationFrame(draw) : image.addEventListener("load", draw, { once: true });
}

function drawQuad(context, quad, scale, offsetX, offsetY, stroke, fill, text = "") {
  if (!Array.isArray(quad) || quad.length < 8) return;
  context.beginPath();
  for (let index = 0; index < 8; index += 2) {
    const x = offsetX + quad[index] * scale; const y = offsetY + quad[index + 1] * scale;
    index === 0 ? context.moveTo(x, y) : context.lineTo(x, y);
  }
  context.closePath(); context.lineWidth = 1.7; context.strokeStyle = stroke; context.fillStyle = fill; context.fill(); context.stroke();
  if (text) { context.fillStyle = stroke; context.fillText(text, offsetX + quad[0] * scale + 3, offsetY + quad[1] * scale - 4); }
}

function renderComparison() {
  if (!state.product.fields || !state.vda.fields) {
    elements.overall.textContent = state.pendingAnalyses > 0
      ? "Florence analysiert die Aufnahmen automatisch im Hintergrund."
      : state.product.image && state.vda.image
        ? "Beide Bilder sind vorhanden. Falls nötig, Analyse erneut starten."
        : "Bitte beide Etiketten fotografieren.";
    elements.overall.className = "overall review"; elements.comparisonBody.innerHTML = ""; return;
  }
  if (!state.comparison) state.comparison = compareLabels(state.product.fields, state.vda.fields);
  elements.overall.textContent = state.comparison.summary; elements.overall.className = `overall ${state.comparison.status}`;
  elements.comparisonBody.innerHTML = FIELD_DEFINITIONS.map(([key, label]) => {
    const check = state.comparison.checks[key]; const status = check ? check.status : "info";
    const resultText = check ? ({ match: "stimmt", mismatch: "abweichend", missing: "fehlt" }[status]) : "nur Information";
    return `<tr data-field="${key}"><td class="field-name">${label}</td><td data-label="Produktlabel">${fieldInput("product", key)}</td><td data-label="VDA-Label">${fieldInput("vda", key)}</td><td data-label="Ergebnis" class="${status}">${resultText}</td></tr>`;
  }).join("");
}

function fieldInput(role, key) {
  const field = state[role].fields?.[key] || { value: "", score: 0, manual: false };
  const uncertain = field.value && (!field.valid || field.score < 74); const css = field.manual ? "manual" : uncertain ? "uncertain" : "";
  return `<input class="field-input ${css}" data-role="${role}" data-key="${key}" value="${escapeAttribute(field.value || "")}"><div class="small">${field.manual ? "manuell korrigiert" : field.value ? `${field.source} · Score ${field.score}${field.valid ? "" : " · Muster unsicher"}` : field.raw ? `gesehen: ${escapeHtml(field.raw)} · ${field.source}` : field.source || "nicht erkannt"}</div>`;
}

function handleManualEdit(event) {
  const input = event.target.closest("input[data-role][data-key]"); if (!input) return;
  const { role, key } = input.dataset;
  state[role].fields[key] = { ...(state[role].fields[key] || {}), value: input.value.trim(), score: 100, source: "Manuelle Eingabe", valid: true, manual: true };
  state.comparison = compareLabels(state.product.fields, state.vda.fields); state.currentSaved = false; renderComparison(); updateButtons();
}

function renderWarnings() {
  const messages = [state.product.mapping?.warning, state.vda.mapping?.warning].filter(Boolean);
  elements.profileWarning.classList.toggle("hidden", messages.length === 0);
  elements.profileWarning.textContent = messages.join(" ");
  elements.profileWarning.className = `editor-message ${messages.length ? "warn" : "hidden"}`;
}

async function persistCurrentRecord() {
  if (!state.comparison) return;
  const record = {
    id: crypto.randomUUID(), timestamp: new Date().toISOString(), status: state.comparison.status,
    product: valuesOnly(state.product.fields), vda: valuesOnly(state.vda.fields), comparison: structuredClone(state.comparison),
    productProfile: state.product.mapping?.profile?.name || "", vdaProfile: state.vda.mapping?.profile?.name || "",
    manuallyCorrected: hasManualFields(state.product.fields) || hasManualFields(state.vda.fields), appVersion: APP_VERSION, model: MODEL_ID,
  };
  await saveRecord(record); state.records.unshift(record); renderLog(); state.currentSaved = true; elements.saveButton.disabled = true;
}

function renderLog() {
  elements.recordCount.textContent = `${state.records.length} Datensätze`; elements.exportButton.disabled = state.records.length === 0; elements.clearButton.disabled = state.records.length === 0;
  elements.logBody.innerHTML = state.records.map((record) => `<tr><td>${new Date(record.timestamp).toLocaleString("de-DE")}</td><td class="${record.status}">${record.status === "released" ? "FREIGEGEBEN" : record.status === "rejected" ? "NICHT FREIGEGEBEN" : "PRÜFUNG"}</td><td>${escapeHtml(record.productProfile)}</td><td>${escapeHtml(record.vdaProfile)}</td><td>${escapeHtml(record.product.batch)}</td><td>${escapeHtml(record.vda.batch)}</td><td>${escapeHtml(record.product.idh)}</td><td>${escapeHtml(record.vda.idh)}</td><td>${escapeHtml(record.product.weight)}</td><td>${escapeHtml(record.vda.weight)}</td><td><button class="danger" data-delete="${record.id}">Löschen</button></td></tr>`).join("");
}

async function handleLogClick(event) { const button = event.target.closest("button[data-delete]"); if (!button || !confirm("Diesen Datensatz löschen?")) return; await deleteRecord(button.dataset.delete); state.records = state.records.filter((record) => record.id !== button.dataset.delete); renderLog(); }
async function clearLog() { if (!confirm("Das gesamte lokale Scanprotokoll löschen?")) return; await clearRecords(); state.records = []; renderLog(); }

function loadDemo() {
  state.product = demoLabel("product", "Format_001", { batch: "D123456789", idh: "2847365", weight: "200 KG", drum: "", deliveryNote: "" });
  state.vda = demoLabel("vda", "Format_007", { batch: "D123456789", idh: "2847365", weight: "200 KG", drum: "17", deliveryNote: "47110815" });
  renderDemoPreview("product", "Produktlabel – Demo"); renderDemoPreview("vda", "VDA-Label – Demo");
  state.comparison = compareLabels(state.product.fields, state.vda.fields); state.currentSaved = false; renderComparison(); renderRawOutput(); updateButtons();
}
function demoLabel(role, profileId, values) { const profile = state.config.profiles[profileId]; return { ...emptyLabel(role), image: { dataUrl: "", width: 1000, height: 700 }, fields: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value, score: 100, source: "Demo", valid: true }])), mapping: { profile, profileScore: 100, fields: {} } }; }
function renderDemoPreview(role, text) { document.getElementById(`${role}Preview`).innerHTML = `<div class="placeholder"><strong>${text}</strong></div>`; document.getElementById(`${role}Quality`).textContent = "Demo-Daten aktiv"; setLabelStatus(role, "Demo"); }

function resetCurrent() {
  state.imageRevision.product += 1;
  state.imageRevision.vda += 1;
  state.product = emptyLabel("product"); state.vda = emptyLabel("vda"); state.comparison = null; state.currentSaved = false;
  state.timings.product = 0; state.timings.vda = 0;
  for (const role of ["product", "vda"]) {
    document.getElementById(`${role}Preview`).innerHTML = '<div class="placeholder">Etikett vollständig, möglichst gerade und ohne Reflexion fotografieren.</div>';
    document.getElementById(`${role}Quality`).textContent = "Bereit."; document.getElementById(`${role}ProfileInfo`).textContent = "Noch nicht bestimmt."; document.getElementById(`${role}Profile`).value = ""; setLabelStatus(role, "Noch kein Bild");
  }
  elements.rawOutput.textContent = "Noch keine Analyse."; elements.analysisTime.textContent = "—"; elements.profileWarning.className = "hidden"; renderComparison(); updateButtons();
}

function renderRawOutput() {
  elements.rawOutput.textContent = JSON.stringify({
    product: rawLabel(state.product), vda: rawLabel(state.vda),
  }, null, 2);
}
function rawLabel(label) { return { profile: label.mapping?.profile?.name || null, profileScore: label.mapping?.profileScore || 0, anchor: label.mapping?.anchor ? { alias: label.mapping.anchor.alias, score: label.mapping.anchor.score, text: label.mapping.anchor.entry?.text } : null, geometryRefinement: label.mapping?.refinement || null, codeResult: label.codeResult || null, fields: label.fields, blocks: label.entries.map((entry) => ({ text: entry.text, box: entry.box })) }; }

function updateButtons() {
  elements.analyzeButton.disabled = state.busy || state.pendingAnalyses > 0 || !navigator.gpu || !state.product.image?.dataUrl || !state.vda.image?.dataUrl;
  elements.saveButton.disabled = state.busy || state.pendingAnalyses > 0 || !state.comparison || state.currentSaved;
}
async function runAction(action) { if (state.busy) return; state.busy = true; updateButtons(); try { await action(); } catch (error) { console.error(error); showProgress(false); elements.overall.textContent = `Fehler: ${error.message || error}`; elements.overall.className = "overall rejected"; } finally { state.busy = false; updateButtons(); } }
function showProgress(visible, text = "", value = 0) { elements.progressWrap.classList.toggle("visible", visible); if (text) elements.progressText.textContent = text; if (Number.isFinite(Number(value))) elements.progress.value = Math.max(0, Math.min(100, Number(value))); }
function setLabelStatus(role, text) { document.getElementById(`${role}Status`).textContent = text; }
function emptyLabel(role) { return { role, image: null, revision: 0, ocr: null, fields: null, entries: [], mapping: null, codeResult: null, preferredProfileId: "", analysisStatus: "idle", analysisJobId: "" }; }
function valuesOnly(fields) { return Object.fromEntries(FIELD_DEFINITIONS.map(([key]) => [key, fields?.[key]?.value || ""])); }
function hasManualFields(fields) { return Object.values(fields || {}).some((field) => field.manual); }
function formatDuration(milliseconds) { const seconds = Math.max(0, Number(milliseconds || 0)) / 1000; return seconds < 60 ? `${seconds.toFixed(1)} s` : `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]); }
function escapeAttribute(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
function showFatal(error) { console.error(error); elements.overall.textContent = `Initialisierung fehlgeschlagen: ${error.message || error}`; elements.overall.className = "overall rejected"; }
function registerServiceWorker() { if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register(new URL("sw.js", new URL(import.meta.env.BASE_URL, location.origin))).catch(console.warn); }
