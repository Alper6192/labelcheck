import { boundsFromPoly, clamp, normalizePoly } from "./utils.js";

export function renderPreview(container, prepared, overlays = []) {
  container.replaceChildren();
  if (!prepared?.canvas) { const p=document.createElement("div");p.className="placeholder";p.textContent="Noch kein Bild";container.append(p);return; }
  const canvas=document.createElement("canvas"); canvas.width=prepared.canvas.width;canvas.height=prepared.canvas.height;
  const c=canvas.getContext("2d");c.drawImage(prepared.canvas,0,0);
  c.lineWidth=Math.max(3,Math.round(canvas.width/600));c.font=`700 ${Math.max(18,Math.round(canvas.width/45))}px system-ui`;c.textBaseline="bottom";
  overlays.forEach((o)=>{const pts=normalizePoly(o.poly);if(pts.length<3)return;const color=o.key==="anchor"?"#37dc91":"#4cc9f0";c.strokeStyle=color;c.fillStyle=color;c.beginPath();c.moveTo(...pts[0]);pts.slice(1).forEach(p=>c.lineTo(...p));c.closePath();c.stroke();const b=boundsFromPoly(pts);const label=o.label||o.key;const m=c.measureText(label);const x=clamp(b.x,0,canvas.width-m.width-12),y=clamp(b.y,28,canvas.height);c.fillRect(x,y-28,m.width+12,28);c.fillStyle="#061423";c.fillText(label,x+6,y-4);});
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
