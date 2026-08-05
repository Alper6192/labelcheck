import { cp, mkdir, readdir, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const projectRequire = createRequire(import.meta.url);
const transformersEntry = projectRequire.resolve("@huggingface/transformers");
const transformersRequire = createRequire(transformersEntry);
const ortEntry = transformersRequire.resolve("onnxruntime-web");

let packageRoot = dirname(ortEntry);
while (true) {
  try {
    await access(resolve(packageRoot, "package.json"));
    break;
  } catch {
    const parent = dirname(packageRoot);
    if (parent === packageRoot) throw new Error("Paketwurzel von onnxruntime-web wurde nicht gefunden.");
    packageRoot = parent;
  }
}

const dist = resolve(packageRoot, "dist");
const target = resolve("public/ort");
await mkdir(target, { recursive: true });

const entries = await readdir(dist);
const selected = entries.filter((name) => /^ort-wasm.*\.(wasm|mjs|js)$/.test(name));
if (!selected.length) throw new Error(`Keine ONNX-Runtime-Webdateien in ${dist} gefunden.`);
for (const name of selected) {
  await cp(resolve(dist, name), resolve(target, name));
  console.log(`✓ ORT: ${name}`);
}
