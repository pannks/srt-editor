import { MIN_BLOCK_DURATION } from "./ops";
import type { SubtitleBlock } from "./types";

const roundMs = (seconds: number) => Math.round(seconds * 1000) / 1000;

/**
 * Move every block by the same offset (negative = earlier). Blocks pushed
 * against zero are clamped there and keep at least the minimum duration, so a
 * large negative shift squashes the head of the list rather than producing
 * negative times.
 */
export function shiftBlocks(
  blocks: SubtitleBlock[],
  offsetSecs: number,
): SubtitleBlock[] {
  if (offsetSecs === 0) return blocks;
  return blocks.map((b) => {
    const start = roundMs(Math.max(0, b.start + offsetSecs));
    const end = roundMs(Math.max(start + MIN_BLOCK_DURATION, b.end + offsetSecs));
    return { ...b, start, end };
  });
}

/**
 * Multiply every time by the factor, anchored at 0:00 — the standard fix for
 * subtitle drift from a frame-rate mismatch (e.g. 25 → 23.976 fps ≈ ×1.0427).
 */
export function stretchBlocks(
  blocks: SubtitleBlock[],
  factor: number,
): SubtitleBlock[] {
  if (factor === 1) return blocks;
  if (!(factor > 0)) return blocks;
  return blocks.map((b) => {
    const start = roundMs(b.start * factor);
    const end = roundMs(Math.max(start + MIN_BLOCK_DURATION, b.end * factor));
    return { ...b, start, end };
  });
}
