import type { SubtitleBlock } from "./types";

/** The block covering `time`, or null in a gap. Blocks are half-open [start, end). */
export function findActiveBlock(
  blocks: SubtitleBlock[],
  time: number,
): SubtitleBlock | null {
  return blocks.find((b) => time >= b.start && time < b.end) ?? null;
}
