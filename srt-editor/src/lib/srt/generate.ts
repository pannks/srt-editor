import type { SubtitleBlock } from "../blocks/types";
import { formatSrtTime } from "./time";

/** Serialize blocks to SRT file content. Blocks are emitted in start-time order. */
export function blocksToSrt(blocks: SubtitleBlock[]): string {
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  return sorted
    .map(
      (b, i) =>
        `${i + 1}\n${formatSrtTime(b.start)} --> ${formatSrtTime(b.end)}\n${b.text.trim()}`,
    )
    .join("\n\n")
    .concat("\n");
}
