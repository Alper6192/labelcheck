export const APP_VERSION = "0.2.5";
export const MODEL_ID = "onnx-community/Florence-2-base-ft";
export const MODEL_REVISION = "e88a44eaf3791a35eae0c5a47b3dbcd36e67eb6f";
export const FLORENCE_TASK = "<OCR_WITH_REGION>";

export const COMPARISON_PROFILE = Object.freeze({
  batch: { required: true, label: "Batch" },
  idh: { required: true, label: "IDH" },
  weight: { required: true, label: "Gewicht" },
});

export const MAX_IMAGE_SIDE = 1400;
export const JPEG_QUALITY = 0.9;
export const WEIGHT_TOLERANCE = 0.01;

export const FLORENCE_MAX_TOKENS = Object.freeze({
  product: 256,
  vda: 480,
  editorProduct: 192,
  editorVda: 320,
});
