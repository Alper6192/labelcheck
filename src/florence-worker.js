import {
  AutoProcessor,
  AutoTokenizer,
  Florence2ForConditionalGeneration,
  env,
  load_image,
} from "@huggingface/transformers";
import { FLORENCE_MAX_TOKENS, FLORENCE_TASK, MODEL_ID } from "./config.js";

const baseUrl = new URL(import.meta.env.BASE_URL, self.location.origin);
const localOnly = import.meta.env.VITE_MODEL_SOURCE !== "remote";

env.allowLocalModels = localOnly;
env.allowRemoteModels = !localOnly;
env.useBrowserCache = true;
if (localOnly) env.localModelPath = new URL("models/", baseUrl).href;
if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.wasmPaths = new URL("ort/", baseUrl).href;

class FlorenceSingleton {
  static model;
  static processor;
  static tokenizer;
  static fp16;

  static async getInstance(progressCallback) {
    this.fp16 ??= await supportsFp16();
    this.processor ??= AutoProcessor.from_pretrained(MODEL_ID, { progress_callback: progressCallback });
    this.tokenizer ??= AutoTokenizer.from_pretrained(MODEL_ID, { progress_callback: progressCallback });
    this.model ??= Florence2ForConditionalGeneration.from_pretrained(MODEL_ID, {
      device: "webgpu",
      dtype: this.fp16
        ? { embed_tokens: "fp16", vision_encoder: "fp16", encoder_model: "q4", decoder_model_merged: "q4" }
        : { embed_tokens: "q4", vision_encoder: "q4", encoder_model: "q4", decoder_model_merged: "q4" },
      progress_callback: progressCallback,
    });
    return Promise.all([this.model, this.processor, this.tokenizer]);
  }
}

async function supportsFp16() {
  try {
    const adapter = await navigator.gpu?.requestAdapter();
    return Boolean(adapter?.features?.has("shader-f16"));
  } catch {
    return false;
  }
}

self.addEventListener("message", async (event) => {
  const { id, type, payload } = event.data || {};
  try {
    if (type === "load") {
      postStatus(id, "Florence-2 wird geladen …");
      await FlorenceSingleton.getInstance((progress) => self.postMessage({ id, type: "progress", progress }));
      self.postMessage({ id, type: "complete", result: { fp16: FlorenceSingleton.fp16, localOnly } });
      return;
    }

    if (type === "analyze") {
      const [model, processor, tokenizer] = await FlorenceSingleton.getInstance((progress) => self.postMessage({ id, type: "progress", progress }));
      postStatus(id, `${payload.role === "product" ? "Produktlabel" : "VDA-Label"} wird mit Florence-2 gelesen …`);
      const started = performance.now();
      const image = await load_image(payload.dataUrl);
      const prompts = processor.construct_prompts(FLORENCE_TASK);
      const visionInputs = await processor(image);
      const textInputs = tokenizer(prompts);
      const generatedIds = await model.generate({
        ...textInputs,
        ...visionInputs,
        max_new_tokens: payload.editor
          ? (payload.role === "product" ? FLORENCE_MAX_TOKENS.editorProduct : FLORENCE_MAX_TOKENS.editorVda)
          : (payload.role === "product" ? FLORENCE_MAX_TOKENS.product : FLORENCE_MAX_TOKENS.vda),
        num_beams: 1,
        do_sample: false,
      });
      const generatedText = tokenizer.batch_decode(generatedIds, { skip_special_tokens: false })[0];
      const result = processor.post_process_generation(generatedText, FLORENCE_TASK, image.size);
      self.postMessage({
        id,
        type: "complete",
        result: { result, imageSize: image.size, generatedText, elapsedMs: performance.now() - started },
      });
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
