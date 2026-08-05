import {
  Florence2ForConditionalGeneration,
  AutoProcessor,
  AutoTokenizer,
  RawImage,
  env,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.1";

const MODEL_ID = "onnx-community/Florence-2-base-ft";
const TASK = "<OCR_WITH_REGION>";

let model = null;
let processor = null;
let tokenizer = null;
let loadingPromise = null;

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
env.useWasmCache = true;

function post(type, payload = {}) {
  self.postMessage({ type, ...payload });
}

function progressCallback(info) {
  post("model-progress", {
    status: info.status ?? "loading",
    file: info.file ?? "",
    progress: Number(info.progress ?? 0),
    loaded: Number(info.loaded ?? 0),
    total: Number(info.total ?? 0),
  });
}

async function loadModel() {
  if (model && processor && tokenizer) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    if (!("gpu" in navigator)) {
      throw new Error(
        "WebGPU ist in diesem Browser nicht verfügbar. Bitte eine aktuelle Version von Edge oder Chrome verwenden."
      );
    }

    post("status", { message: "Florence-2 wird vorbereitet …" });

    const dtype = {
      embed_tokens: "fp16",
      vision_encoder: "fp16",
      encoder_model: "q4",
      decoder_model_merged: "q4",
    };

    [model, processor, tokenizer] = await Promise.all([
      Florence2ForConditionalGeneration.from_pretrained(MODEL_ID, {
        device: "webgpu",
        dtype,
        progress_callback: progressCallback,
      }),
      AutoProcessor.from_pretrained(MODEL_ID, {
        progress_callback: progressCallback,
      }),
      AutoTokenizer.from_pretrained(MODEL_ID, {
        progress_callback: progressCallback,
      }),
    ]);

    post("model-ready", { modelId: MODEL_ID });
  })();

  try {
    await loadingPromise;
  } finally {
    loadingPromise = null;
  }
}

async function analyze(blob) {
  await loadModel();

  post("status", { message: "Foto wird für Florence vorbereitet …" });
  const image = await RawImage.fromBlob(blob);

  const prompts = processor.construct_prompts(TASK);
  const textInputs = tokenizer(prompts);
  const visionInputs = await processor(image);

  post("status", { message: "Florence liest das Etikett …" });
  const generatedIds = await model.generate({
    ...textInputs,
    ...visionInputs,
    max_new_tokens: 1024,
    num_beams: 1,
    do_sample: false,
  });

  const generatedText = tokenizer.batch_decode(generatedIds, {
    skip_special_tokens: false,
  })[0];

  const parsed = processor.post_process_generation(
    generatedText,
    TASK,
    image.size
  );

  post("analysis-result", {
    task: TASK,
    parsed,
    generatedText,
    imageSize: image.size,
  });
}

self.addEventListener("message", async (event) => {
  const message = event.data ?? {};
  try {
    if (message.type === "load-model") {
      await loadModel();
      return;
    }
    if (message.type === "analyze") {
      if (!(message.file instanceof Blob)) {
        throw new Error("Keine gültige Bilddatei empfangen.");
      }
      await analyze(message.file);
      return;
    }
    throw new Error(`Unbekannter Worker-Befehl: ${message.type}`);
  } catch (error) {
    post("error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : "",
    });
  }
});
