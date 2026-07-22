import type { RawSegment } from "../gemini/client";
import { newBlockId, type SubtitleBlock } from "../blocks/types";

/** Shift chunk-relative segment times by the chunk's absolute start offset. */
export function offsetSegments(
  segments: RawSegment[],
  offsetSec: number,
): RawSegment[] {
  return segments.map((s) => ({
    ...s,
    start: s.start + offsetSec,
    end: s.end + offsetSec,
  }));
}

/**
 * Combine per-chunk segment lists (already offset to absolute time) into an
 * ordered block list, clamping any overlap at chunk boundaries.
 */
export function segmentsToBlocks(segments: RawSegment[]): SubtitleBlock[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const blocks: SubtitleBlock[] = [];
  for (const seg of sorted) {
    const prev = blocks[blocks.length - 1];
    const start = prev ? Math.max(seg.start, prev.end) : seg.start;
    const end = Math.max(seg.end, start);
    blocks.push({ id: newBlockId(), start, end, text: seg.text });
  }
  return blocks;
}
