import { newBlockId, type SubtitleBlock } from "../blocks/types";
import { parseSrtTime } from "./time";

/** Parse SRT file content into subtitle blocks. Tolerates missing indices and CRLF. */
export function parseSrt(content: string): SubtitleBlock[] {
  const blocks: SubtitleBlock[] = [];
  const cues = content.replace(/\r\n/g, "\n").trim().split(/\n{2,}/);
  for (const cue of cues) {
    const lines = cue.split("\n").filter((l) => l.trim() !== "");
    if (lines.length === 0) continue;
    const timeLineIdx = lines.findIndex((l) => l.includes("-->"));
    if (timeLineIdx === -1) continue;
    const [startRaw, endRaw] = lines[timeLineIdx].split("-->");
    const text = lines
      .slice(timeLineIdx + 1)
      .join("\n")
      .trim();
    if (text === "") continue;
    blocks.push({
      id: newBlockId(),
      start: parseSrtTime(startRaw),
      end: parseSrtTime(endRaw),
      text,
    });
  }
  return blocks;
}
