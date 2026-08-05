const elements = {
  gpuBadge: document.querySelector("#gpuBadge"),
  loadModelBtn: document.querySelector("#loadModelBtn"),
  clearCacheBtn: document.querySelector("#clearCacheBtn"),
  modelProgress: document.querySelector("#modelProgress"),
  modelStatus: document.querySelector("#modelStatus"),
  layoutSelect: document.querySelector("#layoutSelect"),
  imageInput: document.querySelector("#imageInput"),
  previewWrap: document.querySelector("#previewWrap"),
  previewCanvas: document.querySelector("#previewCanvas"),
  analyzeBtn: document.querySelector("#analyzeBtn"),
  analysisStatus: document.querySelector("#analysisStatus"),
  results: document.querySelector("#results"),
  rawRegions: document.querySelector("#rawRegions"),
  downloadBtn: document.querySelector("#downloadBtn"),
};

const state = {
  worker: null,
  modelReady: false,
  file: null,
  imageBitmap: null,
  layouts: new Map(),
  lastResult: null,
};

function setStatus(text, kind = "") {
  elements.analysisStatus.textContent = text;
  elements.analysisStatus.dataset.kind = kind;
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function repairNumeric(value) {
  return normalizeText(value)
    .replace(/[OQ]/g, "0")
    .replace(/[IL|!]/g, "1");
}

function boxFromQuad(quad) {
  const values = Array.isArray(quad) ? quad.map(Number) : [];
  if (values.length >= 8) {
    const xs = [values[0], values[2], values[4], values[6]];
    const ys = [values[1], values[3], values[5], values[7]];
    return {
      x0: Math.min(...xs),
      y0: Math.min(...ys),
      x1: Math.max(...xs),
      y1: Math.max(...ys),
      quad: values.slice(0, 8),
    };
  }
  if (values.length >= 4) {
    return {
      x0: values[0],
      y0: values[1],
      x1: values[2],
      y1: values[3],
      quad: null,
    };
  }
  return null;
}

function extractRegions(parsed, imageSize) {
  const taskResult =
    parsed?.["<OCR_WITH_REGION>"] ??
    parsed?.OCR_WITH_REGION ??
    parsed;

  const labels =
    taskResult?.labels ??
    taskResult?.texts ??
    taskResult?.text ??
    [];

  const boxes =
    taskResult?.quad_boxes ??
    taskResult?.quadBoxes ??
    taskResult?.bboxes ??
    taskResult?.boxes ??
    [];

  const labelList = Array.isArray(labels) ? labels : [labels];
  const boxList = Array.isArray(boxes) ? boxes : [];

  const [width, height] = imageSize;
  return labelList
    .map((text, index) => {
      const box = boxFromQuad(boxList[index]);
      if (!box || !String(text ?? "").trim()) return null;
      const centerX = (box.x0 + box.x1) / 2;
      const centerY = (box.y0 + box.y1) / 2;
      return {
        text: String(text).trim(),
        normalizedText: normalizeText(text),
        box,
        center: [centerX, centerY],
        normalizedCenter: [centerX / width, centerY / height],
        normalizedBox: [
          box.x0 / width,
          box.y0 / height,
          box.x1 / width,
          box.y1 / height,
        ],
      };
    })
    .filter(Boolean);
}

function regionsOnSameLine(a, b) {
  const ah = a.box.y1 - a.box.y0;
  const bh = b.box.y1 - b.box.y0;
  return Math.abs(a.center[1] - b.center[1]) <= Math.max(ah, bh) * 0.65;
}

function addJoinedRegions(regions) {
  const joined = [];
  const sorted = [...regions].sort((a, b) => {
    if (!regionsOnSameLine(a, b)) return a.center[1] - b.center[1];
    return a.box.x0 - b.box.x0;
  });

  for (let start = 0; start < sorted.length; start++) {
    let text = "";
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;

    for (let end = start; end < Math.min(sorted.length, start + 4); end++) {
      const current = sorted[end];
      if (end > start) {
        const previous = sorted[end - 1];
        const previousHeight = previous.box.y1 - previous.box.y0;
        if (!regionsOnSameLine(previous, current)) break;
        if (current.box.x0 - previous.box.x1 > previousHeight * 2.5) break;
      }

      text += current.text;
      x0 = Math.min(x0, current.box.x0);
      y0 = Math.min(y0, current.box.y0);
      x1 = Math.max(x1, current.box.x1);
      y1 = Math.max(y1, current.box.y1);

      if (end > start) {
        joined.push({
          text,
          normalizedText: normalizeText(text),
          box: { x0, y0, x1, y1, quad: null },
          center: [(x0 + x1) / 2, (y0 + y1) / 2],
          normalizedCenter: [
            (x0 + x1) / 2 / state.imageBitmap.width,
            (y0 + y1) / 2 / state.imageBitmap.height,
          ],
          normalizedBox: [
            x0 / state.imageBitmap.width,
            y0 / state.imageBitmap.height,
            x1 / state.imageBitmap.width,
            y1 / state.imageBitmap.height,
          ],
          joined: true,
        });
      }
    }
  }
  return [...regions, ...joined];
}

function distanceToHint(region, hint) {
  if (!hint) return 0;
  const targetX = (hint[0] + hint[2]) / 2;
  const targetY = (hint[1] + hint[3]) / 2;
  return Math.hypot(
    region.normalizedCenter[0] - targetX,
    region.normalizedCenter[1] - targetY
  );
}

function candidateValues(text, field) {
  let source = repairNumeric(text);
  const values = new Set();

  if (field.type === "batch") {
    source = source.replace(/[^D0-9]/g, "");
    for (const match of source.matchAll(/D\d{4,14}/g)) values.add(match[0]);
    for (const match of source.matchAll(/\d{5,14}/g)) {
      if (field.prefix) values.add(field.prefix + match[0]);
      values.add(match[0]);
    }
  } else if (field.type === "numeric") {
    for (const match of source.matchAll(/\d+/g)) values.add(match[0]);
  } else {
    values.add(normalizeText(text));
  }

  return [...values];
}

function aliasRegions(regions, field) {
  const aliases = (field.aliases ?? []).map(normalizeText);
  return regions.filter((region) =>
    aliases.some(
      (alias) =>
        region.normalizedText.includes(alias) ||
        alias.includes(region.normalizedText)
    )
  );
}

function relationScore(candidate, anchors) {
  if (!anchors.length) return 0;
  let best = -Infinity;

  for (const anchor of anchors) {
    const dx = candidate.normalizedCenter[0] - anchor.normalizedCenter[0];
    const dy = candidate.normalizedCenter[1] - anchor.normalizedCenter[1];
    const distance = Math.hypot(dx, dy);

    let score = -distance * 35;
    if (dy >= -0.04) score += 8;
    if (dx >= -0.12) score += 5;
    if (dy > 0 && dy < 0.22) score += 12;
    if (dx > 0 && dx < 0.35) score += 8;
    best = Math.max(best, score);
  }
  return Number.isFinite(best) ? best : 0;
}

function scoreCandidate(value, region, field, anchors) {
  let score = 0;
  const pattern = field.pattern ? new RegExp(field.pattern) : null;

  if (pattern?.test(value)) score += 100;
  else if (pattern) score -= 45;

  if (field.length) {
    score += value.length === field.length
      ? 45
      : -Math.abs(value.length - field.length) * 14;
  }

  if (field.minLength && value.length >= field.minLength) score += 8;
  if (field.maxLength && value.length <= field.maxLength) score += 8;
  if (field.prefix) score += value.startsWith(field.prefix) ? 24 : -25;

  score -= distanceToHint(region, field.regionHint) * 42;
  score += relationScore(region, anchors);
  if (region.joined) score += 5;

  return score;
}

function mapField(field, regions) {
  const anchors = aliasRegions(regions, field);

  if (field.type === "text") {
    const direct = anchors
      .map((region) => ({
        value: region.text,
        region,
        score: 100 - distanceToHint(region, field.regionHint) * 30,
      }))
      .sort((a, b) => b.score - a.score)[0];

    return direct
      ? { ...direct, status: "valid", reason: "Beschriftung erkannt" }
      : { value: "", region: null, score: 0, status: "missing", reason: "Nicht gefunden" };
  }

  const candidates = [];
  for (const region of regions) {
    for (const value of candidateValues(region.text, field)) {
      candidates.push({
        value,
        region,
        score: scoreCandidate(value, region, field, anchors),
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0] ?? null;
  const second = candidates[1] ?? null;

  if (!best) {
    return { value: "", region: null, score: 0, status: "missing", reason: "Kein Kandidat" };
  }

  const regexOk = !field.pattern || new RegExp(field.pattern).test(best.value);
  const margin = best.score - (second?.score ?? -50);
  const status = regexOk && margin >= 10 ? "valid" : regexOk ? "uncertain" : "invalid";

  return {
    ...best,
    status,
    margin,
    reason:
      status === "valid"
        ? "Format und Position plausibel"
        : status === "uncertain"
          ? "Mehrere ähnliche Kandidaten"
          : "Format nicht erfüllt",
    candidates: candidates.slice(0, 8).map(({ value, score }) => ({ value, score })),
  };
}

function mapFields(layout, baseRegions) {
  const regions = addJoinedRegions(baseRegions);
  const fields = {};
  for (const field of layout.fields) {
    fields[field.id] = mapField(field, regions);
  }
  return { fields, regions };
}

function drawPreview(regions = [], selectedRegions = []) {
  if (!state.imageBitmap) return;

  const canvas = elements.previewCanvas;
  const maxWidth = 1400;
  const scale = Math.min(1, maxWidth / state.imageBitmap.width);
  canvas.width = Math.round(state.imageBitmap.width * scale);
  canvas.height = Math.round(state.imageBitmap.height * scale);

  const context = canvas.getContext("2d");
  context.drawImage(state.imageBitmap, 0, 0, canvas.width, canvas.height);

  context.lineWidth = Math.max(2, canvas.width / 500);
  context.font = `${Math.max(12, canvas.width / 60)}px system-ui`;

  for (const region of regions) {
    context.strokeStyle = "rgba(242, 184, 75, .8)";
    context.strokeRect(
      region.box.x0 * scale,
      region.box.y0 * scale,
      (region.box.x1 - region.box.x0) * scale,
      (region.box.y1 - region.box.y0) * scale
    );
  }

  for (const item of selectedRegions) {
    if (!item?.region) continue;
    const region = item.region;
    context.strokeStyle = "#29b36b";
    context.fillStyle = "#29b36b";
    context.strokeRect(
      region.box.x0 * scale,
      region.box.y0 * scale,
      (region.box.x1 - region.box.x0) * scale,
      (region.box.y1 - region.box.y0) * scale
    );
    context.fillText(
      item.name,
      region.box.x0 * scale,
      Math.max(15, region.box.y0 * scale - 5)
    );
  }
}

function renderResults(result) {
  const rows = Object.entries(result.fields).map(([id, fieldResult]) => {
    const definition = result.layout.fields.find((field) => field.id === id);
    const stateClass =
      fieldResult.status === "valid"
        ? "good"
        : fieldResult.status === "missing" || fieldResult.status === "invalid"
          ? "bad"
          : "warn";
    const label =
      fieldResult.status === "valid"
        ? "plausibel"
        : fieldResult.status === "uncertain"
          ? "unsicher"
          : fieldResult.status === "missing"
            ? "fehlt"
            : "ungültig";

    return `
      <div class="result-row">
        <span class="result-name">${escapeHtml(definition.name)}</span>
        <span class="result-value">${escapeHtml(fieldResult.value || "—")}</span>
        <span class="state ${stateClass}">${label}</span>
      </div>
    `;
  });

  elements.results.classList.remove("empty");
  elements.results.innerHTML = rows.join("");

  elements.rawRegions.innerHTML = result.regions
    .filter((region) => !region.joined)
    .map(
      (region) => `
        <div class="raw-region">
          <span>${escapeHtml(region.text)}</span>
          <span>${region.normalizedCenter.map((value) => value.toFixed(2)).join(" / ")}</span>
        </div>
      `
    )
    .join("");

  const selected = Object.entries(result.fields).map(([id, value]) => ({
    name: result.layout.fields.find((field) => field.id === id)?.name ?? id,
    region: value.region,
  }));
  drawPreview(result.regions.filter((region) => !region.joined), selected);
  elements.downloadBtn.disabled = false;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadLayouts() {
  const manifest = await fetch("./layouts/index.json").then((response) => {
    if (!response.ok) throw new Error("Layoutliste konnte nicht geladen werden.");
    return response.json();
  });

  for (const path of manifest.layouts) {
    const layout = await fetch(`./layouts/${path}`).then((response) => {
      if (!response.ok) throw new Error(`Layout ${path} konnte nicht geladen werden.`);
      return response.json();
    });
    state.layouts.set(layout.id, layout);
  }

  elements.layoutSelect.innerHTML = [...state.layouts.values()]
    .map((layout) => `<option value="${layout.id}">${escapeHtml(layout.name)}</option>`)
    .join("");
}

function createWorker() {
  if (state.worker) return state.worker;
  const worker = new Worker("./florence-worker.js", { type: "module" });

  worker.addEventListener("message", (event) => {
    const message = event.data ?? {};

    if (message.type === "model-progress") {
      const progress = Number.isFinite(message.progress) ? message.progress : 0;
      elements.modelProgress.value = progress;
      elements.modelStatus.textContent =
        message.file
          ? `${message.status}: ${message.file} · ${progress.toFixed(0)} %`
          : `${message.status} · ${progress.toFixed(0)} %`;
      return;
    }

    if (message.type === "status") {
      setStatus(message.message);
      elements.modelStatus.textContent = message.message;
      return;
    }

    if (message.type === "model-ready") {
      state.modelReady = true;
      elements.modelProgress.value = 100;
      elements.modelStatus.textContent = "Florence-2 ist bereit";
      elements.loadModelBtn.textContent = "Florence-2 geladen";
      elements.loadModelBtn.disabled = true;
      elements.analyzeBtn.disabled = !state.file;
      setStatus("Florence-2 ist bereit.");
      return;
    }

    if (message.type === "analysis-result") {
      const layout = state.layouts.get(elements.layoutSelect.value);
      const regions = extractRegions(message.parsed, message.imageSize);
      const mapped = mapFields(layout, regions);

      state.lastResult = {
        analyzedAt: new Date().toISOString(),
        model: "onnx-community/Florence-2-base-ft",
        task: message.task,
        layout,
        fields: mapped.fields,
        regions: mapped.regions,
        rawFlorenceText: message.generatedText,
      };

      renderResults(state.lastResult);
      setStatus("Analyse abgeschlossen.");
      elements.analyzeBtn.disabled = false;
      elements.analyzeBtn.textContent = "Etikett analysieren";
      return;
    }

    if (message.type === "error") {
      console.error(message.stack || message.message);
      setStatus(message.message, "error");
      elements.modelStatus.textContent = message.message;
      elements.analyzeBtn.disabled = !state.file || !state.modelReady;
      elements.analyzeBtn.textContent = "Etikett analysieren";
    }
  });

  worker.addEventListener("error", (event) => {
    console.error(event);
    setStatus(`Florence-Worker: ${event.message}`, "error");
  });

  state.worker = worker;
  return worker;
}

async function checkWebGpu() {
  if (!("gpu" in navigator)) {
    elements.gpuBadge.textContent = "WebGPU fehlt";
    elements.gpuBadge.classList.add("bad");
    elements.loadModelBtn.disabled = true;
    elements.modelStatus.textContent =
      "Bitte eine aktuelle Version von Microsoft Edge oder Google Chrome verwenden.";
    return false;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("Kein WebGPU-Adapter");
    elements.gpuBadge.textContent = "WebGPU bereit";
    elements.gpuBadge.classList.add("good");
    return true;
  } catch {
    elements.gpuBadge.textContent = "WebGPU nicht verfügbar";
    elements.gpuBadge.classList.add("bad");
    elements.loadModelBtn.disabled = true;
    return false;
  }
}

elements.loadModelBtn.addEventListener("click", () => {
  elements.loadModelBtn.disabled = true;
  elements.modelStatus.textContent = "Modell wird geladen …";
  createWorker().postMessage({ type: "load-model" });
});

elements.imageInput.addEventListener("change", async () => {
  const file = elements.imageInput.files?.[0];
  if (!file) return;

  state.file = file;
  if (state.imageBitmap) state.imageBitmap.close();
  state.imageBitmap = await createImageBitmap(file);
  elements.previewWrap.classList.remove("hidden");
  drawPreview();
  elements.analyzeBtn.disabled = !state.modelReady;
  setStatus(
    state.modelReady
      ? "Foto bereit."
      : "Foto bereit. Zuerst Florence-2 laden."
  );
});

elements.analyzeBtn.addEventListener("click", () => {
  if (!state.file || !state.modelReady) return;
  elements.analyzeBtn.disabled = true;
  elements.analyzeBtn.textContent = "Florence analysiert …";
  elements.downloadBtn.disabled = true;
  setStatus("Etikett wird analysiert …");
  createWorker().postMessage({ type: "analyze", file: state.file });
});

elements.downloadBtn.addEventListener("click", () => {
  if (!state.lastResult) return;

  const exportResult = {
    analyzedAt: state.lastResult.analyzedAt,
    model: state.lastResult.model,
    task: state.lastResult.task,
    layout: {
      id: state.lastResult.layout.id,
      name: state.lastResult.layout.name,
    },
    fields: Object.fromEntries(
      Object.entries(state.lastResult.fields).map(([id, result]) => [
        id,
        {
          value: result.value,
          status: result.status,
          reason: result.reason,
          score: result.score,
          margin: result.margin ?? null,
        },
      ])
    ),
    rawFlorenceText: state.lastResult.rawFlorenceText,
  };

  const blob = new Blob([JSON.stringify(exportResult, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `labelcheck-${state.lastResult.layout.id}-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

elements.clearCacheBtn.addEventListener("click", async () => {
  if (!("caches" in window)) {
    elements.modelStatus.textContent = "Browser-Cache API ist nicht verfügbar.";
    return;
  }

  const names = await caches.keys();
  const transformerCaches = names.filter((name) =>
    /transform|onnx|model/i.test(name)
  );

  for (const name of transformerCaches) {
    await caches.delete(name);
  }

  elements.modelStatus.textContent =
    transformerCaches.length
      ? "Modelldateien aus dem Browser-Cache entfernt."
      : "Kein Florence-Modellcache gefunden.";
});

window.addEventListener("load", async () => {
  try {
    await Promise.all([loadLayouts(), checkWebGpu()]);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./service-worker.js").catch(console.warn);
    }
    if (navigator.storage?.persist) {
      navigator.storage.persist().catch(() => {});
    }
  } catch (error) {
    console.error(error);
    setStatus(error.message, "error");
  }
});
