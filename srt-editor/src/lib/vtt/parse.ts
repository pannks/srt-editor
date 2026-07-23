import { newBlockId, type SubtitleBlock } from "../blocks/types";
import { parseVttTime } from "./time";

/** Reverse of {@link escapeVttText}; enough for cue text round-trips. */
function unescapeVttText(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * Parse WebVTT file content into subtitle blocks. Tolerates CRLF and a missing
 * `WEBVTT` header, skips NOTE/STYLE/REGION and cue-identifier lines, and drops
 * the cue settings that may trail the `-->` line.
 */
export function parseVtt(content: string): SubtitleBlock[] {
  const blocks: SubtitleBlock[] = [];
  const body = content.replace(/\r\n/g, "\n").replace(/^﻿/, "");
  const cues = body.trim().split(/\n{2,}/);
  for (const cue of cues) {
    const lines = cue.split("\n").filter((l) => l.trim() !== "");
    if (lines.length === 0) continue;
    const head = lines[0].trim();
    // Header and named blocks carry no timing.
    if (/^WEBVTT/.test(head) || /^(NOTE|STYLE|REGION)\b/.test(head)) continue;
    const timeLineIdx = lines.findIndex((l) => l.includes("-->"));
    if (timeLineIdx === -1) continue;
    // Everything after `end` on the timing line is cue settings, not text.
    const [startRaw, rest] = lines[timeLineIdx].split("-->");
    const endRaw = rest.trim().split(/\s+/)[0];
    const text = unescapeVttText(
      lines
        .slice(timeLineIdx + 1)
        .join("\n")
        .trim(),
    );
    if (text === "") continue;
    blocks.push({
      id: newBlockId(),
      start: parseVttTime(startRaw),
      end: parseVttTime(endRaw),
      text,
    });
  }
  return blocks;
}
