import { JPEG_QUALITY, MAX_IMAGE_SIDE } from "./config.js";

export async function prepareImage(file) {
  if (!(file instanceof Blob)) throw new TypeError("Keine gültige Bilddatei.");

  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.fillStyle = "white";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const quality = assessImageQuality(canvas);
  const blob = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
  const dataUrl = await blobToDataUrl(blob);

  return {
    dataUrl,
    width,
    height,
    quality,
    originalName: file.name || "aufnahme.jpg",
    size: blob.size,
  };
}

async function loadBitmap(file) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      return await createImageBitmap(file);
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Bild konnte nicht gelesen werden."));
      element.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Bild konnte nicht komprimiert werden.")), type, quality);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Bild konnte nicht umgewandelt werden."));
    reader.readAsDataURL(blob);
  });
}

function assessImageQuality(source) {
  const sample = document.createElement("canvas");
  const scale = Math.min(1, 420 / Math.max(source.width, source.height));
  sample.width = Math.max(1, Math.round(source.width * scale));
  sample.height = Math.max(1, Math.round(source.height * scale));
  const context = sample.getContext("2d", { willReadFrequently: true });
  context.drawImage(source, 0, 0, sample.width, sample.height);
  const { data } = context.getImageData(0, 0, sample.width, sample.height);
  const gray = new Float32Array(sample.width * sample.height);
  let dark = 0;
  let bright = 0;

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const value = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    gray[p] = value;
    if (value < 25) dark += 1;
    if (value > 245) bright += 1;
  }

  let sum = 0;
  let sumSquares = 0;
  let count = 0;
  const width = sample.width;
  for (let y = 1; y < sample.height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const laplacian = gray[index - 1] + gray[index + 1] + gray[index - width] + gray[index + width] - 4 * gray[index];
      sum += laplacian;
      sumSquares += laplacian * laplacian;
      count += 1;
    }
  }

  const mean = sum / Math.max(1, count);
  const sharpness = sumSquares / Math.max(1, count) - mean * mean;
  const total = Math.max(1, gray.length);
  const darkRatio = dark / total;
  const brightRatio = bright / total;
  const warnings = [];
  if (sharpness < 75) warnings.push("Das Foto wirkt unscharf. Näher herangehen und ruhig halten.");
  if (darkRatio > 0.25) warnings.push("Das Foto ist sehr dunkel.");
  if (brightRatio > 0.35) warnings.push("Starke Überbelichtung oder Reflexion erkannt.");

  return { sharpness: Math.round(sharpness), darkRatio, brightRatio, warnings, acceptable: warnings.length === 0 };
}

export async function cropImageToDetectedText(image, entries) {
  if (!image?.dataUrl || !Array.isArray(entries) || entries.length < 4) return null;

  const valid = entries.filter((entry) =>
    entry?.text &&
    Number.isFinite(entry.left) && Number.isFinite(entry.right) &&
    Number.isFinite(entry.top) && Number.isFinite(entry.bottom) &&
    entry.right > entry.left && entry.bottom > entry.top
  );
  if (valid.length < 4) return null;

  const sourceWidth = Number(image.width);
  const sourceHeight = Number(image.height);
  if (!(sourceWidth > 0 && sourceHeight > 0)) return null;

  const textLeft = Math.min(...valid.map((entry) => entry.left));
  const textRight = Math.max(...valid.map((entry) => entry.right));
  const textTop = Math.min(...valid.map((entry) => entry.top));
  const textBottom = Math.max(...valid.map((entry) => entry.bottom));

  const marginX = Math.max(36, sourceWidth * 0.09);
  const marginY = Math.max(30, sourceHeight * 0.09);
  const left = Math.max(0, Math.floor(textLeft - marginX));
  const top = Math.max(0, Math.floor(textTop - marginY));
  const right = Math.min(sourceWidth, Math.ceil(textRight + marginX));
  const bottom = Math.min(sourceHeight, Math.ceil(textBottom + marginY));
  const width = right - left;
  const height = bottom - top;
  const areaRatio = (width * height) / (sourceWidth * sourceHeight);

  if (width < sourceWidth * 0.25 || height < sourceHeight * 0.18 || areaRatio > 0.9) return null;

  const source = await loadImageFromDataUrl(image.dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, left, top, width, height, 0, 0, width, height);

  const blob = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
  return {
    dataUrl: await blobToDataUrl(blob),
    width,
    height,
    cropRect: { left, top, width, height, areaRatio },
  };
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Detailausschnitt konnte nicht geladen werden."));
    image.src = dataUrl;
  });
}
