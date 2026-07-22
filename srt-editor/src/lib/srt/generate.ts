import type { SubtitleBlock } from "../blocks/types";
import { formatSrtTime } from "./time";

export interface SrtOptions {
  /**
   * Language code to write instead of the source text. Blocks without that
   * translation fall back to the source, so the file never has empty cues.
   */
  lang?: string;
  /** Write the source line first and the translation under it. */
  bilingual?: boolean;
}

/** The text of one cue for the requested language pair. */
export function cueText(block: SubtitleBlock, options: SrtOptions = {}): string {
  const source = block.text.trim();
  if (!options.lang) return source;
  const translated = block.translations?.[options.lang]?.trim() ?? "";
  if (translated === "") return source;
  return options.bilingual ? `${source}\n${translated}` : translated;
}

/** Serialize blocks to SRT file content. Blocks are emitted in start-time order. */
export function blocksToSrt(
  blocks: SubtitleBlock[],
  options: SrtOptions = {},
): string {
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  return sorted
    .map(
      (b, i) =>
        `${i + 1}\n${formatSrtTime(b.start)} --> ${formatSrtTime(b.end)}\n${cueText(b, options)}`,
    )
    .join("\n\n")
    .concat("\n");
}
