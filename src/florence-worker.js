import {
  analyzeFlorence,
  initializeFlorence,
  probeWebGpu,
} from "./florence-runtime.js";

self.addEventListener("message", async (event) => {
  const { id, type, payload } = event.data || {};
  try {
    if (type === "probe") {
      const probe = await probeWebGpu({ timeoutMs: 5000 });
      self.postMessage({
        id,
        type: "complete",
        result: {
          ok: probe.ok,
          mode: probe.mode || "",
          fp16: Boolean(probe.fp16),
          reason: probe.reason || "",
        },
      });
      return;
    }

    if (type === "load") {
      postStatus(id, "Florence-2 wird im Web Worker geladen …");
      const loaded = await initializeFlorence({
        context: "worker-webgpu",
        progressCallback: (progress) => self.postMessage({ id, type: "progress", progress }),
      });
      self.postMessage({ id, type: "complete", result: loaded.info });
      return;
    }

    if (type === "analyze") {
      postStatus(
        id,
        `${payload.role === "product" ? "Produktlabel" : "VDA-Label"} wird im Web Worker gelesen …`,
      );
      const result = await analyzeFlorence(payload.dataUrl, payload.role, {
        editor: Boolean(payload.editor),
        context: "worker-webgpu",
        progressCallback: (progress) => self.postMessage({ id, type: "progress", progress }),
      });
      self.postMessage({ id, type: "complete", result });
      return;
    }

    throw new Error(`Unbekannter Worker-Auftrag: ${type}`);
  } catch (error) {
    console.error(error);
    self.postMessage({ id, type: "error", error: error?.message || String(error) });
  }
});

function postStatus(id, text) {
  self.postMessage({ id, type: "status", text });
}
