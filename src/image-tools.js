import { clamp } from "./utils.js";

export async function prepareImage(file, maxSide, options = {}) {
  if (!(file instanceof Blob)) throw new TypeError("Ungültige Bilddatei.");

  const decoded = await createBitmap(file, {
    maxSide,
    resizeDuringDecode: options.resizeDuringDecode === true
  });
  const bitmap = decoded.bitmap;
  const originalWidth = decoded.originalWidth || bitmap.width;
  const originalHeight = decoded.originalHeight || bitmap.height;
  const scale = Math.min(1, Number(maxSide) / Math.max(bitmap.width, bitmap.height));
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

  const quality = measureQuality(canvas);
  return {
    canvas,
    width,
    height,
    originalWidth,
    originalHeight,
    decodedAtReducedSize: decoded.resizedDuringDecode === true,
    quality
  };
}

async function createBitmap(file, { maxSide, resizeDuringDecode }) {
  if ("createImageBitmap" in window) {
    if (resizeDuringDecode) {
      try {
        const dimensions = await readEncodedImageDimensions(file);
        if (dimensions && Math.max(dimensions.width, dimensions.height) > Number(maxSide)) {
          const scale = Number(maxSide) / Math.max(dimensions.width, dimensions.height);
          const resizeWidth = Math.max(1, Math.round(dimensions.width * scale));
          const resizeHeight = Math.max(1, Math.round(dimensions.height * scale));
          const bitmap = await createImageBitmap(file, {
            imageOrientation: "from-image",
            resizeWidth,
            resizeHeight,
            resizeQuality: "high"
          });
          return {
            bitmap,
            originalWidth: dimensions.width,
            originalHeight: dimensions.height,
            resizedDuringDecode: true
          };
        }
      } catch {
        // Browser unterstützt Resize-beim-Decodieren nicht oder Dateiformat ist
        // unbekannt. Der normale Decode-Pfad bleibt als kompatibler Fallback.
      }
    }

    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { bitmap, originalWidth: bitmap.width, originalHeight: bitmap.height, resizedDuringDecode: false };
    } catch {
      const bitmap = await createImageBitmap(file);
      return { bitmap, originalWidth: bitmap.width, originalHeight: bitmap.height, resizedDuringDecode: false };
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return { bitmap: image, originalWidth: image.naturalWidth || image.width, originalHeight: image.naturalHeight || image.height, resizedDuringDecode: false };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Liest JPEG-/PNG-Abmessungen ohne vollständiges Dekodieren des Fotos. */
export async function readEncodedImageDimensions(file) {
  const prefix = new Uint8Array(await file.slice(0, Math.min(file.size, 512 * 1024)).arrayBuffer());
  return parseEncodedImageDimensions(prefix, file.type);
}

export function parseEncodedImageDimensions(bytes, mimeType = "") {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12) return null;
  const mime = String(mimeType || "").toLowerCase();

  const isPng = mime.includes("png") || (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  );
  if (isPng && bytes.length >= 24) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    return width > 0 && height > 0 ? { width, height } : null;
  }

  const isJpeg = mime.includes("jpeg") || mime.includes("jpg") || (bytes[0] === 0xff && bytes[1] === 0xd8);
  if (!isJpeg) return null;

  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0xda) break;
    if (offset + 1 >= bytes.length) break;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) break;

    const isSof = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker);
    if (isSof && length >= 7) {
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    offset += length;
  }
  return null;
}

export async function readImageOrientationInfo(file) {
  if (!(file instanceof Blob)) return null;
  const prefix = new Uint8Array(await file.slice(0, Math.min(file.size, 512 * 1024)).arrayBuffer());
  return parseEncodedImageOrientationInfo(prefix, file.type);
}

export function parseEncodedImageOrientationInfo(bytes, mimeType = "") {
  const dimensions = parseEncodedImageDimensions(bytes, mimeType);
  if (!dimensions) return null;
  const orientation = parseExifOrientation(bytes, mimeType) || 1;
  const swapsAxes = [5, 6, 7, 8].includes(orientation);
  const displayWidth = swapsAxes ? dimensions.height : dimensions.width;
  const displayHeight = swapsAxes ? dimensions.width : dimensions.height;
  return {
    encodedWidth: dimensions.width,
    encodedHeight: dimensions.height,
    orientation,
    displayWidth,
    displayHeight,
    portrait: displayHeight > displayWidth
  };
}

function parseExifOrientation(bytes, mimeType = "") {
  if (!(bytes instanceof Uint8Array) || bytes.length < 16) return 1;
  const mime = String(mimeType || "").toLowerCase();
  const isJpeg = mime.includes("jpeg") || mime.includes("jpg") || (bytes[0] === 0xff && bytes[1] === 0xd8);
  if (!isJpeg) return 1;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (offset + 2 > bytes.length) break;
    const length = view.getUint16(offset, false);
    if (length < 2 || offset + length > bytes.length) break;
    const payload = offset + 2;

    if (marker === 0xe1 && payload + 14 <= bytes.length &&
        bytes[payload] === 0x45 && bytes[payload + 1] === 0x78 &&
        bytes[payload + 2] === 0x69 && bytes[payload + 3] === 0x66 &&
        bytes[payload + 4] === 0x00 && bytes[payload + 5] === 0x00) {
      const tiff = payload + 6;
      if (tiff + 8 > bytes.length) return 1;
      const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
      const big = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d;
      if (!little && !big) return 1;
      const get16 = (at) => view.getUint16(at, little);
      const get32 = (at) => view.getUint32(at, little);
      if (get16(tiff + 2) !== 0x2a) return 1;
      const ifd0 = tiff + get32(tiff + 4);
      if (ifd0 + 2 > bytes.length) return 1;
      const count = get16(ifd0);
      for (let index = 0; index < count; index += 1) {
        const entry = ifd0 + 2 + index * 12;
        if (entry + 12 > bytes.length) break;
        if (get16(entry) !== 0x0112) continue;
        const type = get16(entry + 2);
        const values = get32(entry + 4);
        if (type === 3 && values >= 1) {
          const value = get16(entry + 8);
          return value >= 1 && value <= 8 ? value : 1;
        }
      }
    }
    offset += length;
  }
  return 1;
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

export function releasePreparedImage(prepared) {
  const canvas = prepared?.canvas;
  if (!canvas) return;
  try {
    canvas.width = 1;
    canvas.height = 1;
  } catch {
    // Best effort; darf einen neuen Scan nie verhindern.
  }
}
