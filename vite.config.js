import { defineConfig } from "vite";
import { resolve } from "node:path";

function pagesBase() {
  if (process.env.VITE_BASE_PATH) return process.env.VITE_BASE_PATH;
  const repository = process.env.GITHUB_REPOSITORY?.split("/")[1];
  return process.env.GITHUB_ACTIONS === "true" && repository ? `/${repository}/` : "/";
}

export default defineConfig({
  base: pagesBase(),
  build: {
    target: "es2022",
    sourcemap: true,
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      input: {
        scanner: resolve(process.cwd(), "index.html"),
        editor: resolve(process.cwd(), "editor.html"),
      },
    },
  },
  worker: { format: "es" },
});
