import type { SubtitleBlock } from "../blocks/types";
import { cueText, type SrtOptions } from "../srt/generate";
import { formatVttTime } from "./time";

/** WebVTT reuses the SRT language/bilingual options. */
export type VttOptions = SrtOptions;

/** Escape the three characters WebVTT cue text treats as markup. */
export function escapeVttText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Serialize blocks to WebVTT file content. Blocks are emitted in start-time
 * order after the mandatory `WEBVTT` header. Language selection matches the SRT
 * generator, so the two formats export the same text.
 */
export function blocksToVtt(
  blocks: SubtitleBlock[],
  options: VttOptions = {},
): string {
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  const cues = sorted
    .map(
      (b) =>
        `${formatVttTime(b.start)} --> ${formatVttTime(b.end)}\n${escapeVttText(
          cueText(b, options),
        )}`,
    )
    .join("\n\n");
  return `WEBVTT\n\n${cues}\n`;
}
