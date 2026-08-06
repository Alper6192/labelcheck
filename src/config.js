export const APP_VERSION = "0.3.0";

export const MODEL_OPTIONS = {
  latin: {
    key: "latin",
    label: "Lateinisch/Deutsch (empfohlen)",
    lang: "de",
    description: "PP-OCRv5 Latin-Modell für Deutsch und weitere lateinische Sprachen."
  },
  english: {
    key: "english",
    label: "Englisch/Zahlen (Vergleichstest)",
    lang: "en",
    description: "Kleineres englisches PP-OCRv5-Modell für englische Texte und Zahlen."
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
