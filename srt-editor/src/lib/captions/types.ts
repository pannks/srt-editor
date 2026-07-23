export type CaptionAnimation = "none" | "fade" | "pop" | "karaoke";

/**
 * How burned-in captions look. One global style for now, persisted with the
 * settings; positions are fractions of the video frame so the same style works
 * for 16:9 and 9:16 alike.
 */
export interface CaptionStyle {
  /** Family name as libass will resolve it — must be installed on this machine. */
  fontFamily: string;
  /** Percent of the video height, so the design survives resolution changes. */
  fontSizePct: number;
  bold: boolean;
  color: string;
  outlineColor: string;
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
  animation: CaptionAnimation;
  /** `""` shows the source line, a language code shows that translation. */
  language: string;
}

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  fontFamily: "Arial",
  fontSizePct: 5,
  bold: true,
  color: "#ffffff",
  outlineColor: "#000000",
  outlineWidth: 2,
  shadow: 1,
  bgEnabled: false,
  bgColor: "#000000",
  bgOpacity: 0.6,
  posX: 0.5,
  posY: 0.85,
  animation: "none",
  language: "",
};

export const MIN_FONT_PCT = 2;
export const MAX_FONT_PCT = 14;

/** The caption text a block contributes, honouring the language choice. */
export function captionText(
  block: { text: string; translations?: Record<string, string> },
  style: CaptionStyle,
): string {
  if (style.language === "") return block.text;
  return block.translations?.[style.language]?.trim() ?? "";
}
