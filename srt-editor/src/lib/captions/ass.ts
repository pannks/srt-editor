import type { SubtitleBlock } from "../blocks/types";
import { captionText, type CaptionLayer } from "./types";
import { assFontScale, wrapCaptionLines } from "./wrap";
import { layoutWords, timedWords, type TimedWord } from "./words";

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

/**
 * Karaoke: one `\k` per word, its centisecond share taken from real word
 * timing (Thai/CJK segmented by dictionary, not spaces). The last word absorbs
 * rounding so the shares sum to the block's duration.
 */
export function karaokeText(text: string, durationSec: number, locale = ""): string {
  const words = timedWords(text, 0, Math.max(0, durationSec), locale);
  if (words.length === 0) return text;
  const totalCs = Math.max(words.length, Math.round(durationSec * 100));
  let spent = 0;
  return words
    .map((word, i) => {
      const share = Math.round((word.end - word.start) * 100);
      const cs =
        i === words.length - 1
          ? Math.max(1, totalCs - spent) // last word absorbs the rounding error
          : Math.max(1, share);
      spent += cs;
      return `{\\k${cs}}${escapeAssText(word.text)}`;
    })
    .join("");
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

/** Font family → libass `Fontsize` correction, from `font_metric_ratios`. */
export type FontRatios = Record<string, number>;

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
function styleLine(
  layer: CaptionLayer,
  index: number,
  dims: VideoDims,
  ratios: FontRatios,
): string {
  // The preview sizes the CSS em-square to this height; libass renders the same
  // nominal Fontsize smaller, so scale it up by the font's own win-metric ratio
  // to match the preview. Prefer the exact ratio read from the font bytes; fall
  // back to the canvas estimate. See `assFontScale`.
  const family = layer.fontFamily || "Arial";
  const cssPx = (layer.fontSizePct / 100) * dims.height;
  const scale = ratios[family] ?? assFontScale(family, layer.bold);
  const fontSize = Math.max(8, Math.round(cssPx * scale));
  // BorderStyle 3 draws BackColour as an opaque box behind the line.
  const borderStyle = layer.bgEnabled ? 3 : 1;
  const back = layer.bgEnabled
    ? assColor(layer.bgColor, (1 - layer.bgOpacity) * 255)
    : assColor("#000000", 128);
  // Karaoke `\k` sweeps SecondaryColour (unread) → PrimaryColour (read/sung).
  // So the read colour is the layer's highlight and the unread is its text
  // colour — both user-set, nothing hardcoded. Other modes never sweep, so
  // Primary is just the text colour and Secondary is unused.
  const isKaraoke = layer.animation === "karaoke";
  const primary = assColor(isKaraoke ? layer.highlightColor : layer.color);
  const secondary = assColor(layer.color);
  return [
    `Caption${index}`,
    layer.fontFamily || "Arial",
    fontSize,
    primary,
    secondary,
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
 * Karaoke body across wrapped lines. Words are laid out with the shared
 * measurer so breaks match the preview, then each carries its `\k` share; lines
 * join with the ASS hard break so the sweep spans the whole caption.
 */
function karaokeBody(lines: TimedWord[][]): string {
  return lines
    .map((line) =>
      line
        .map((w) => {
          const cs = Math.max(1, Math.round((w.end - w.start) * 100));
          return `{\\k${cs}}${escapeAssText(w.text)}`;
        })
        .join(""),
    )
    .join("\\N");
}

/**
 * Highlight body for the word active during one slice: the full caption, with
 * the active word recoloured to the accent and the rest at the base colour.
 */
function highlightBody(
  lines: TimedWord[][],
  activeStart: number,
  base: string,
  accent: string,
): string {
  return lines
    .map((line) =>
      line
        .map((w) => {
          const esc = escapeAssText(w.text);
          return w.start === activeStart
            ? `{\\c${accent}}${esc}{\\c${base}}`
            : esc;
        })
        .join(""),
    )
    .join("\\N");
}

/** Escape + trim a word for one-word-at-a-time mode (drops its trailing space). */
function loneWord(text: string): string {
  return escapeAssText(text.trim());
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
  const family = layer.fontFamily || "Arial";
  const anchor = `\\an${assAlignment(layer)}\\pos(${x},${y})`;
  const style = `Caption${index}`;
  const line = (start: number, end: number, tags: string, body: string) =>
    `Dialogue: 0,${assTime(start)},${assTime(end)},${style},,0,0,0,,{${tags}}${body}`;

  return blocks.flatMap((block) => {
    const raw = captionText(block, layer);
    if (raw === "") return [];

    // karaoke / highlight lay text out word by word so timing and line breaks
    // both come from the real words; the plainer modes pre-wrap whole lines.
    if (layer.animation === "karaoke" || layer.animation === "highlight") {
      const words = timedWords(raw, block.start, block.end, layer.language);
      const lines = layoutWords(words, maxWidthPx, fontPx, family, layer.bold);
      if (layer.animation === "karaoke") {
        return [line(block.start, block.end, anchor, karaokeBody(lines))];
      }
      // Highlight: one event per word, each redrawing the caption with that
      // word accented. Consecutive words that share a start (shouldn't happen)
      // still produce valid, overlapping-free slices.
      const base = assColor(layer.color);
      const accent = assColor(layer.highlightColor);
      return words.map((w) =>
        line(w.start, w.end, anchor, highlightBody(lines, w.start, base, accent)),
      );
    }

    if (layer.animation === "word") {
      // One word at a time, each popping in over its own slice.
      const words = timedWords(raw, block.start, block.end, layer.language);
      const pop = "\\fscx70\\fscy70\\t(0,120,\\fscx100\\fscy100)";
      return words.map((w) => line(w.start, w.end, `${anchor}${pop}`, loneWord(w.text)));
    }

    // none / fade / pop: pre-wrap with the shared breaker; WrapStyle 2 keeps
    // libass from re-wrapping our breaks.
    const lines = wrapCaptionLines(raw, maxWidthPx, fontPx, family, layer.bold);
    const body = lines.map(escapeAssText).join("\\N");
    return [line(block.start, block.end, `${anchor}${animationTags(layer)}`, body)];
  });
}

export function buildAss(
  blocks: SubtitleBlock[],
  layers: CaptionLayer[],
  dims: VideoDims,
  ratios: FontRatios = {},
): string {
  const styles = layers
    .map((l, i) => `Style: ${styleLine(l, i, dims, ratios)}`)
    .join("\n");
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
