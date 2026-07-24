export type CaptionAnimation =
  | "none"
  | "fade"
  | "pop"
  | "karaoke"
  | "highlight"
  | "word";

/** Every animation, in picker order. */
export const CAPTION_ANIMATIONS: CaptionAnimation[] = [
  "none",
  "fade",
  "pop",
  "karaoke",
  "highlight",
  "word",
];

/** Modes that reveal or highlight one word at a time (need word timing). */
export function isWordAnimation(a: CaptionAnimation): boolean {
  return a === "karaoke" || a === "highlight" || a === "word";
}

/** Where the caption box hangs off its anchor point, and how lines align. */
export type CaptionAlignH = "left" | "center" | "right";
export type CaptionAlignV = "top" | "middle" | "bottom";

/**
 * One line of burned-in caption. Several layers stack on the same video —
 * e.g. Thai over English over Chinese — each fully and independently styled.
 * Positions are fractions of the frame so a design survives any resolution.
 */
export interface CaptionLayer {
  id: string;
  /** `""` shows the source line, a language code shows that translation. */
  language: string;
  /** Family name; Google families are loaded for the preview and the export. */
  fontFamily: string;
  /** Percent of the video height, so the design survives resolution changes. */
  fontSizePct: number;
  bold: boolean;
  color: string;
  outlineColor: string;
  /** Accent colour for the active word in karaoke/highlight/word modes. */
  highlightColor: string;
  /** ASS outline width, roughly pixels at the video's own resolution. */
  outlineWidth: number;
  shadow: number;
  /** Opaque box behind the text instead of an outline. */
  bgEnabled: boolean;
  bgColor: string;
  /** 0–1; becomes the box alpha in the export. */
  bgOpacity: number;
  /** Caption anchor as fractions of the frame, 0,0 = top-left. */
  posX: number;
  posY: number;
  /**
   * Which point of the text box sits on posX/posY, doubling as the line
   * alignment for wrapped text (left/center/right).
   */
  alignH: CaptionAlignH;
  alignV: CaptionAlignV;
  /** Wrap width as a fraction of the frame width. */
  widthPct: number;
  animation: CaptionAnimation;
}

/** Fonts offered in the picker. Non-system ones come from Google Fonts. */
export interface FontChoice {
  family: string;
  google: boolean;
  /** A note shown in the picker, e.g. the scripts it covers. */
  note?: string;
}

export const CAPTION_FONTS: FontChoice[] = [
  { family: "Arial", google: false, note: "System" },
  { family: "Inter", google: true },
  { family: "Roboto", google: true },
  { family: "Montserrat", google: true },
  { family: "Poppins", google: true },
  { family: "Oswald", google: true, note: "Condensed" },
  { family: "Anton", google: true, note: "Heavy display" },
  { family: "Bebas Neue", google: true, note: "Tall caps" },
  { family: "Noto Sans", google: true },
  { family: "Noto Serif", google: true },
  { family: "Kanit", google: true, note: "ไทย · Thai" },
  { family: "Prompt", google: true, note: "ไทย · Thai" },
  { family: "Sarabun", google: true, note: "ไทย · Thai" },
  { family: "Noto Sans Thai", google: true, note: "ไทย · Thai" },
  { family: "Noto Sans SC", google: true, note: "简体 · Chinese" },
  { family: "Noto Sans JP", google: true, note: "日本語 · Japanese" },
  { family: "Noto Sans KR", google: true, note: "한국어 · Korean" },
];

/** Families that must be fetched from Google Fonts, for the loader and export. */
export const GOOGLE_FONT_FAMILIES = CAPTION_FONTS.filter((f) => f.google).map(
  (f) => f.family,
);

export const MIN_FONT_PCT = 2;
export const MAX_FONT_PCT = 14;

/** Every field of a layer except its identity — the shared starting point. */
const BASE_LAYER: Omit<CaptionLayer, "id" | "language" | "posY"> = {
  fontFamily: "Arial",
  fontSizePct: 5,
  bold: true,
  color: "#ffffff",
  outlineColor: "#000000",
  highlightColor: "#ffd400",
  outlineWidth: 2,
  shadow: 1,
  bgEnabled: false,
  bgColor: "#000000",
  bgOpacity: 0.6,
  posX: 0.5,
  alignH: "center",
  alignV: "middle",
  widthPct: 0.9,
  animation: "none",
};

let layerSeq = 0;
/** Stable-ish id without pulling crypto into the reducers/tests. */
function layerId(): string {
  layerSeq += 1;
  return `layer-${Date.now().toString(36)}-${layerSeq}`;
}

export function makeCaptionLayer(overrides: Partial<CaptionLayer> = {}): CaptionLayer {
  return { id: layerId(), language: "", posY: 0.85, ...BASE_LAYER, ...overrides };
}

/** Fill any missing field on a stored layer, so old snapshots stay valid. */
export function normalizeLayer(raw: Partial<CaptionLayer>): CaptionLayer {
  return { ...makeCaptionLayer(), ...raw, id: raw.id ?? layerId() };
}

export const DEFAULT_CAPTION_LAYERS: CaptionLayer[] = [makeCaptionLayer()];

/**
 * Where to drop a new layer: stacked just above the current topmost one, so
 * languages don't land on top of each other.
 */
export function nextLayerPosY(layers: CaptionLayer[]): number {
  const highest = Math.min(...layers.map((l) => l.posY), 0.85);
  return Math.max(0.08, highest - 0.12);
}

/** The caption text a block contributes to a layer, honouring its language. */
export function captionText(
  block: { text: string; translations?: Record<string, string> },
  layer: Pick<CaptionLayer, "language">,
): string {
  if (layer.language === "") return block.text;
  return block.translations?.[layer.language]?.trim() ?? "";
}
