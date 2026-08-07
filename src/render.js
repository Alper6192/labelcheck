import { boundsFromPoly, clamp, normalizePoly } from "./utils.js";

export function renderPreview(container, prepared, overlays = [], maxPreviewSide = 1100) {
  container.replaceChildren();
  if (!prepared?.canvas) {
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder";
    placeholder.textContent = "Noch kein Bild";
    container.append(placeholder);
    return;
  }

  // Die Vorschau muss auf einem Smartphone nicht dieselben 1400–2100 Pixel wie
  // das OCR-Canvas besitzen. Eine kleinere Display-Kopie spart besonders unter
  // iOS mehrere große RGBA-Puffer, ohne die OCR oder Profilgeometrie zu ändern.
  const source = prepared.canvas;
  const scale = Math.min(1, Number(maxPreviewSide || 1100) / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext("2d");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  context.lineWidth = Math.max(2, Math.round(canvas.width / 600));
  context.font = `700 ${Math.max(14, Math.round(canvas.width / 45))}px system-ui`;
  context.textBaseline = "bottom";

  overlays.forEach((overlay) => {
    const points = normalizePoly(overlay.poly).map(([x, y]) => [x * scale, y * scale]);
    if (points.length < 3) return;
    const color = overlay.key === "anchor" ? "#37dc91" : "#4cc9f0";
    context.strokeStyle = color;
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(...points[0]);
    points.slice(1).forEach((point) => context.lineTo(...point));
    context.closePath();
    context.stroke();
    const bounds = boundsFromPoly(points);
    const label = overlay.label || overlay.key;
    const metrics = context.measureText(label);
    const labelHeight = Math.max(20, Math.round(canvas.width / 60));
    const x = clamp(bounds.x, 0, canvas.width - metrics.width - 12);
    const y = clamp(bounds.y, labelHeight, canvas.height);
    context.fillRect(x, y - labelHeight, metrics.width + 12, labelHeight);
    context.fillStyle = "#061423";
    context.fillText(label, x + 6, y - 4);
  });

  container.append(canvas);
}

export function renderFieldEditor(container, extraction, onChange) {
  container.replaceChildren();
  const keys=["batch","idh","weight","delivery_note","drum_number"];
  const labels={batch:"Batch",idh:"IDH",weight:"Gewicht",delivery_note:"Lieferscheinnummer",drum_number:"Fassnummer"};
  for(const key of keys){const field=extraction?.fields?.[key];if(!field)continue;const card=document.createElement("label");card.className=`field-card ${field.valid?"valid":"invalid"}`;card.innerHTML=`<span>${labels[key]}</span><input type="text"><small></small>`;const input=card.querySelector("input");input.value=field.value||"";card.querySelector("small").textContent=field.source==="manual"?"manuell korrigiert":field.source==="ocr"?`OCR ${(field.confidence*100).toFixed(1)} %`:"nicht erkannt";input.addEventListener("change",()=>onChange(key,input.value));container.append(card);}
  if(!container.children.length){const p=document.createElement("p");p.className="muted";p.textContent="Noch keine Felder zugeordnet.";container.append(p);}
}

export function renderComparison(container, comparison) {
  container.replaceChildren(); if(!comparison){container.innerHTML='<p class="muted">Beide Etiketten analysieren.</p>';return;}
  const banner=document.createElement("div");banner.className=`result-banner ${comparison.status}`;banner.textContent=comparison.message;container.append(banner);
  const table=document.createElement("table");table.className="compare-table";table.innerHTML='<thead><tr><th>Feld</th><th>Produkt</th><th>VDA</th><th>Ergebnis</th></tr></thead><tbody></tbody>';
  const tbody=table.querySelector("tbody");for(const row of comparison.rows){const tr=document.createElement("tr");tr.innerHTML=`<td>${row.label}</td><td></td><td></td><td class="status-${row.status}">${statusText(row.status)}</td>`;tr.children[1].textContent=row.product||"–";tr.children[2].textContent=row.vda||"–";tbody.append(tr);}container.append(table);
}
function statusText(s){return{match:"stimmt",mismatch:"abweichend",missing:"fehlt",invalid:"ungültig"}[s]||s;}
