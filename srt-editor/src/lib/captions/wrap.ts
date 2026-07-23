/**
 * Line-breaking shared by the live preview and the ASS export, so both wrap at
 * exactly the same points and the exported video matches what the studio shows.
 *
 * The preview measures at its small on-screen size and the export at the video's
 * full resolution, but both pass a font size and max width scaled from the same
 * fractions — and canvas text width scales linearly with the font size — so the
 * break indices come out identical at either scale.
 *
 * Outside a DOM (unit tests) there is no canvas to measure with, so the text is
 * returned unwrapped; the export path always runs in the browser.
 */

let ctx: CanvasRenderingContext2D | null | undefined;

function measurer(): CanvasRenderingContext2D | null {
  if (ctx !== undefined) return ctx;
  ctx =
    typeof document !== "undefined"
      ? document.createElement("canvas").getContext("2d")
      : null;
  return ctx;
}

function widthOf(
  text: string,
  fontPx: number,
  family: string,
  bold: boolean,
): number {
  const c = measurer();
  if (!c) return 0;
  c.font = `${bold ? 700 : 400} ${fontPx}px "${family}", sans-serif`;
  return c.measureText(text).width;
}

/**
 * Fallback estimate of how much bigger libass must set `Fontsize` than the CSS
 * `font-size` for the burned glyphs to match the preview.
 *
 * A browser sizes the em-square to `font-size`; libass instead sizes so the
 * font's own ascent+descent fills `Fontsize`, so the same nominal number
 * renders smaller — and by a different amount per font. The exact factor is the
 * font's `(usWinAscent + usWinDescent)/em`, read from the font bytes by the Rust
 * `font_metric_ratios` command. Canvas `fontBoundingBox` approximates it for
 * Latin/system fonts (Arial ~1.117) but WebKit clamps it badly for Thai/CJK
 * (Kanit reads ~1.15 vs the true ~1.58), so this is only the fallback when the
 * measured ratio is unavailable — e.g. a system font we could not read.
 *
 * Returns 1 outside a DOM (unit tests) or without the font-bounding-box metrics.
 */
export function assFontScale(family: string, bold: boolean): number {
  const c = measurer();
  if (!c) return 1;
  const em = 100;
  c.font = `${bold ? 700 : 400} ${em}px "${family}", sans-serif`;
  const m = c.measureText("Hg");
  const asc = m.fontBoundingBoxAscent;
  const desc = m.fontBoundingBoxDescent;
  if (typeof asc !== "number" || typeof desc !== "number") return 1;
  const ratio = (asc + desc) / em;
  // Guard against a bogus measurement collapsing or exploding the size.
  return ratio > 0.5 && ratio < 3 ? ratio : 1;
}

/** Break one word that is itself wider than the line (long CJK/Thai runs). */
function hardBreak(
  word: string,
  max: number,
  fontPx: number,
  family: string,
  bold: boolean,
): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const ch of word) {
    const next = cur + ch;
    if (cur && widthOf(next, fontPx, family, bold) > max) {
      lines.push(cur);
      cur = ch;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Greedy word wrap to `maxWidthPx`. Honours existing hard breaks in the text,
 * splits only on whitespace, and character-breaks any single word too wide to
 * fit. Returns one entry per rendered line.
 */
export function wrapCaptionLines(
  text: string,
  maxWidthPx: number,
  fontPx: number,
  family: string,
  bold: boolean,
): string[] {
  const paragraphs = text.split(/\r?\n/);
  if (!measurer() || maxWidthPx <= 0 || fontPx <= 0) return paragraphs;

  const out: string[] = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter((w) => w !== "");
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || widthOf(candidate, fontPx, family, bold) <= maxWidthPx) {
        line = candidate;
        continue;
      }
      // Word doesn't fit on the current line.
      out.push(line);
      if (widthOf(word, fontPx, family, bold) > maxWidthPx) {
        const pieces = hardBreak(word, maxWidthPx, fontPx, family, bold);
        line = pieces.pop() ?? "";
        out.push(...pieces);
      } else {
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}
