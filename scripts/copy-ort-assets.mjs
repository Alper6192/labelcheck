import { createRequire } from "node:module";
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);

async function findPackageRoot(startPath) {
  let current = path.dirname(startPath);
  for (let index = 0; index < 8; index += 1) {
    try {
      const info = await stat(path.join(current, "package.json"));
      if (info.isFile()) return current;
    } catch {
      // Weiter nach oben suchen.
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error("onnxruntime-web Paketverzeichnis wurde nicht gefunden.");
}

const entry = require.resolve("onnxruntime-web");
const packageRoot = await findPackageRoot(entry);
const sourceDir = path.join(packageRoot, "dist");
const targetDir = path.resolve("public", "ort");

await rm(targetDir, { recursive: true, force: true });
await mkdir(targetDir, { recursive: true });

const files = await readdir(sourceDir);
const runtimeFiles = files.filter((name) =>
  /^ort-wasm.*\.(?:wasm|mjs|js)$/.test(name)
);

if (!runtimeFiles.some((name) => name.endsWith(".wasm"))) {
  throw new Error("Keine ONNX-Runtime-WASM-Dateien gefunden.");
}

// Das automatische Backend benötigt für WebGPU die JSEP-Laufzeit von
// ONNX Runtime Web. So schlägt der Build sichtbar fehl, statt später
// unbemerkt auf einen unvollständigen Runtime-Ordner zu deployen.
if (!runtimeFiles.some((name) => name.includes(".jsep.") && name.endsWith(".wasm"))) {
  throw new Error("Keine ONNX-Runtime-JSEP-Datei für WebGPU gefunden.");
}

for (const name of runtimeFiles) {
  await cp(path.join(sourceDir, name), path.join(targetDir, name));
}

console.log(`ONNX Runtime: ${runtimeFiles.length} Dateien nach public/ort kopiert.`);
