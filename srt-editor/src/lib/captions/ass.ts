import type { SubtitleBlock } from "../blocks/types";
import { captionText, type CaptionLayer } from "./types";
import { wrapCaptionLines } from "./wrap";

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

function animationTags(layer: CaptionLayer): string {
  switch (layer.animation) {
    case "fade":
      return "\\fad(150,150)";
    case "pop":
      return "\\fscx60\\fscy60\\t(0,180,\\fscx100\\fscy100)";
    default:
      return "";
  }
}

export interface VideoDims {
  width: number;
  height: number;
}

/**
 * ASS `\an` numpad alignment: 1–3 bottom, 4–6 middle, 7–9 top; the column is
 * left/center/right. With `\pos` it decides which point of the text box sits
 * on the coordinate, and how wrapped lines align.
 */
export function assAlignment(layer: Pick<CaptionLayer, "alignH" | "alignV">): number {
  const col = { left: 1, center: 2, right: 3 }[layer.alignH];
  const row = { bottom: 0, middle: 3, top: 6 }[layer.alignV];
  return row + col;
}

/**
 * libass wraps at PlayResX − MarginL − MarginR even under `\pos`, so the wrap
 * width becomes a pair of margins around the anchor. Clamped to the frame, so
 * an anchor near an edge just wraps earlier on that side.
 */
export function wrapMargins(
  layer: Pick<CaptionLayer, "posX" | "alignH" | "widthPct">,
  dims: VideoDims,
): { marginL: number; marginR: number } {
  const x = layer.posX * dims.width;
  const w = layer.widthPct * dims.width;
  const left =
    layer.alignH === "left" ? x : layer.alignH === "right" ? x - w : x - w / 2;
  const right = left + w;
  return {
    marginL: Math.max(0, Math.round(left)),
    marginR: Math.max(0, Math.round(dims.width - right)),
  };
}

/** The `Style:` line for one layer, named `Caption{index}`. */
function styleLine(layer: CaptionLayer, index: number, dims: VideoDims): string {
  const fontSize = Math.max(8, Math.round((layer.fontSizePct / 100) * dims.height));
  // BorderStyle 3 draws BackColour as an opaque box behind the line.
  const borderStyle = layer.bgEnabled ? 3 : 1;
  const back = layer.bgEnabled
    ? assColor(layer.bgColor, (1 - layer.bgOpacity) * 255)
    : assColor("#000000", 128);
  return [
    `Caption${index}`,
    layer.fontFamily || "Arial",
    fontSize,
    assColor(layer.color),
    // Karaoke sweeps SecondaryColour → PrimaryColour; a dim grey reads well.
    assColor("#888888"),
    assColor(layer.outlineColor),
    back,
    layer.bold ? -1 : 0,
    0,
    0,
    0,
    100,
    100,
    0,
    0,
    borderStyle,
    layer.outlineWidth,
    layer.shadow,
    assAlignment(layer), // which point of the box the \pos tag anchors
    0,
    0,
    0,
    1,
  ].join(",");
}

/**
 * Karaoke across wrapped lines: each line gets its share of the duration by
 * length, then `karaokeText` distributes that within the line. Lines join with
 * the ASS hard break so the sweep spans the whole caption.
 */
function karaokeLines(lines: string[], durationSec: number): string {
  const weight = lines.reduce((sum, l) => sum + Math.max(1, l.length), 0);
  return lines
    .map((line) =>
      karaokeText(escapeAssText(line), durationSec * (Math.max(1, line.length) / weight)),
    )
    .join("\\N");
}

/** The `Dialogue:` lines one layer contributes across every block. */
function layerEvents(
  layer: CaptionLayer,
  index: number,
  blocks: SubtitleBlock[],
  dims: VideoDims,
): string[] {
  const x = Math.round(layer.posX * dims.width);
  const y = Math.round(layer.posY * dims.height);
  const fontPx = (layer.fontSizePct / 100) * dims.height;
  const maxWidthPx = layer.widthPct * dims.width;
  const tags = `\\an${assAlignment(layer)}\\pos(${x},${y})${animationTags(layer)}`;
  return blocks.flatMap((block) => {
    const raw = captionText(block, layer);
    if (raw === "") return [];
    // Pre-wrap with the shared breaker so the export matches the preview line
    // for line; WrapStyle 2 keeps libass from re-wrapping our breaks.
    const lines = wrapCaptionLines(
      raw,
      maxWidthPx,
      fontPx,
      layer.fontFamily || "Arial",
      layer.bold,
    );
    const body =
      layer.animation === "karaoke"
        ? karaokeLines(lines, block.end - block.start)
        : lines.map(escapeAssText).join("\\N");
    return [
      `Dialogue: 0,${assTime(block.start)},${assTime(block.end)},Caption${index},,0,0,0,,{${tags}}${body}`,
    ];
  });
}

export function buildAss(
  blocks: SubtitleBlock[],
  layers: CaptionLayer[],
  dims: VideoDims,
): string {
  const styles = layers.map((l, i) => `Style: ${styleLine(l, i, dims)}`).join("\n");
  const events = layers
    .flatMap((l, i) => layerEvents(l, i, blocks, dims))
    .join("\n");

  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${dims.width}
PlayResY: ${dims.height}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styles}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}
`;
}
