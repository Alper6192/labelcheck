export const APP_VERSION = "1.0.0";

export const MODEL_OPTIONS = {
  standard: {
    key: "standard",
    label: "PP-OCRv5 Standard (Zahlen/lateinische Zeichen)",
    textDetectionModelName: "PP-OCRv5_mobile_det",
    textRecognitionModelName: "PP-OCRv5_mobile_rec",
    textDetectionModelFile: "PP-OCRv5_mobile_det_onnx_infer.tar",
    textRecognitionModelFile: "PP-OCRv5_mobile_rec_onnx_infer.tar",
    description: "Offizielles eingebautes PP-OCRv5-Browsermodell. Für den ersten Machbarkeitstest mit Artikelnummern, Chargen, Gewichten und Kundennamen."
  }
};

export const QUALITY_PRESETS = {
  fast: {
    key: "fast",
    label: "Schnell",
    maxImageSide: 1500,
    textDetLimitSideLen: 736,
    textDetBoxThresh: 0.48,
    textRecScoreThresh: 0.25
  },
  balanced: {
    key: "balanced",
    label: "Ausgewogen",
    maxImageSide: 1800,
    textDetLimitSideLen: 960,
    textDetBoxThresh: 0.44,
    textRecScoreThresh: 0.20
  },
  accurate: {
    key: "accurate",
    label: "Genauer",
    maxImageSide: 2100,
    textDetLimitSideLen: 1280,
    textDetBoxThresh: 0.40,
    textRecScoreThresh: 0.15
  }
};
