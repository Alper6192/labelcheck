import { boundsFromPoly, clamp, normalizePoly, sortOcrItems } from "./utils.js";

export function renderPreview(container, prepared, result = null) {
  container.replaceChildren();
  if (!prepared?.canvas) {
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder";
    placeholder.textContent = "Noch kein Bild";
    container.append(placeholder);
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = prepared.canvas.width;
  canvas.height = prepared.canvas.height;
  const context = canvas.getContext("2d");
  context.drawImage(prepared.canvas, 0, 0);

  if (result?.items?.length) {
    const lineWidth = Math.max(2, Math.round(canvas.width / 650));
    context.lineWidth = lineWidth;
    context.font = `${Math.max(18, Math.round(canvas.width / 48))}px system-ui, sans-serif`;
    context.textBaseline = "bottom";

    sortOcrItems(result.items).forEach((item, index) => {
      const points = normalizePoly(item.poly);
      if (points.length < 3) return;
      context.strokeStyle = scoreColor(item.score);
      context.fillStyle = scoreColor(item.score);
      context.beginPath();
      context.moveTo(points[0][0], points[0][1]);
      for (const [x, y] of points.slice(1)) context.lineTo(x, y);
      context.closePath();
      context.stroke();

      const bounds = boundsFromPoly(points);
      const label = `${index + 1}`;
      const metrics = context.measureText(label);
      const x = clamp(bounds.x, 0, canvas.width - metrics.width - 10);
      const y = clamp(bounds.y, 24, canvas.height);
      context.fillRect(x, y - 24, metrics.width + 10, 24);
      context.fillStyle = "#061423";
      context.fillText(label, x + 5, y - 2);
    });
  }

  container.append(canvas);
}

export function renderItemsTable(tbody, items) {
  tbody.replaceChildren();
  const sorted = sortOcrItems(items);
  if (!sorted.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="5" class="empty-cell">Keine Textzeilen erkannt.</td>';
    tbody.append(row);
    return;
  }

  sorted.forEach((item, index) => {
    const bounds = boundsFromPoly(item.poly);
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td class="recognized-text"></td>
      <td>${(Number(item.score || 0) * 100).toFixed(1)} %</td>
      <td>${Math.round(bounds.x)}, ${Math.round(bounds.y)}</td>
      <td>${Math.round(bounds.width)} × ${Math.round(bounds.height)}</td>
    `;
    row.querySelector(".recognized-text").textContent = String(item.text ?? "");
    tbody.append(row);
  });
}

function scoreColor(score) {
  const value = Number(score || 0);
  if (value >= 0.85) return "#37dc91";
  if (value >= 0.60) return "#ffb23e";
  return "#ff667a";
}
