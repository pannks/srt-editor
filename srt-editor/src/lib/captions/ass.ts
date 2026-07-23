import type { SubtitleBlock } from "../blocks/types";
import { captionText, type CaptionStyle } from "./types";

/**
 * Build an ASS (Advanced SubStation) script for ffmpeg's libass filter.
 *
 * Kept in TypeScript, like the SRT writer, so it stays unit-tested; Rust only
 * writes the string to a temp file and hands it to ffmpeg.
 */

/** `#rrggbb` → ASS `&HAABBGGRR` (ASS stores blue-green-red, alpha 0 = opaque). */
export function assColor(hex: string, alpha = 0): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const rgb = m ? m[1] : "ffffff";
  const r = rgb.slice(0, 2);
  const g = rgb.slice(2, 4);
  const b = rgb.slice(4, 6);
  const a = Math.min(255, Math.max(0, Math.round(alpha)))
    .toString(16)
    .padStart(2, "0");
  return `&H${a}${b}${g}${r}`.toUpperCase();
}

/** Seconds → `h:mm:ss.cc` (centiseconds, as ASS expects). */
export function assTime(seconds: number): string {
  // Round once, in centiseconds, so 61.235 cannot land on 23cs via float error.
  const totalCs = Math.max(0, Math.round(seconds * 100));
  const cs = totalCs % 100;
  const total = Math.floor(totalCs / 100);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs)}`;
}

/** Braces open override blocks in ASS; newlines are their own token. */
export function escapeAssText(text: string): string {
  return text
    .replace(/\{/g, "(")
    .replace(/\}/g, ")")
    .replace(/\r?\n/g, "\\N");
}

/** Karaoke: one `\k` per word, its share of the block proportional to length. */
export function karaokeText(text: string, durationSec: number): string {
  const words = text.split(/\s+/).filter((w) => w !== "");
  if (words.length === 0) return text;
  const totalCs = Math.max(words.length, Math.round(durationSec * 100));
  const weight = words.reduce((sum, w) => sum + w.length, 0);
  let spent = 0;
  return words
    .map((word, i) => {
      const cs =
        i === words.length - 1
          ? totalCs - spent // the last word absorbs the rounding error
          : Math.max(1, Math.round((totalCs * word.length) / weight));
      spent += cs;
      return `{\\k${cs}}${word}`;
    })
    .join(" ");
}

function animationTags(style: CaptionStyle): string {
  switch (style.animation) {
    case "fade":
      return "\\fad(150,150)";
    case "pop":
      return "\\fscx70\\fscy70\\t(0,150,\\fscx100\\fscy100)";
    default:
      return "";
  }
}

export interface VideoDims {
  width: number;
  height: number;
}

export function buildAss(
  blocks: SubtitleBlock[],
  style: CaptionStyle,
  dims: VideoDims,
): string {
  const fontSize = Math.max(8, Math.round((style.fontSizePct / 100) * dims.height));
  const x = Math.round(style.posX * dims.width);
  const y = Math.round(style.posY * dims.height);
  // BorderStyle 3 draws BackColour as an opaque box behind the line.
  const borderStyle = style.bgEnabled ? 3 : 1;
  const back = style.bgEnabled
    ? assColor(style.bgColor, (1 - style.bgOpacity) * 255)
    : assColor("#000000", 128);
  // Karaoke sweeps SecondaryColour → PrimaryColour; a dim grey reads well.
  const styleLine = [
    "Caption",
    style.fontFamily || "Arial",
    fontSize,
    assColor(style.color),
    assColor("#888888"),
    assColor(style.outlineColor),
    back,
    style.bold ? -1 : 0,
    0,
    0,
    0,
    100,
    100,
    0,
    0,
    borderStyle,
    style.outlineWidth,
    style.shadow,
    5, // \an5: the position tag anchors the caption's centre
    0,
    0,
    0,
    1,
  ].join(",");

  const events = blocks
    .map((block) => {
      const raw = captionText(block, style);
      if (raw === "") return null;
      const text =
        style.animation === "karaoke"
          ? karaokeText(escapeAssText(raw), block.end - block.start)
          : escapeAssText(raw);
      const tags = `\\an5\\pos(${x},${y})${animationTags(style)}`;
      return `Dialogue: 0,${assTime(block.start)},${assTime(block.end)},Caption,,0,0,0,,{${tags}}${text}`;
    })
    .filter((line): line is string => line !== null)
    .join("\n");

  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${dims.width}
PlayResY: ${dims.height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ${styleLine}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}
`;
}
