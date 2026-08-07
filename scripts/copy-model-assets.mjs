import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const MODELS = [
  {
    file: "PP-OCRv5_mobile_det_onnx_infer.tar",
    url: "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/PP-OCRv5_mobile_det_onnx_infer.tar",
    minBytes: 1_000_000
  },
  {
    file: "PP-OCRv5_mobile_rec_onnx_infer.tar",
    url: "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/PP-OCRv5_mobile_rec_onnx_infer.tar",
    minBytes: 1_000_000
  }
];

const targetDir = path.resolve("public", "models");
await mkdir(targetDir, { recursive: true });

async function isUsable(filePath, minBytes) {
  try {
    const info = await stat(filePath);
    return info.isFile() && info.size >= minBytes;
  } catch {
    return false;
  }
}

for (const model of MODELS) {
  const target = path.join(targetDir, model.file);
  if (await isUsable(target, model.minBytes)) {
    console.log(`OCR-Modell vorhanden: ${model.file}`);
    continue;
  }

  console.log(`Lade OCR-Modell für Pages-Build: ${model.file}`);
  const response = await fetch(model.url, {
    redirect: "follow",
    headers: { "user-agent": "LabelCheck-GitHub-Pages-Build/0.6.3" }
  });
  if (!response.ok) {
    throw new Error(`OCR-Modell konnte nicht geladen werden: ${model.file} · HTTP ${response.status}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < model.minBytes) {
    throw new Error(`OCR-Modell ist unerwartet klein: ${model.file} · ${bytes.byteLength} Bytes`);
  }

  // Ein ustar-TAR enthält ab Offset 257 die Kennung "ustar".
  const magic = new TextDecoder("ascii").decode(bytes.subarray(257, 262));
  if (magic !== "ustar") {
    throw new Error(`OCR-Modell ist kein erwartetes ustar-TAR: ${model.file}`);
  }

  await writeFile(target, bytes);
  console.log(`OCR-Modell lokal gespeichert: ${model.file} · ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB`);
}
