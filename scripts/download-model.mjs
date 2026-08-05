import { createWriteStream } from "node:fs";
import { access, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";

const MODEL_ID = "onnx-community/Florence-2-base-ft";
const REVISION = "e88a44eaf3791a35eae0c5a47b3dbcd36e67eb6f";
const targetRoot = resolve("public/models", MODEL_ID);
const files = [
  "added_tokens.json",
  "config.json",
  "generation_config.json",
  "merges.txt",
  "preprocessor_config.json",
  "special_tokens_map.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "vocab.json",
  "onnx/embed_tokens_fp16.onnx",
  "onnx/embed_tokens_q4.onnx",
  "onnx/vision_encoder_fp16.onnx",
  "onnx/vision_encoder_q4.onnx",
  "onnx/encoder_model_q4.onnx",
  "onnx/decoder_model_merged_q4.onnx"
];

if (process.env.DRY_RUN === "1") {
  console.log(JSON.stringify({ MODEL_ID, REVISION, targetRoot, files }, null, 2));
  process.exit(0);
}

for (const file of files) {
  const target = resolve(targetRoot, file);
  if (await isUsable(target)) {
    console.log(`✓ vorhanden: ${file}`);
    continue;
  }
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.part`;
  await rm(temporary, { force: true });
  const url = `https://huggingface.co/${MODEL_ID}/resolve/${REVISION}/${file}?download=true`;
  console.log(`↓ ${file}`);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`Download fehlgeschlagen: ${response.status} ${file}`);
  await finished(Readable.fromWeb(response.body).pipe(createWriteStream(temporary)));
  await rename(temporary, target);
}

await writeFile(resolve(targetRoot, "MODEL_SOURCE.json"), JSON.stringify({ modelId: MODEL_ID, revision: REVISION, downloadedAt: new Date().toISOString(), license: "MIT" }, null, 2));
console.log("Florence-Modell vollständig vorbereitet.");

async function isUsable(path) {
  try {
    await access(path);
    return (await stat(path)).size > 100;
  } catch {
    return false;
  }
}
