import { newBlockId, type SubtitleBlock } from "./types";

/** Shortest block the editor will produce, in seconds. */
export const MIN_BLOCK_DURATION = 0.05;

const roundMs = (seconds: number) => Math.round(seconds * 1000) / 1000;

function indexOfBlock(blocks: SubtitleBlock[], id: string): number {
  const i = blocks.findIndex((b) => b.id === id);
  if (i === -1) throw new Error(`block not found: ${id}`);
  return i;
}

/** Merge the block into the one before it: previous block absorbs text and end time. */
export function mergeWithPrevious(
  blocks: SubtitleBlock[],
  id: string,
): SubtitleBlock[] {
  const i = indexOfBlock(blocks, id);
  if (i === 0) return blocks;
  const prev = blocks[i - 1];
  const cur = blocks[i];
  const merged: SubtitleBlock = {
    ...prev,
    end: Math.max(prev.end, cur.end),
    text: `${prev.text.trim()} ${cur.text.trim()}`.trim(),
  };
  return [...blocks.slice(0, i - 1), merged, ...blocks.slice(i + 1)];
}

/** Merge the block with the one after it: block absorbs next block's text and end time. */
export function mergeWithNext(
  blocks: SubtitleBlock[],
  id: string,
): SubtitleBlock[] {
  const i = indexOfBlock(blocks, id);
  if (i === blocks.length - 1) return blocks;
  return mergeWithPrevious(blocks, blocks[i + 1].id);
}

/**
 * Cut a block into two at a word boundary. `wordIndex` is the index of the first
 * word of the second half; defaults to the middle. Time splits proportionally
 * to character count of each half. No-op if the block has fewer than 2 words.
 */
export function splitBlock(
  blocks: SubtitleBlock[],
  id: string,
  wordIndex?: number,
): SubtitleBlock[] {
  const i = indexOfBlock(blocks, id);
  const cur = blocks[i];
  const words = cur.text.trim().split(/\s+/);
  if (words.length < 2) return blocks;
  const at = Math.min(
    Math.max(1, wordIndex ?? Math.ceil(words.length / 2)),
    words.length - 1,
  );
  const firstText = words.slice(0, at).join(" ");
  const secondText = words.slice(at).join(" ");
  const ratio = firstText.length / (firstText.length + secondText.length);
  const cutTime = cur.start + (cur.end - cur.start) * ratio;
  const first: SubtitleBlock = { ...cur, end: cutTime, text: firstText };
  const second: SubtitleBlock = {
    id: newBlockId(),
    start: cutTime,
    end: cur.end,
    text: secondText,
  };
  return [...blocks.slice(0, i), first, second, ...blocks.slice(i + 1)];
}

/**
 * Retime one block, then push its neighbours out of the way so no two blocks
 * overlap. Only the neighbours that actually collide move: the ripple stops at
 * the first block on each side that already clears the new boundary. Blocks
 * squeezed by the ripple keep at least `MIN_BLOCK_DURATION`.
 */
export function setBlockTimes(
  blocks: SubtitleBlock[],
  id: string,
  start: number,
  end: number,
): SubtitleBlock[] {
  const i = indexOfBlock(blocks, id);
  const next = [...blocks];

  // Every earlier block still needs room for its own minimum duration, so a
  // block can never start before that much time has elapsed.
  const earliestStart = i * MIN_BLOCK_DURATION;
  const newStart = roundMs(Math.max(earliestStart, start));
  const newEnd = roundMs(Math.max(end, newStart + MIN_BLOCK_DURATION));
  next[i] = { ...next[i], start: newStart, end: newEnd };

  for (let j = i - 1; j >= 0; j--) {
    const limit = next[j + 1].start;
    if (next[j].end <= limit) break;
    const end = roundMs(limit);
    const start = roundMs(Math.max(0, Math.min(next[j].start, end - MIN_BLOCK_DURATION)));
    next[j] = { ...next[j], start, end };
  }

  for (let j = i + 1; j < next.length; j++) {
    const limit = next[j - 1].end;
    if (next[j].start >= limit) break;
    const start = roundMs(limit);
    const end = roundMs(Math.max(next[j].end, start + MIN_BLOCK_DURATION));
    next[j] = { ...next[j], start, end };
  }

  return next;
}

export function updateBlockText(
  blocks: SubtitleBlock[],
  id: string,
  text: string,
): SubtitleBlock[] {
  const i = indexOfBlock(blocks, id);
  return blocks.map((b, j) => (j === i ? { ...b, text } : b));
}

export function removeBlock(
  blocks: SubtitleBlock[],
  id: string,
): SubtitleBlock[] {
  return blocks.filter((b) => b.id !== id);
}
