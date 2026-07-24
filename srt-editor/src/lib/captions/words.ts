/**
 * Word-level segmentation and timing, shared by the live preview and the ASS
 * export so karaoke, highlight and one-word-at-a-time all reveal on exactly the
 * same schedule.
 *
 * Thai (and CJK) run words together with no spaces, so a `/\s+/` split lumps a
 * whole sentence into one "word". `Intl.Segmenter` does dictionary-based word
 * breaking per locale — the same engine the browser uses — so Thai captions get
 * real per-word timing. Where `Intl.Segmenter` is missing (old runtime, unit
 * tests in some environments) it falls back to whitespace splitting.
 */

import { canMeasure, widthOf } from "./wrap";

/** One word plus any trailing separators, and its share of the block time. */
export interface WordToken {
  /** Display text — the word plus trailing spaces/punctuation so it renders as
   *  written. Thai words carry no separator; English words keep their space. */
  text: string;
  /** Timing weight, roughly the visible character count. */
  weight: number;
}

/** A word placed on the timeline, in seconds. */
export interface TimedWord {
  text: string;
  start: number;
  end: number;
}

let cache: Map<string, Intl.Segmenter> | null = null;

/** A cached word segmenter for `locale`, or null where unsupported. */
function segmenter(locale: string): Intl.Segmenter | null {
  if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") {
    return null;
  }
  if (!cache) cache = new Map();
  const key = locale || "und";
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const seg = new Intl.Segmenter(locale || undefined, { granularity: "word" });
    cache.set(key, seg);
    return seg;
  } catch {
    return null;
  }
}

/** Whitespace fallback: keep each word's trailing spaces so it renders spaced. */
function whitespaceTokens(text: string): WordToken[] {
  const parts = text.match(/\S+\s*/g);
  if (!parts) return [];
  return parts.map((p) => ({ text: p, weight: Math.max(1, p.trim().length) }));
}

/**
 * Split caption text into word tokens. Newlines collapse to spaces first — the
 * caller re-wraps for layout — so a word never straddles a line break here.
 * Separators (spaces, punctuation) attach to the preceding word so nothing is
 * lost and Thai stays gap-free.
 */
export function tokenizeCaption(text: string, locale = ""): WordToken[] {
  const flat = text.replace(/\r?\n/g, " ");
  const seg = segmenter(locale);
  if (!seg) return whitespaceTokens(flat);

  const tokens: WordToken[] = [];
  for (const part of seg.segment(flat)) {
    if (part.isWordLike) {
      tokens.push({ text: part.segment, weight: Math.max(1, part.segment.length) });
    } else if (tokens.length > 0) {
      // Trailing space/punctuation rides along with the word before it.
      tokens[tokens.length - 1].text += part.segment;
    } else if (part.segment.trim() !== "") {
      // Leading punctuation with no word yet — keep it as its own token.
      tokens.push({ text: part.segment, weight: 1 });
    }
    // A leading run of pure whitespace is dropped.
  }
  return tokens.length > 0 ? tokens : whitespaceTokens(flat);
}

/**
 * Spread `[start, end]` across the tokens by weight. The last word absorbs any
 * rounding drift so the words always tile the block exactly.
 */
export function timeWords(
  tokens: WordToken[],
  start: number,
  end: number,
): TimedWord[] {
  if (tokens.length === 0) return [];
  const span = Math.max(0, end - start);
  const total = tokens.reduce((sum, t) => sum + t.weight, 0) || tokens.length;
  let cursor = start;
  return tokens.map((tok, i) => {
    const last = i === tokens.length - 1;
    const stop = last ? end : cursor + (span * tok.weight) / total;
    const word: TimedWord = { text: tok.text, start: cursor, end: stop };
    cursor = stop;
    return word;
  });
}

/** Convenience: tokenize then time in one call. */
export function timedWords(
  text: string,
  start: number,
  end: number,
  locale = "",
): TimedWord[] {
  return timeWords(tokenizeCaption(text, locale), start, end);
}

/**
 * Index of the word active at `time`, or -1 before the first. Words tile the
 * block, so this is the last word whose start has passed.
 */
export function activeWordIndex(words: TimedWord[], time: number): number {
  let idx = -1;
  for (let i = 0; i < words.length; i++) {
    if (time >= words[i].start) idx = i;
    else break;
  }
  return idx;
}

/**
 * Greedy-wrap timed words into rendered lines, keeping each word's timing. Uses
 * the same canvas measurer as the line wrapper so word-mode line breaks land
 * exactly where the static wrapper's would. Without a DOM (unit tests) every
 * word goes on one line — the export path always runs in the browser.
 */
export function layoutWords(
  words: TimedWord[],
  maxWidthPx: number,
  fontPx: number,
  family: string,
  bold: boolean,
): TimedWord[][] {
  if (words.length === 0) return [];
  if (!canMeasure() || maxWidthPx <= 0 || fontPx <= 0) return [words];

  const lines: TimedWord[][] = [];
  let line: TimedWord[] = [];
  const lineText = () => line.map((w) => w.text).join("");
  for (const word of words) {
    const candidate = lineText() + word.text;
    if (line.length === 0 || widthOf(candidate, fontPx, family, bold) <= maxWidthPx) {
      line.push(word);
    } else {
      lines.push(line);
      line = [word];
    }
  }
  if (line.length > 0) lines.push(line);
  return lines;
}
