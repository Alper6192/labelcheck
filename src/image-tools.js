import { clamp } from "./utils.js";

export async function prepareImage(file, maxSide) {
  if (!(file instanceof Blob)) throw new TypeError("Ungültige Bilddatei.");

  const bitmap = await createBitmap(file);
  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;
  const scale = Math.min(1, Number(maxSide) / Math.max(originalWidth, originalHeight));
  const width = Math.max(1, Math.round(originalWidth * scale));
  const height = Math.max(1, Math.round(originalHeight * scale));

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

  const quality = measureQuality(canvas);
  return {
    canvas,
    width,
    height,
    originalWidth,
    originalHeight,
    quality
  };
}

async function createBitmap(file) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      return await createImageBitmap(file);
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function measureQuality(sourceCanvas) {
  const maxAnalysisSide = 420;
  const scale = Math.min(1, maxAnalysisSide / Math.max(sourceCanvas.width, sourceCanvas.height));
  const width = Math.max(8, Math.round(sourceCanvas.width * scale));
  const height = Math.max(8, Math.round(sourceCanvas.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(sourceCanvas, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);

  const gray = new Float32Array(width * height);
  let sum = 0;
  let clippedDark = 0;
  let clippedLight = 0;

  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel += 1) {
    const value = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    gray[pixel] = value;
    sum += value;
    if (value < 18) clippedDark += 1;
    if (value > 246) clippedLight += 1;
  }

  const laplacians = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const center = gray[y * width + x];
      const value =
        gray[(y - 1) * width + x] +
        gray[(y + 1) * width + x] +
        gray[y * width + x - 1] +
        gray[y * width + x + 1] -
        4 * center;
      laplacians.push(value);
    }
  }

  const lapMean = laplacians.reduce((total, value) => total + value, 0) / Math.max(1, laplacians.length);
  const variance = laplacians.reduce((total, value) => total + (value - lapMean) ** 2, 0) / Math.max(1, laplacians.length);
  const pixels = width * height;

  return {
    sharpness: Math.round(variance),
    brightness: Math.round(sum / pixels),
    darkPercent: Number(((clippedDark / pixels) * 100).toFixed(1)),
    lightPercent: Number(((clippedLight / pixels) * 100).toFixed(1)),
    rating: qualityRating(variance, sum / pixels, clippedDark / pixels, clippedLight / pixels)
  };
}

function qualityRating(sharpness, brightness, darkRatio, lightRatio) {
  if (sharpness < 80) return { level: "bad", text: "möglicherweise unscharf" };
  if (brightness < 55 || darkRatio > 0.25) return { level: "warn", text: "möglicherweise zu dunkel" };
  if (brightness > 225 || lightRatio > 0.32) return { level: "warn", text: "möglicherweise überbelichtet" };
  if (sharpness < 180) return { level: "warn", text: "noch brauchbar, aber nicht optimal" };
  return { level: "ok", text: "plausibel" };
}
