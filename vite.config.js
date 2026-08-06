import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    sourcemap: true,
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      input: {
        scanner: resolve(process.cwd(), "index.html"),
        editor: resolve(process.cwd(), "editor.html")
      }
    }
  }
});
