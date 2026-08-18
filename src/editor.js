import "./styles.css";
import { APP_VERSION, QUALITY_PRESETS } from "./config.js";
import { PaddleOcrEngine, formatRuntimeDetails } from "./ocr-engine.js";
import { detectRuntimePolicy } from "./runtime-policy.js";
import { prepareImage } from "./image-tools.js";
import { detectQrProfile } from "./qr-engine.js";
import { boundsFromPoly, formatMilliseconds, safeError } from "./utils.js";
import {
  FIELD_ORDER,
  PROFILE_SCHEMA_VERSION,
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
import { applyEditorTranslations, getEditorLanguage, localText, setEditorLanguage, text as uiText } from "./editor-i18n.js";

const EDITOR_SELECTED_PROFILE_KEY = "labelcheck.editor.selected-profile.v1";
const EDITOR_OCR_MAX_SIDE = 1000;
const FIELD_ZONE_PADDING = 0.10;

const FIELD_UI_LABEL_KEYS = {
  batch: "batch",
  drum_number: "drum",
  idh: "idh",
  weight: "weight",
  delivery_note: "deliveryNote"
};

const FIELD_NORMALIZER_OPTIONS = {
  batch: [["text", "normalText"], ["batch", "normalBatch"]],
  drum_number: [["digits", "normalDigits"], ["last_digits", "normalLastDigits"], ["text", "normalText"]],
  idh: [["digits", "normalDigits"], ["last_digits", "normalLastDigits"], ["text", "normalText"]],
  weight: [["weight", "normalWeight"], ["net_weight", "normalNetWeight"], ["text", "normalText"]],
  delivery_note: [["digits", "normalDigits"], ["leading_delivery_digits", "normalDeliveryPair"], ["last_digits", "normalLastDigits"], ["text", "normalText"]]
};

const FIELD_STRATEGY_OPTIONS = {
  batch: [["", "strategyStandard"]],
  drum_number: [["", "strategyStandard"]],
  idh: [["", "strategyStandard"], ["numeric_pair", "strategyNumericPair"]],
  weight: [
    ["", "strategyStandard"],
    ["unit_required_weight", "strategyUnitWeight"],
    ["net_pair_weight", "strategyNetPair"],
    ["quantity_weight", "strategyQuantity"]
  ],
  delivery_note: [["", "strategyStandard"], ["numeric_pair", "strategyNumericPair"]]
};
const editorRuntimePolicy = detectRuntimePolicy({ compatibilityMode: true });
const engine = new PaddleOcrEngine({ policyProvider: () => editorRuntimePolicy });
const el = (id) => document.getElementById(id);
const msg = (de, en) => localText(de, en, state.language);
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
  elapsedTimer: null,
  language: getEditorLanguage()
};

el("version").textContent = `v${APP_VERSION}`;
el("languageToggle").checked = state.language === "en";
applyEditorTranslations(document, state.language);
setupEvents();
loadRepositoryConfig();
initializeEngine().catch(() => undefined);

function setupEvents() {
  el("languageToggle").addEventListener("change", () => {
    state.language = setEditorLanguage(el("languageToggle").checked ? "en" : "de");
    applyEditorTranslations(document, state.language);
    renderProfileList();
    renderProfileMeta();
    renderAssignments();
    renderProperties();
    renderSelectionInfo();
    renderAssignmentToolbar();
    refreshMasterControls();
  });

  el("configInput").addEventListener("change", importConfig);
  el("exportConfigButton").onclick = exportConfig;
  el("newProfileButton").onclick = newProfile;
  el("duplicateProfileButton").onclick = duplicateProfile;
  el("deleteProfileButton").onclick = deleteProfile;
  el("profileSelect").addEventListener("change", () => selectProfile(el("profileSelect").value));

  for (const id of [
    "profileId", "profileName", "profileRole", "profileActive", "profileSourceType",
    "anchorAliases", "anchorLocalizeAlias", "anchorScaleFrom", "anchorAlignFrom",
    "detectionEvidenceAliases", "detectionMinEvidenceMatches", "detectionExcludeAliases", "detectionMinScore",
    "validationMinAnchorScore", "validationErrorMessage"
  ]) {
    const node = el(id);
    const eventName = ["profileActive", "profileSourceType", "anchorLocalizeAlias", "anchorScaleFrom", "anchorAlignFrom"].includes(id)
      ? "change" : "input";
    node.addEventListener(eventName, updateProfileMeta);
  }
  document.querySelectorAll("[data-required-valid-field]").forEach((node) => node.addEventListener("change", updateProfileMeta));
  el("useSelectionAsQrRegion").onclick = useSelectionAsQrRegion;
  el("testQrButton").onclick = testQrProfile;

  el("masterInput").addEventListener("change", loadMasterImage);
  el("exportOcrJsonButton").onclick = exportOcrJson;
  el("runOcrButton").onclick = runOcr;
  el("cancelOcrButton").onclick = () => cancelOcrAnalysis(false);
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
  el("assignAnchorButton").onclick = assignAnchor;
  document.querySelectorAll("[data-field]").forEach((button) => {
    button.addEventListener("click", () => assignField(button.dataset.field));
  });

  const overlay = el("editorOverlayCanvas");
  overlay.addEventListener("pointerdown", pointerDown);
  overlay.addEventListener("pointermove", pointerMove);
  overlay.addEventListener("pointerup", pointerUp);
  overlay.addEventListener("pointercancel", pointerUp);

  for (const id of [
    "fieldRegex", "fieldSourceRegex", "fieldNormalizer", "fieldDigits",
    "fieldSearchRadius", "fieldMinOverlap", "fieldPreferRightmost", "fieldPreferUnit",
    "fieldNeighborEnabled", "fieldNeighborTarget", "fieldNeighborLeft", "fieldNeighborRight",
    "fieldNeighborAbove", "fieldNeighborBelow", "fieldNeighborMaxDistance",
    "fieldStrategy", "fieldStrategyUnits", "fieldFallbackStrategy",
    "fieldPairLeftMinDigits", "fieldPairLeftMaxDigits", "fieldTailDigits", "fieldCombinedMinDigits",
    "fieldLocatorAliases", "fieldLocatorDirection", "fieldLocatorMaxDistance", "fieldLocatorMinAliasScore",
    "fieldLocatorStrict", "fieldLocatorPreferRightmost", "fieldLocatorPreferLeftmost",
    "fieldLocatorPreferUnit", "fieldLocatorPreferBatch", "fieldRequired", "fieldCompare"
  ]) {
    const checkboxIds = new Set([
      "fieldPreferRightmost", "fieldPreferUnit", "fieldNeighborEnabled", "fieldNeighborLeft",
      "fieldNeighborRight", "fieldNeighborAbove", "fieldNeighborBelow", "fieldLocatorStrict",
      "fieldLocatorPreferRightmost", "fieldLocatorPreferLeftmost", "fieldLocatorPreferUnit",
      "fieldLocatorPreferBatch", "fieldRequired", "fieldCompare"
    ]);
    const changeIds = new Set([
      "fieldNormalizer", "fieldNeighborTarget", "fieldStrategy", "fieldFallbackStrategy", "fieldLocatorDirection"
    ]);
    el(id).addEventListener(checkboxIds.has(id) || changeIds.has(id) ? "change" : "input", updateFieldProperties);
  }

  // RegEx-Status bewusst zusätzlich direkt an die beiden Textfelder binden:
  // jede Eingabe wird sofort neu geprüft und visualisiert.
  el("fieldRegex").addEventListener("input", renderRegexStatus);
  el("fieldSourceRegex").addEventListener("input", renderRegexStatus);

  el("deleteAssignmentButton").onclick = deleteSelectedAssignment;
  window.addEventListener("beforeunload", (event) => {
    if (!state.dirty) return;
    event.preventDefault();
  });
}
async function loadRepositoryConfig(confirmReplace = false) {
  if (confirmReplace && state.dirty && !confirm(msg("Nicht exportierte Änderungen verwerfen und Repository-Konfiguration neu laden?", "Discard unexported changes and reload the repository configuration?"))) return;
  setConfigStatus(msg("Konfiguration wird geladen …", "Loading configuration …"), "wait");
  try {
    const response = await fetch(new URL(`./config/label-profiles.json?t=${Date.now()}`, window.location.href), { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.config = normalizeProfileConfig(await response.json());
    state.sessions.clear();
    state.dirty = false;
    const preferred = storedSelectedProfileId();
    const first = state.config.profiles.some((profile) => profile.id === preferred)
      ? preferred
      : (state.config.profiles[0]?.id || "");
    renderProfileList();
    selectProfile(first);
    setConfigStatus(msg(`${state.config.profiles.length} Profile geladen`, `${state.config.profiles.length} profiles loaded`), "ok");
  } catch (error) {
    setConfigStatus(msg(`Konfiguration konnte nicht geladen werden: ${safeError(error)}`, `Configuration could not be loaded: ${safeError(error)}`), "bad");
  }
}

async function importConfig(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    state.config = normalizeProfileConfig(JSON.parse(await file.text()));
    state.sessions.clear();
    state.dirty = true;
    renderProfileList();
    const preferred = storedSelectedProfileId();
    selectProfile(state.config.profiles.some((profile) => profile.id === preferred) ? preferred : (state.config.profiles[0]?.id || ""));
    setConfigStatus(msg(`${state.config.profiles.length} Profile importiert – noch nicht exportiert`, `${state.config.profiles.length} profiles imported – not exported yet`), "warn");
  } catch (error) {
    setConfigStatus(msg(`JSON-Import fehlgeschlagen: ${safeError(error)}`, `JSON import failed: ${safeError(error)}`), "bad");
  }
}

function exportConfig() {
  syncProfileMeta();
  const exportable = normalizeProfileConfig({
    ...state.config,
    schemaVersion: PROFILE_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString()
  }, APP_VERSION);
  const warnings = validateConfig(exportable);
  if (warnings.length && !confirm(msg(`Die Konfiguration enthält Hinweise:\n\n${warnings.join("\n")}\n\nTrotzdem exportieren?`, `The configuration contains warnings:\n\n${warnings.join("\n")}\n\nExport anyway?`))) return;
  download(JSON.stringify(exportable, null, 2), "label-profiles.json", "application/json");
  state.config = exportable;
  state.dirty = false;
  renderProfileList();
  renderProfileMeta();
  setConfigStatus(msg(`${state.config.profiles.length} Profile exportiert`, `${state.config.profiles.length} profiles exported`), "ok");
}

function validateConfig(config) {
  const warnings = [];
  const activeProducts = config.profiles.filter((profile) => profile.active !== false && profile.role === "product");
  if (!activeProducts.length) warnings.push("Kein aktives Produktprofil vorhanden.");

  for (const profile of config.profiles) {
    if (!profile.id) warnings.push("Ein Profil besitzt keine ID.");
    const qrProfile = profile.source?.type === "qr";

    if (!qrProfile) {
      if (!profile.anchor?.aliases?.length) warnings.push(`${profile.name}: keine Anker-Aliase.`);
      if ((profile.anchor?.poly || []).length < 4) warnings.push(`${profile.name}: kein Ankerbereich.`);
    } else {
      const regions = profile.source?.regions || [];
      if (!regions.length) warnings.push(`${profile.name}: kein QR-Suchbereich.`);
      const parser = profile.source?.parser || {};
      if (!Object.keys(parser.fields || {}).length) warnings.push(`${profile.name}: keine QR-Feldregeln.`);
      for (const key of parser.requiredFields || []) {
        if (!parser.fields?.[key]) warnings.push(`${profile.name}: QR-Pflichtfeld ${key} besitzt keine Parserregel.`);
      }
      for (const [key, rule] of Object.entries(parser.fields || {})) {
        const primary = validateRegex(rule.primaryRegex);
        const secondary = validateRegex(rule.secondaryRegex);
        if (!primary.valid) warnings.push(`${profile.name}/QR ${key}: ungültiger Primär-RegEx.`);
        if (!secondary.valid) warnings.push(`${profile.name}/QR ${key}: ungültiger Sekundär-RegEx.`);
        if (!String(rule.primaryRegex || "").trim()) warnings.push(`${profile.name}/QR ${key}: Primär-RegEx fehlt.`);
      }
    }

    for (const key of profile.validation?.requiredValidFields || []) {
      if (!findField(profile, key)) warnings.push(`${profile.name}: Validierungs-Pflichtfeld ${key} ist nicht angelegt.`);
    }

    for (const field of profile.fields || []) {
      const finalRegex = validateRegex(field.regex);
      const sourceRegex = validateRegex(field.sourceRegex);
      if (!finalRegex.valid) warnings.push(`${profile.name}/${field.label}: ungültiger Ergebnis-RegEx.`);
      if (!sourceRegex.valid) warnings.push(`${profile.name}/${field.label}: ungültiger Rohtext-RegEx.`);
      if (!qrProfile && (field.poly || []).length < 4) warnings.push(`${profile.name}/${field.label}: keine Feldzone.`);
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
  if (!current || !confirm(msg(`Profil „${current.name}“ wirklich löschen?`, `Really delete profile “${current.name}”?`))) return;
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
    const option = new Option(`${profile.role === "product" ? uiText("productLabel", state.language) : uiText("vdaLabel", state.language)} · ${profile.name}`, profile.id);
    select.append(option);
  }
  select.value = selected;
  el("profileCount").textContent = String(state.config.profiles.length);
}

function selectProfile(id) {
  syncProfileMeta();
  if (state.ocrRun && state.ocrRun.profileId !== id) cancelOcrAnalysis(true);
  state.selectedProfileId = id;
  storeSelectedProfileId(id);
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
  const ids = [
    "profileId", "profileName", "profileRole", "profileActive", "profileSourceType",
    "anchorAliases", "anchorLocalizeAlias", "anchorScaleFrom", "anchorAlignFrom",
    "detectionEvidenceAliases", "detectionMinEvidenceMatches", "detectionExcludeAliases", "detectionMinScore",
    "validationMinAnchorScore", "validationErrorMessage"
  ];
  for (const id of ids) el(id).disabled = disabled;
  document.querySelectorAll("[data-required-valid-field]").forEach((node) => { node.disabled = disabled; });

  el("profileId").value = profile?.id || "";
  el("profileName").value = profile?.name || "";
  el("profileRole").value = profile?.role || "vda";
  el("profileActive").checked = profile?.active !== false;
  el("profileSourceType").value = profile?.source?.type === "qr" ? "qr" : "ocr";

  el("anchorAliases").value = (profile?.anchor?.aliases || []).join("\n");
  el("anchorLocalizeAlias").checked = profile?.anchor?.localizeAlias === true;
  el("anchorScaleFrom").value = profile?.anchor?.scaleFrom === "height" ? "height" : "width";
  el("anchorAlignFrom").value = profile?.anchor?.alignFrom === "left" ? "left" : "center";
  el("detectionEvidenceAliases").value = (profile?.detection?.evidenceAliases || []).join("\n");
  el("detectionMinEvidenceMatches").value = Number(profile?.detection?.minEvidenceMatches || 0);
  el("detectionExcludeAliases").value = (profile?.detection?.excludeAliases || []).join("\n");
  el("detectionMinScore").value = Number(profile?.detection?.minScore ?? 0.55);
  el("validationMinAnchorScore").value = Number(profile?.validation?.minAnchorScore ?? 0.55);
  el("validationErrorMessage").value = profile?.validation?.errorMessage || "";
  const required = new Set(profile?.validation?.requiredValidFields || []);
  document.querySelectorAll("[data-required-valid-field]").forEach((node) => {
    node.checked = required.has(node.dataset.requiredValidField);
  });

  const qr = profile?.source?.type === "qr";
  el("ocrProfileSettings").classList.toggle("hidden", qr);
  el("qrProfileSettings").classList.toggle("hidden", !qr);
  renderQrSettings(profile);
  applyEditorTranslations(document, state.language);
  refreshMasterControls();
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

  const wantedSource = el("profileSourceType").value === "qr" ? "qr" : "ocr";
  if (wantedSource === "qr" && profile.source?.type !== "qr") {
    profile.source = {
      type: "qr",
      regions: [{ x: 0, y: 0, width: 1, height: 1 }],
      parser: { requiredFields: [], fields: {} }
    };
  } else if (wantedSource === "ocr" && profile.source?.type !== "ocr") {
    profile.source = { type: "ocr" };
  }

  profile.anchor.aliases = readLines(el("anchorAliases").value);
  profile.anchor.localizeAlias = el("anchorLocalizeAlias").checked;
  profile.anchor.scaleFrom = el("anchorScaleFrom").value === "height" ? "height" : "width";
  profile.anchor.alignFrom = el("anchorAlignFrom").value === "left" ? "left" : "center";
  profile.detection = profile.detection || {};
  profile.detection.evidenceAliases = readLines(el("detectionEvidenceAliases").value);
  profile.detection.minEvidenceMatches = Math.max(0, Math.floor(Number(el("detectionMinEvidenceMatches").value || 0)));
  profile.detection.excludeAliases = readLines(el("detectionExcludeAliases").value);
  profile.detection.minScore = clamp01Number(el("detectionMinScore").value, 0.55);

  profile.validation = profile.validation || {};
  profile.validation.minAnchorScore = clamp01Number(el("validationMinAnchorScore").value, 0.55);
  profile.validation.requiredValidFields = Array.from(document.querySelectorAll("[data-required-valid-field]:checked"))
    .map((node) => node.dataset.requiredValidField);
  profile.validation.errorMessage = el("validationErrorMessage").value.trim();

  if (profile.id !== previousId) {
    state.sessions.rename(previousId, profile.id);
    renameEditorMaster(previousId, profile.id).catch(() => undefined);
    state.selectedProfileId = profile.id;
  }
  markDirty();
  renderProfileList();
  renderAssignments();

  const qr = profile.source?.type === "qr";
  el("ocrProfileSettings").classList.toggle("hidden", qr);
  el("qrProfileSettings").classList.toggle("hidden", !qr);
  renderQrSettings(profile);
  drawOverlay();
}


function renderQrSettings(profile) {
  const regionContainer = el("qrRegionInputs");
  const rulesContainer = el("qrRules");
  if (!regionContainer || !rulesContainer) return;
  regionContainer.replaceChildren();
  rulesContainer.replaceChildren();
  if (!profile || profile.source?.type !== "qr") {
    el("qrTestResult").textContent = "";
    return;
  }

  const source = ensureQrSource(profile);
  const regions = Array.isArray(source.regions) ? source.regions : [];
  for (let index = 0; index < 2; index += 1) {
    const region = regions[index] || (index === 0 ? { x: 0, y: 0, width: 1, height: 1 } : null);
    const card = document.createElement("div");
    card.className = "qr-region-card";
    card.innerHTML = `<strong>${uiText(index === 0 ? "primaryQrRegion" : "fallbackQrRegion", state.language)}</strong><div class="mini-grid"></div>`;
    const grid = card.querySelector(".mini-grid");
    for (const prop of ["x", "y", "width", "height"]) {
      const label = document.createElement("label");
      label.dataset.helpKey = "qrRegions";
      const caption = document.createElement("span");
      caption.textContent = ({ x: "X", y: "Y", width: uiText("width", state.language), height: uiText("height", state.language) })[prop];
      label.append(caption);
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.max = "1";
      input.step = "0.01";
      input.dataset.qrRegion = String(index);
      input.dataset.qrRegionProp = prop;
      input.value = region ? String(Number(region[prop] ?? (prop === "width" || prop === "height" ? 1 : 0))) : "";
      input.placeholder = index === 1 ? localText("optional", "optional", state.language) : "0";
      input.addEventListener("input", updateQrRegionsFromDom);
      label.append(input);
      grid.append(label);
    }
    regionContainer.append(card);
  }

  const labels = {
    batch: uiText("batch", state.language),
    drum_number: uiText("drum", state.language),
    idh: uiText("idh", state.language),
    weight: uiText("weight", state.language),
    delivery_note: uiText("deliveryNote", state.language)
  };
  const required = new Set(source.parser.requiredFields || []);

  for (const key of FIELD_ORDER) {
    const rule = source.parser.fields?.[key] || null;
    const enabled = Boolean(rule || findField(profile, key));
    const card = document.createElement("div");
    card.className = "qr-rule-card";
    card.dataset.qrKey = key;
    card.innerHTML = `
      <h4>${labels[key] || key}</h4>
      <label class="checkbox-row" data-help-key="qrReadField"><input type="checkbox" data-qr-enabled ${enabled ? "checked" : ""}><span>${uiText("qrReadField", state.language)}</span></label>
      <label class="checkbox-row" data-help-key="qrRequired"><input type="checkbox" data-qr-required ${required.has(key) ? "checked" : ""} ${enabled ? "" : "disabled"}><span>${uiText("qrRequired", state.language)}</span></label>
      <label data-help-key="primaryRegex"><span>${uiText("primaryRegex", state.language)}</span><input type="text" spellcheck="false" data-qr-rule="primaryRegex"></label>
      <div class="mini-grid">
        <label data-help-key="captureGroup"><span>${uiText("captureGroup", state.language)}</span><input type="number" min="0" max="20" step="1" data-qr-rule="primaryGroup"></label>
        <label data-help-key="template"><span>${uiText("template", state.language)}</span><input type="text" spellcheck="false" data-qr-rule="template" placeholder="{primary}"></label>
      </div>
      <label data-help-key="secondaryRegex"><span>${uiText("secondaryRegex", state.language)}</span><input type="text" spellcheck="false" data-qr-rule="secondaryRegex"></label>
      <div class="mini-grid">
        <label data-help-key="secondaryGroup"><span>${uiText("secondaryGroup", state.language)}</span><input type="number" min="0" max="20" step="1" data-qr-rule="secondaryGroup"></label>
        <label data-help-key="secondaryDefault"><span>${uiText("secondaryDefault", state.language)}</span><input type="text" data-qr-rule="secondaryDefault"></label>
      </div>
      <label data-help-key="replacements"><span>${uiText("replacements", state.language)}</span><textarea rows="2" data-qr-rule="replacements" placeholder="KGM => KG"></textarea></label>
      <button type="button" data-open-qr-field>${uiText("openFieldProperties", state.language)}</button>
    `;

    const effective = rule || {
      primaryRegex: "",
      primaryGroup: 1,
      secondaryRegex: "",
      secondaryGroup: 1,
      secondaryDefault: "",
      template: "{primary}",
      replacements: []
    };
    card.querySelector('[data-qr-rule="primaryRegex"]').value = effective.primaryRegex || "";
    card.querySelector('[data-qr-rule="primaryGroup"]').value = Number(effective.primaryGroup ?? 1);
    card.querySelector('[data-qr-rule="secondaryRegex"]').value = effective.secondaryRegex || "";
    card.querySelector('[data-qr-rule="secondaryGroup"]').value = Number(effective.secondaryGroup ?? 1);
    card.querySelector('[data-qr-rule="secondaryDefault"]').value = effective.secondaryDefault || "";
    card.querySelector('[data-qr-rule="template"]').value = effective.template || "{primary}";
    card.querySelector('[data-qr-rule="replacements"]').value = (effective.replacements || [])
      .map((entry) => `${entry.from} => ${entry.to}`)
      .join("\n");

    card.querySelectorAll("input,textarea").forEach((node) => {
      if (node.matches("[data-qr-enabled], [data-qr-required]")) node.addEventListener("change", updateQrRulesFromDom);
      else node.addEventListener("input", updateQrRulesFromDom);
    });
    card.querySelector("[data-open-qr-field]").onclick = () => {
      const current = selectedProfile();
      if (!findField(current, key)) {
        upsertField(current, createField(key));
        updateQrRulesFromDom();
      }
      selectAssignment("field", key);
    };
    rulesContainer.append(card);
  }

  applyEditorTranslations(document, state.language);
}
function updateQrRegionsFromDom() {
  const profile = selectedProfile();
  if (!profile || profile.source?.type !== "qr") return;
  const source = ensureQrSource(profile);
  const regions = [];
  for (let index = 0; index < 2; index += 1) {
    const values = {};
    let hasAny = false;
    for (const prop of ["x", "y", "width", "height"]) {
      const node = document.querySelector(`[data-qr-region="${index}"][data-qr-region-prop="${prop}"]`);
      const raw = String(node?.value || "").trim();
      if (raw !== "") hasAny = true;
      values[prop] = raw === "" ? NaN : Number(raw);
    }
    if (!hasAny) continue;
    const x = clamp01Number(values.x, 0);
    const y = clamp01Number(values.y, 0);
    const width = Math.max(0.01, Math.min(1 - x, Number.isFinite(values.width) ? values.width : 1));
    const height = Math.max(0.01, Math.min(1 - y, Number.isFinite(values.height) ? values.height : 1));
    regions.push({ x, y, width, height });
  }
  source.regions = regions.length ? regions : [{ x: 0, y: 0, width: 1, height: 1 }];
  markDirty();
  drawOverlay();
}

function updateQrRulesFromDom() {
  const profile = selectedProfile();
  if (!profile || profile.source?.type !== "qr") return;
  const source = ensureQrSource(profile);
  const fields = {};
  const required = [];

  for (const card of el("qrRules").querySelectorAll("[data-qr-key]")) {
    const key = card.dataset.qrKey;
    const enabled = card.querySelector("[data-qr-enabled]")?.checked === true;
    const requiredChecked = card.querySelector("[data-qr-required]")?.checked === true;
    if (!enabled) {
      profile.fields = (profile.fields || []).filter((field) => field.key !== key);
      continue;
    }
    if (!findField(profile, key)) upsertField(profile, createField(key));
    if (requiredChecked) required.push(key);
    fields[key] = {
      primaryRegex: card.querySelector('[data-qr-rule="primaryRegex"]').value.trim(),
      primaryGroup: Math.max(0, Math.floor(Number(card.querySelector('[data-qr-rule="primaryGroup"]').value || 1))),
      secondaryRegex: card.querySelector('[data-qr-rule="secondaryRegex"]').value.trim(),
      secondaryGroup: Math.max(0, Math.floor(Number(card.querySelector('[data-qr-rule="secondaryGroup"]').value || 1))),
      secondaryDefault: card.querySelector('[data-qr-rule="secondaryDefault"]').value.trim(),
      template: card.querySelector('[data-qr-rule="template"]').value || "{primary}",
      replacements: parseReplacementLines(card.querySelector('[data-qr-rule="replacements"]').value)
    };
  }

  source.parser.fields = fields;
  source.parser.requiredFields = required;
  markDirty();
  renderAssignments();
}

function useSelectionAsQrRegion() {
  const profile = selectedProfile();
  const session = currentSession(false);
  if (!profile || profile.source?.type !== "qr") return;
  if (!session?.selection?.poly?.length) {
    alert(msg("Zuerst im Masterbild einen erkannten Bereich auswählen oder im Modus „Freie Zone zeichnen“ einen QR-Suchbereich markieren.", "First select a recognized area in the master image or mark a QR search region in Draw free zone mode."));
    return;
  }
  const source = ensureQrSource(profile);
  const rect = polyToRect(session.selection.poly);
  source.regions = [rect, ...(source.regions || []).slice(1, 2)];
  session.selection = null;
  markDirty();
  renderQrSettings(profile);
  renderSelectionInfo();
  drawOverlay();
}

async function testQrProfile() {
  const profile = selectedProfile();
  const session = currentSession(false);
  const status = el("qrTestResult");
  if (!profile || profile.source?.type !== "qr") return;
  if (!session?.prepared?.canvas) {
    status.textContent = msg("Bitte zuerst ein Masterbild mit QR-Code laden.", "Please load a master image containing a QR code first.");
    status.className = "regex-status bad";
    return;
  }
  updateQrRegionsFromDom();
  updateQrRulesFromDom();
  const match = detectQrProfile(session.prepared.canvas, [profile], profile.role);
  if (!match) {
    status.textContent = msg("Kein QR-Code passend zu diesen Regeln erkannt.", "No QR code matching these rules was detected.");
    status.className = "regex-status bad";
    return;
  }
  status.textContent = msg(`QR erfolgreich: ${Object.entries(match.parsed.fields || {}).map(([key, value]) => `${key}=${value}`).join(" · ")}`, `QR successful: ${Object.entries(match.parsed.fields || {}).map(([key, value]) => `${key}=${value}`).join(" · ")}`);
  status.className = "regex-status ok";
}

function ensureQrSource(profile) {
  if (profile.source?.type !== "qr") {
    profile.source = { type: "qr", regions: [{ x: 0, y: 0, width: 1, height: 1 }], parser: { requiredFields: [], fields: {} } };
  }
  if (!Array.isArray(profile.source.regions)) profile.source.regions = [{ x: 0, y: 0, width: 1, height: 1 }];
  if (!profile.source.parser || typeof profile.source.parser !== "object") profile.source.parser = { requiredFields: [], fields: {} };
  if (!Array.isArray(profile.source.parser.requiredFields)) profile.source.parser.requiredFields = [];
  if (!profile.source.parser.fields || typeof profile.source.parser.fields !== "object") profile.source.parser.fields = {};
  return profile.source;
}

function parseReplacementLines(value) {
  return readLines(value).map((line) => {
    const [from, ...rest] = line.split(/\s*=>\s*/);
    return { from: String(from || "").trim(), to: rest.join(" => ").trim() };
  }).filter((entry) => entry.from);
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
  setEditorEngine(msg("Erkennung wird vorbereitet …", "Preparing recognition …"), "wait");
  try {
    const info = await engine.initialize(
      "standard",
      (message) => setEditorEngine(message, "wait"),
      force
    );
    setEditorEngine(msg(`Erkennung bereit · ${info.mode}`, `Recognition ready · ${info.mode}`), "ok");
    el("editorEngineDetails").textContent = msg(`Stabiler Analysemodus · Initialisierung ${formatMilliseconds(info.initMs)} · ${formatRuntimeDetails(info.summary, null, editorRuntimePolicy)}`, `Stable analysis mode · initialization ${formatMilliseconds(info.initMs)} · ${formatRuntimeDetails(info.summary, null, editorRuntimePolicy)}`);
    return true;
  } catch (error) {
    setEditorEngine(msg(`Erkennung nicht bereit: ${safeError(error)}`, `Recognition not ready: ${safeError(error)}`), "bad");
    el("editorEngineDetails").textContent = msg("Der Editor verwendet einen stabilen Analysemodus, damit große Masterbilder den Browser nicht neu starten. Die Scanner-Performance bleibt davon unberührt.", "The editor uses a stable analysis mode so large master images do not restart the browser. Scanner performance is unaffected.");
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
    el("editorHint").textContent = msg(`Masterbild „${file.name}“ ist nur diesem Profil zugeordnet. Bildanalyse starten oder freie Zonen zeichnen.`, `Master image “${file.name}” is assigned only to this profile. Start image analysis or draw free zones.`);
  } catch (error) {
    el("editorHint").textContent = msg(`Masterbild konnte nicht geladen werden: ${safeError(error)}`, `Master image could not be loaded: ${safeError(error)}`);
  }
}

function exportOcrJson() {
  const profile = selectedProfile();
  const session = currentSession(false);
  if (!profile || !session?.ocrResult) return;
  const filename = `ocr-${safeProfileId(profile.id || profile.role || "label").toLowerCase()}.json`;
  download(JSON.stringify(session.ocrResult, null, 2), filename, "application/json");
  setEditorEngine(`Analyseergebnis exportiert · ${session.ocrResult.items?.length || 0} Textzeilen`, "ok");
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
  setEditorEngine(msg("Masterbild wird analysiert …", "Master image is being analyzed …"), "wait");
  startElapsedDisplay(run, session);

  try {
    // Der Editor benötigt nur anklickbare Textboxen. Dafür wird eine separate,
    // kleinere OCR-Kopie verwendet; das hochauflösende Masterbild bleibt für
    // die genaue Zonenbearbeitung unverändert erhalten.
    await nextEditorPaint();
    const ocrInput = createOcrInputCanvas(session.prepared.canvas, EDITOR_OCR_MAX_SIDE);
    const output = await engine.predict(
      ocrInput.canvas,
      {
        textDetLimitSideLen: EDITOR_OCR_MAX_SIDE,
        textDetLimitType: "max",
        textDetMaxSideLimit: EDITOR_OCR_MAX_SIDE,
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
      setEditorEngine(msg(`Analyse abgeschlossen · ${result.items?.length || 0} Textzeilen`, `Analysis complete · ${result.items?.length || 0} text lines`), "ok");
      el("editorEngineDetails").textContent = [
        msg(`Gesamt ${formatMilliseconds(output.wallMs)}`, `Total ${formatMilliseconds(output.wallMs)}`),
        Number.isFinite(metrics.detMs) ? msg(`Detektion ${formatMilliseconds(metrics.detMs)}`, `Detection ${formatMilliseconds(metrics.detMs)}`) : "",
        Number.isFinite(metrics.recMs) ? msg(`Erkennung ${formatMilliseconds(metrics.recMs)}`, `Recognition ${formatMilliseconds(metrics.recMs)}`) : "",
        formatRuntimeDetails(engine.summary, output.runtime, editorRuntimePolicy),
        msg(`Analysebild ${ocrInput.width} × ${ocrInput.height} px`, `Analysis image ${ocrInput.width} × ${ocrInput.height} px`)
      ].filter(Boolean).join(" · ");
      drawOverlay();
      renderSelectionInfo();
    }
  } catch (error) {
    if (run.cancelled) {
      setEditorEngine(msg("Analyse verworfen", "Analysis discarded"), "warn");
      el("editorEngineDetails").textContent = msg("Das Ergebnis wird nicht übernommen.", "The result will not be applied.");
    } else {
      setEditorEngine(msg(`Analyse fehlgeschlagen: ${safeError(error)}`, `Analysis failed: ${safeError(error)}`), "bad");
      el("editorEngineDetails").textContent = localText("Die Erkennung wurde beendet. Beim nächsten Start wird sie automatisch neu initialisiert.", "Recognition was stopped. It will be initialized automatically on the next run.", state.language);
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
    setEditorEngine(msg("Analyse wird beendet …", "Stopping analysis …"), "warn");
    el("editorEngineDetails").textContent = localText("Der laufende Worker wird vollständig beendet.", "The running worker is being stopped completely.", state.language);
  }
  try {
    await engine.abortCurrent();
    if (!silent) {
      setEditorEngine(localText("Analyse abgebrochen", "Analysis cancelled", state.language), "warn");
      el("editorEngineDetails").textContent = localText("Die Erkennung ist beendet. Beim nächsten Analysestart wird sie automatisch neu initialisiert.", "Recognition has stopped. It will be initialized automatically on the next analysis run.", state.language);
    }
  } catch (error) {
    if (!silent) setEditorEngine(msg(`Worker konnte nicht sauber beendet werden: ${safeError(error)}`, `Worker could not be stopped cleanly: ${safeError(error)}`), "bad");
  }
}

function startElapsedDisplay(run, session) {
  stopElapsedDisplay();
  const startedAt = performance.now();
  const update = () => {
    if (!isRunActive(run)) return;
    const seconds = Math.max(0, Math.round((performance.now() - startedAt) / 1000));
    el("editorEngineDetails").textContent = msg(`Bild ${session.prepared.width} × ${session.prepared.height} px · automatisches Backend läuft seit ${seconds} s.`, `Image ${session.prepared.width} × ${session.prepared.height} px · automatic backend running for ${seconds} s.`);
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
  el("editorHint").textContent = msg("Für dieses Profil ist kein Masterbild geladen.", "No master image is loaded for this profile.");
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
      el("editorHint").textContent = msg(`Masterbild „${session.masterFileName}“ lokal aus dem Browser wiederhergestellt${session.ocrResult ? " · erkannte Bereiche ebenfalls geladen" : ""}.`, `Master image “${session.masterFileName}” restored locally from the browser${session.ocrResult ? " · recognized areas restored too" : ""}.`);
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
  el("exportOcrJsonButton").disabled = running || !session?.ocrResult;
  el("cancelOcrButton").disabled = !running;
  el("clearMasterButton").disabled = running || !session?.prepared;

  if (!session?.prepared) {
    el("editorHint").textContent = localText(
      "Für dieses Profil ein eigenes Masterbild laden. Danach die Bildanalyse starten oder direkt eine freie Zone zeichnen.",
      "Load a master image for this profile. Then start image analysis or draw a free zone directly.",
      state.language
    );
  } else if (!running) {
    const suffix = session.ocrResult
      ? localText(` · ${session.ocrResult.items?.length || 0} erkannte Textzeilen vorhanden`, ` · ${session.ocrResult.items?.length || 0} recognized text lines available`, state.language)
      : "";
    el("editorHint").textContent = localText(
      `Masterbild „${session.masterFileName || "ohne Dateiname"}“ gehört nur zu diesem Profil${suffix}.`,
      `Master image “${session.masterFileName || "unnamed"}” belongs only to this profile${suffix}.`,
      state.language
    );
  }
}

function setMode(mode) {
  state.mode = mode;
  state.drag = null;
  for (const [buttonId, value] of [["selectModeButton", "select"], ["drawModeButton", "draw"], ["editModeButton", "edit"]]) {
    el(buttonId).classList.toggle("active-mode", value === mode);
  }
  el("editorHint").textContent = {
    select: localText("Klicke auf einen erkannten Bereich und ordne ihn anschließend als Anker oder Feld zu.", "Click a recognized area and then assign it as an anchor or field.", state.language),
    draw: localText("Ziehe mit gedrückter Maustaste eine Zone um den gewünschten Wert.", "Drag a zone around the desired value.", state.language),
    edit: localText("Wähle eine bestehende Zuordnung. Innen ziehen verschiebt sie; Eckpunkte ändern die Größe.", "Select an existing assignment. Drag inside to move it; use corners to resize it.", state.language)
  }[mode];
  drawOverlay();
}

function pointerDown(event) {
  const session = currentSession(false);
  if (!session?.prepared) return;
  const point = pointerToNormalized(event, el("editorOverlayCanvas"));
  if (state.mode === "select") {
    const assigned = findAssignmentAt(point);
    if (assigned) {
      selectAssignment(assigned.type, assigned.key);
      return;
    }
    const item = findOcrItem(point);
    session.selection = item ? {
      poly: polyFromPixelPoly(item.poly, session.prepared.width, session.prepared.height),
      text: item.text,
      score: Number(item.score || 0),
      source: "ocr"
    } : null;
    state.selectedAssignment = null;
    renderAssignments();
    renderSelectionInfo();
    renderProperties();
    renderAssignmentToolbar();
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
  if (!profile || !session?.selection?.poly?.length) return alert(msg("Zuerst einen erkannten Bereich auswählen oder eine freie Zone zeichnen.", "First select a recognized area or draw a free zone."));
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
  if (!profile || !session?.selection?.poly?.length) return alert(msg("Zuerst einen erkannten Bereich auswählen oder eine freie Zone zeichnen.", "First select a recognized area or draw a free zone."));
  const existing = findField(profile, key);
  const field = existing || createField(key);
  const padding = session.selection.source === "ocr" ? FIELD_ZONE_PADDING : 0;
  field.poly = padding ? expandPoly(session.selection.poly, padding) : session.selection.poly;
  upsertField(profile, field);
  state.selectedAssignment = { type: "field", key };
  session.selection = null;
  markDirty();
  setMode("edit");
  renderAssignments();
  renderProperties();
}

function renderAssignments() {
  const profile = selectedProfile();
  const container = el("assignmentList");
  container.replaceChildren();
  if (!profile) return;
  const entries = [];
  if ((profile.anchor?.poly || []).length) entries.push({ type: "anchor", key: "anchor", label: uiText("anchorButton", state.language), value: profile.anchor });
  for (const field of profile.fields || []) entries.push({ type: "field", key: field.key, label: field.label, value: field });
  if (!entries.length) {
    container.innerHTML = `<p class="muted">${escapeHtml(msg("Noch keine Zuordnungen.", "No assignments yet."))}</p>`;
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
  renderAssignmentToolbar();
}

function renderAssignmentToolbar() {
  document.querySelectorAll("[data-assignment-button]").forEach((button) => {
    const key = button.dataset.assignmentButton;
    const selected = state.selectedAssignment?.type === "anchor"
      ? key === "anchor"
      : state.selectedAssignment?.type === "field" && key === state.selectedAssignment.key;
    button.classList.toggle("active-assignment", selected);
  });
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
  el("selectedAssignmentName").textContent = assignment?.label || uiText("noAssignment", state.language);
  renderAssignmentToolbar();

  if (!assignment) {
    el("anchorProperties").classList.remove("hidden");
    el("anchorProperties").textContent = uiText("chooseAssignment", state.language);
    el("fieldProperties").classList.add("hidden");
    return;
  }

  if (assignment.type === "anchor") {
    el("anchorProperties").classList.remove("hidden");
    el("anchorProperties").textContent = localText(
      "Der Anker wird über die Alias-Texte identifiziert. Position und Größe kannst du im Bearbeitungsmodus direkt im Bild ändern; die zugehörigen Ankerparameter stehen links.",
      "The anchor is identified by its aliases. Position and size can be changed directly on the image in edit mode; the related anchor settings are on the left.",
      state.language
    );
    el("fieldProperties").classList.add("hidden");
    return;
  }

  const field = assignment.value;
  el("anchorProperties").classList.add("hidden");
  el("fieldProperties").classList.remove("hidden");

  populateFieldNormalizerOptions(field);
  populateFieldStrategyOptions(field);
  populateNeighborTargetOptions(field);

  el("fieldRegex").value = field.regex || "";
  el("fieldSourceRegex").value = field.sourceRegex || field.regex || "";
  el("fieldNormalizer").value = field.normalizer || defaultUiNormalizer(field.key);
  el("fieldDigits").value = Number(field.digits || 4);
  el("fieldSearchRadius").value = field.searchRadius == null ? "" : Number(field.searchRadius);
  el("fieldMinOverlap").value = field.minOverlap == null ? "" : Number(field.minOverlap);
  el("fieldPreferRightmost").checked = field.preferRightmost === true;
  el("fieldPreferUnit").checked = field.preferUnit === true;

  const neighbor = normalizedEditorNeighbor(field);
  el("fieldNeighborEnabled").checked = Boolean(neighbor);
  el("fieldNeighborTarget").value = neighbor?.field || "";
  el("fieldNeighborLeft").checked = neighbor?.directions?.includes("left") === true;
  el("fieldNeighborRight").checked = neighbor?.directions?.includes("right") === true;
  el("fieldNeighborAbove").checked = neighbor?.directions?.includes("above") === true;
  el("fieldNeighborBelow").checked = neighbor?.directions?.includes("below") === true;
  el("fieldNeighborMaxDistance").value = Number(neighbor?.maxDistance || 6);

  el("fieldStrategy").value = field.strategy || "";
  el("fieldStrategyUnits").value = (field.strategyUnits || []).join(", ");
  el("fieldFallbackStrategy").value = field.fallbackStrategy || "";
  el("fieldPairLeftMinDigits").value = field.pairLeftMinDigits == null ? "" : Number(field.pairLeftMinDigits);
  el("fieldPairLeftMaxDigits").value = field.pairLeftMaxDigits == null ? "" : Number(field.pairLeftMaxDigits);
  el("fieldTailDigits").value = field.tailDigits == null ? "" : Number(field.tailDigits);
  el("fieldCombinedMinDigits").value = field.combinedMinDigits == null ? "" : Number(field.combinedMinDigits);

  const locator = field.locator || {};
  el("fieldLocatorAliases").value = (locator.aliases || []).join("\n");
  el("fieldLocatorDirection").value = locator.direction || "below_or_right";
  el("fieldLocatorMaxDistance").value = Number(locator.maxDistance || 7);
  el("fieldLocatorMinAliasScore").value = Number(locator.minAliasScore ?? 0.72);
  el("fieldLocatorStrict").checked = locator.strict === true;
  el("fieldLocatorPreferRightmost").checked = locator.preferRightmost === true;
  el("fieldLocatorPreferLeftmost").checked = locator.preferLeftmost === true;
  el("fieldLocatorPreferUnit").checked = locator.preferUnit === true;
  el("fieldLocatorPreferBatch").checked = locator.preferBatch === true;

  el("fieldRequired").checked = Boolean(field.required);
  el("fieldCompare").checked = Boolean(field.compare);

  refreshFieldConditionalUi(field);
  renderRegexStatus();
  applyEditorTranslations(document, state.language);
}

function updateFieldProperties() {
  const assignment = currentAssignment();
  if (!assignment || assignment.type !== "field") return;
  const field = assignment.value;

  field.regex = el("fieldRegex").value.trim();
  field.sourceRegex = el("fieldSourceRegex").value.trim();
  field.normalizer = el("fieldNormalizer").value || defaultUiNormalizer(field.key);
  field.digits = Math.max(1, Number(el("fieldDigits").value || 4));
  field.searchRadius = optionalNumber(el("fieldSearchRadius").value);
  field.minOverlap = optionalNumber(el("fieldMinOverlap").value);
  field.preferRightmost = el("fieldPreferRightmost").checked || undefined;
  field.preferUnit = field.key === "weight" && el("fieldPreferUnit").checked ? true : undefined;

  if (el("fieldNeighborEnabled").checked) {
    const directions = [
      ["left", "fieldNeighborLeft"],
      ["right", "fieldNeighborRight"],
      ["above", "fieldNeighborAbove"],
      ["below", "fieldNeighborBelow"]
    ].filter(([, id]) => el(id).checked).map(([direction]) => direction);
    const target = el("fieldNeighborTarget").value;
    if (target && target !== field.key) {
      field.neighbor = {
        field: target,
        directions: directions.length ? directions : ["right"],
        maxDistance: Math.max(0.5, Number(el("fieldNeighborMaxDistance").value || 6))
      };
    } else {
      field.neighbor = undefined;
    }
  } else {
    field.neighbor = undefined;
  }
  delete field.adjacentTo;

  field.strategy = el("fieldStrategy").value || undefined;
  const strategyUnits = String(el("fieldStrategyUnits").value || "")
    .split(/[,;\n]/)
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  field.strategyUnits = field.key === "weight" && strategyUnits.length ? strategyUnits : undefined;
  field.fallbackStrategy = field.key === "weight" ? (el("fieldFallbackStrategy").value || undefined) : undefined;

  if (field.strategy === "numeric_pair") {
    field.pairLeftMinDigits = optionalInteger(el("fieldPairLeftMinDigits").value);
    field.pairLeftMaxDigits = optionalInteger(el("fieldPairLeftMaxDigits").value);
    field.tailDigits = optionalInteger(el("fieldTailDigits").value);
    field.combinedMinDigits = optionalInteger(el("fieldCombinedMinDigits").value);
  }

  const aliases = readLines(el("fieldLocatorAliases").value);
  if (aliases.length) {
    field.locator = {
      aliases,
      direction: el("fieldLocatorDirection").value || "below_or_right",
      maxDistance: Math.max(0.1, Number(el("fieldLocatorMaxDistance").value || 7)),
      minAliasScore: clamp01Number(el("fieldLocatorMinAliasScore").value, 0.72),
      strict: el("fieldLocatorStrict").checked,
      preferRightmost: el("fieldLocatorPreferRightmost").checked,
      preferLeftmost: el("fieldLocatorPreferLeftmost").checked,
      preferUnit: field.key === "weight" && el("fieldLocatorPreferUnit").checked,
      preferBatch: field.key === "batch" && el("fieldLocatorPreferBatch").checked
    };
  } else {
    field.locator = undefined;
  }

  field.required = el("fieldRequired").checked;
  field.compare = el("fieldCompare").checked;

  markDirty();
  renderAssignments();
  refreshFieldConditionalUi(field);
  renderRegexStatus();
  renderAssignmentToolbar();
  drawOverlay();
}

function renderRegexStatus() {
  const finalValue = String(el("fieldRegex").value || "").trim();
  const sourceValue = String(el("fieldSourceRegex").value || "").trim();
  const finalStatus = validateRegex(finalValue);
  const sourceStatus = validateRegex(sourceValue);
  const status = el("regexStatus");

  if (!finalValue && !sourceValue) {
    status.textContent = localText(
      "Keine regulären Ausdrücke hinterlegt.",
      "No regular expressions configured.",
      state.language
    );
    status.className = "regex-status warn";
    return;
  }

  const finalLabel = finalStatus.valid
    ? localText("✓ Ergebnis-RegEx gültig", "✓ Final regex valid", state.language)
    : localText("✕ Ergebnis-RegEx ungültig", "✕ Final regex invalid", state.language);
  const sourceLabel = sourceStatus.valid
    ? localText("✓ Rohtext-RegEx gültig", "✓ Raw-text regex valid", state.language)
    : localText("✕ Rohtext-RegEx ungültig", "✕ Raw-text regex invalid", state.language);

  status.textContent = `${finalLabel} · ${sourceLabel}${(!finalStatus.valid || !sourceStatus.valid) ? ` · ${finalStatus.message || sourceStatus.message || ""}` : ""}`;
  status.className = `regex-status ${finalStatus.valid && sourceStatus.valid ? "ok" : "bad"}`;
}

function populateFieldNormalizerOptions(field) {
  const select = el("fieldNormalizer");
  const options = [...(FIELD_NORMALIZER_OPTIONS[field.key] || [["text", "normalText"]])];
  const current = field.normalizer || defaultUiNormalizer(field.key);
  select.replaceChildren();
  const values = new Set(options.map(([value]) => value));
  if (current && !values.has(current)) options.unshift([current, "normalText"]);
  for (const [value, labelKey] of options) {
    const option = new Option(uiText(labelKey, state.language), value);
    select.append(option);
  }
}

function populateFieldStrategyOptions(field) {
  const select = el("fieldStrategy");
  const options = [...(FIELD_STRATEGY_OPTIONS[field.key] || [["", "strategyStandard"]])];
  const current = field.strategy || "";
  if (current && !options.some(([value]) => value === current)) options.push([current, "strategy"]);
  select.replaceChildren();
  for (const [value, labelKey] of options) select.append(new Option(uiText(labelKey, state.language), value));
}

function populateNeighborTargetOptions(field) {
  const select = el("fieldNeighborTarget");
  const current = normalizedEditorNeighbor(field)?.field || "";
  select.replaceChildren();
  select.append(new Option(localText("Bitte wählen", "Select field", state.language), ""));
  for (const key of ["batch", "drum_number", "idh", "weight"]) {
    if (key === field.key) continue;
    select.append(new Option(uiText(FIELD_UI_LABEL_KEYS[key], state.language), key));
  }
  if (current && !Array.from(select.options).some((option) => option.value === current) && current !== field.key) {
    select.append(new Option(current, current));
  }
}

function normalizedEditorNeighbor(field) {
  if (field?.neighbor?.field) {
    return {
      field: String(field.neighbor.field),
      directions: Array.isArray(field.neighbor.directions) && field.neighbor.directions.length
        ? field.neighbor.directions
        : ["right"],
      maxDistance: Number(field.neighbor.maxDistance || 6)
    };
  }
  if (field?.adjacentTo) {
    return { field: String(field.adjacentTo), directions: ["right"], maxDistance: 6 };
  }
  return null;
}

function defaultUiNormalizer(key) {
  return ({ batch: "batch", drum_number: "last_digits", idh: "digits", weight: "weight", delivery_note: "digits" })[key] || "text";
}

function refreshFieldConditionalUi(field) {
  const normalizer = el("fieldNormalizer").value;
  const strategy = el("fieldStrategy").value;
  const hasLocator = readLines(el("fieldLocatorAliases").value).length > 0;
  const neighborEnabled = el("fieldNeighborEnabled").checked;

  el("digitsRow").classList.toggle("hidden", normalizer !== "last_digits");
  el("preferUnitRow").classList.toggle("hidden", field.key !== "weight");
  el("locatorPreferUnitRow").classList.toggle("hidden", field.key !== "weight");
  el("locatorPreferBatchRow").classList.toggle("hidden", field.key !== "batch");
  el("neighborSettings").classList.toggle("hidden", !neighborEnabled);
  el("locatorDetailSettings").classList.toggle("hidden", !hasLocator);

  const strategies = FIELD_STRATEGY_OPTIONS[field.key] || [["", "strategyStandard"]];
  el("strategySection").classList.toggle("hidden", strategies.length <= 1 && !field.strategy);
  el("strategyUnitsRow").classList.toggle("hidden", !(field.key === "weight" && ["unit_required_weight", "quantity_weight"].includes(strategy)));
  el("fallbackStrategyRow").classList.toggle("hidden", !(field.key === "weight" && hasLocator));
  el("numericPairSettings").classList.toggle("hidden", strategy !== "numeric_pair");
}

function deleteSelectedAssignment() {
  const profile = selectedProfile();
  const assignment = currentAssignment();
  if (!profile || !assignment) return;
  if (assignment.type === "anchor") profile.anchor.poly = [];
  else {
    profile.fields = profile.fields.filter((field) => field.key !== assignment.key);
    if (profile.source?.type === "qr") {
      const source = ensureQrSource(profile);
      delete source.parser.fields[assignment.key];
      source.parser.requiredFields = source.parser.requiredFields.filter((key) => key !== assignment.key);
      renderQrSettings(profile);
    }
  }
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
  if (profile?.source?.type === "qr") {
    (profile.source.regions || []).forEach((region, index) => {
      drawLabeledNormalizedPoly(context, rectToPoly(region), width, height, "#b58cff", `QR ${index + 1}`, false);
    });
  } else if (profile && (profile.anchor?.poly || []).length) {
    drawLabeledNormalizedPoly(context, profile.anchor.poly, width, height, "#37dc91", "ANKER", isSelected("anchor", "anchor"));
  }
  for (const field of profile?.fields || []) {
    if ((field.poly || []).length >= 4) {
      drawLabeledNormalizedPoly(context, field.poly, width, height, "#4cc9f0", field.label, isSelected("field", field.key));
    }
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
    info.textContent = uiText("noSelection", state.language);
    return;
  }
  if (selection.source === "ocr") {
    info.innerHTML = `<strong>${escapeHtml(selection.text || msg("(leer)", "(empty)"))}</strong><br>${escapeHtml(msg("Erkennungsquote", "Recognition confidence"))} ${(selection.score * 100).toFixed(1)} %`;
  } else {
    info.textContent = msg("Freie Zone ausgewählt. Ordne sie jetzt als Anker oder Feld zu.", "Free zone selected. Assign it as an anchor or field now.");
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
  if ((profile?.anchor?.poly || []).length) entries.push({ type: "anchor", key: "anchor", label: uiText("anchorButton", state.language), value: profile.anchor });
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
    return { type: "anchor", key: "anchor", label: uiText("anchorButton", state.language), value: profile.anchor };
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
  setConfigStatus(msg(`${state.config.profiles.length} Profile · Änderungen noch nicht exportiert`, `${state.config.profiles.length} profiles · changes not exported yet`), "warn");
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


function storedSelectedProfileId() {
  try {
    return String(globalThis.localStorage?.getItem(EDITOR_SELECTED_PROFILE_KEY) || "");
  } catch {
    return "";
  }
}

function storeSelectedProfileId(profileId) {
  try {
    if (profileId) globalThis.localStorage?.setItem(EDITOR_SELECTED_PROFILE_KEY, String(profileId));
    else globalThis.localStorage?.removeItem(EDITOR_SELECTED_PROFILE_KEY);
  } catch {
    // Der Editor bleibt auch bei gesperrtem Storage benutzbar.
  }
}

function nextEditorPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function readLines(value) {
  return String(value || "").split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
}

function clamp01Number(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function optionalNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  const number = Number(text);
  return Number.isFinite(number) ? number : undefined;
}

function optionalInteger(value) {
  const number = optionalNumber(value);
  return number == null ? undefined : Math.max(1, Math.floor(number));
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
