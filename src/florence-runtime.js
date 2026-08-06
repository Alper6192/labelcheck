import {
  AutoProcessor,
  AutoTokenizer,
  Florence2ForConditionalGeneration,
  env,
  load_image,
} from "@huggingface/transformers";
import { FLORENCE_MAX_TOKENS, FLORENCE_TASK, MODEL_ID } from "./config.js";

const baseUrl = new URL(import.meta.env.BASE_URL, globalThis.location.origin);
const localOnly = import.meta.env.VITE_MODEL_SOURCE !== "remote";

let configured = false;
let modelPromise = null;
let processorPromise = null;
let tokenizerPromise = null;
let runtimeInfo = null;

function configureEnvironment() {
  if (configured) return;
  configured = true;
  env.allowLocalModels = localOnly;
  env.allowRemoteModels = !localOnly;
  env.useBrowserCache = true;
  if (localOnly) env.localModelPath = new URL("models/", baseUrl).href;
  if (env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.wasmPaths = new URL("ort/", baseUrl).href;
  }
}

export async function probeWebGpu({ timeoutMs = 6000 } = {}) {
  if (!globalThis.navigator?.gpu) {
    return { ok: false, reason: "WebGPU ist in diesem Ausführungskontext nicht verfügbar." };
  }

  const attempts = [
    { mode: "core", options: undefined },
    { mode: "high-performance", options: { powerPreference: "high-performance" } },
    { mode: "compatibility", options: { featureLevel: "compatibility" } },
  ];
  const errors = [];

  for (const attempt of attempts) {
    try {
      const adapter = await withTimeout(
        globalThis.navigator.gpu.requestAdapter(attempt.options),
        timeoutMs,
        `GPU-Adapter (${attempt.mode}) antwortet nicht.`,
      );
      if (adapter) {
        return {
          ok: true,
          adapter,
          mode: attempt.mode,
          fp16: Boolean(adapter.features?.has?.("shader-f16")),
        };
      }
      errors.push(`${attempt.mode}: kein Adapter`);
    } catch (error) {
      errors.push(`${attempt.mode}: ${error?.message || error}`);
    }
  }

  return {
    ok: false,
    reason: `Kein WebGPU-Adapter verfügbar (${errors.join("; ")}).`,
  };
}

export async function initializeFlorence({
  progressCallback,
  adapter = null,
  adapterMode = "auto",
  context = "unknown",
} = {}) {
  configureEnvironment();

  let probe = adapter
    ? { ok: true, adapter, mode: adapterMode, fp16: Boolean(adapter.features?.has?.("shader-f16")) }
    : await probeWebGpu();

  if (!probe.ok || !probe.adapter) {
    throw new Error(probe.reason || "Kein WebGPU-Adapter verfügbar.");
  }

  // ONNX Runtime darf nicht nochmals einen möglicherweise anderen Adapter
  // anfordern. Das ist besonders wichtig bei verwalteten Edge-Versionen, bei
  // denen WebGPU im Fenster, aber nicht zuverlässig im Worker verfügbar ist.
  if (env.backends?.onnx?.webgpu) {
    try {
      env.backends.onnx.webgpu.adapter = probe.adapter;
    } catch (error) {
      console.warn("WebGPU-Adapter konnte nicht vorgegeben werden:", error);
    }
  }

  const fp16 = probe.fp16;
  processorPromise ??= AutoProcessor.from_pretrained(MODEL_ID, {
    progress_callback: progressCallback,
  });
  tokenizerPromise ??= AutoTokenizer.from_pretrained(MODEL_ID, {
    progress_callback: progressCallback,
  });
  modelPromise ??= Florence2ForConditionalGeneration.from_pretrained(MODEL_ID, {
    device: "webgpu",
    dtype: fp16
      ? {
          embed_tokens: "fp16",
          vision_encoder: "fp16",
          encoder_model: "q4",
          decoder_model_merged: "q4",
        }
      : {
          embed_tokens: "q4",
          vision_encoder: "q4",
          encoder_model: "q4",
          decoder_model_merged: "q4",
        },
    progress_callback: progressCallback,
  });

  const [model, processor, tokenizer] = await Promise.all([
    modelPromise,
    processorPromise,
    tokenizerPromise,
  ]);

  runtimeInfo = {
    context,
    adapterMode: probe.mode,
    fp16,
    localOnly,
  };

  return { model, processor, tokenizer, info: runtimeInfo };
}

export async function analyzeFlorence(dataUrl, role, options = {}) {
  const { model, processor, tokenizer, info } = await initializeFlorence(options);
  const started = performance.now();
  const image = await load_image(dataUrl);
  const prompts = processor.construct_prompts(FLORENCE_TASK);
  const visionInputs = await processor(image);
  const textInputs = tokenizer(prompts);
  const generatedIds = await model.generate({
    ...textInputs,
    ...visionInputs,
    max_new_tokens: options.editor
      ? (role === "product" ? FLORENCE_MAX_TOKENS.editorProduct : FLORENCE_MAX_TOKENS.editorVda)
      : (role === "product" ? FLORENCE_MAX_TOKENS.product : FLORENCE_MAX_TOKENS.vda),
    num_beams: 1,
    do_sample: false,
  });
  const generatedText = tokenizer.batch_decode(generatedIds, {
    skip_special_tokens: false,
  })[0];
  const result = processor.post_process_generation(
    generatedText,
    FLORENCE_TASK,
    image.size,
  );

  return {
    result,
    imageSize: image.size,
    generatedText,
    elapsedMs: performance.now() - started,
    runtime: info,
  };
}

export function getRuntimeInfo() {
  return runtimeInfo;
}

function withTimeout(promise, milliseconds, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}
