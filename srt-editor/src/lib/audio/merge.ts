import type { RawSegment } from "../transcribe/client";
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
  for (let i = 0; i < sorted.length; i++) {
    const seg = sorted[i];
    const next = sorted[i + 1];
    // Keep each segment's own start; only trim its end so it does not overlap
    // the next segment. Clamping forward (rather than pushing starts up to the
    // previous end) keeps one oversized end — e.g. a bad chunk-boundary
    // segment — from collapsing every block after it to zero width.
    const start = seg.start;
    let end = Math.max(seg.end, start);
    if (next) end = Math.min(end, Math.max(next.start, start));
    blocks.push({ id: newBlockId(), start, end, text: seg.text });
  }
  return blocks;
}
