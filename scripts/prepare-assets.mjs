import { spawn } from "node:child_process";

await run("node", ["scripts/copy-ort-assets.mjs"]);
await run("node", ["scripts/download-model.mjs"]);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: process.platform === "win32" });
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} endete mit Code ${code}`)));
    child.on("error", reject);
  });
}
