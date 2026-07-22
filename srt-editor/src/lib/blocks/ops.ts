import { newBlockId, type SubtitleBlock } from "./types";

/** Shortest block the editor will produce, in seconds. */
export const MIN_BLOCK_DURATION = 0.05;

const roundMs = (seconds: number) => Math.round(seconds * 1000) / 1000;

function indexOfBlock(blocks: SubtitleBlock[], id: string): number {
  const i = blocks.findIndex((b) => b.id === id);
  if (i === -1) throw new Error(`block not found: ${id}`);
  return i;
}

/**
 * Join the two blocks' translations language by language. A language only one
 * side has is carried over as-is, so merging never silently drops a line.
 */
function mergeTranslations(
  a: SubtitleBlock,
  b: SubtitleBlock,
): Record<string, string> | undefined {
  const codes = new Set([
    ...Object.keys(a.translations ?? {}),
    ...Object.keys(b.translations ?? {}),
  ]);
  if (codes.size === 0) return undefined;
  const merged: Record<string, string> = {};
  for (const code of codes) {
    merged[code] = `${a.translations?.[code]?.trim() ?? ""} ${
      b.translations?.[code]?.trim() ?? ""
    }`.trim();
  }
  return merged;
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
    translations: mergeTranslations(prev, cur),
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
  // A translation of the whole line does not survive being cut in two, and
  // leaving half of it on one side would read as a translation of that half.
  const first: SubtitleBlock = {
    ...cur,
    end: cutTime,
    text: firstText,
    translations: undefined,
  };
  const second: SubtitleBlock = {
    id: newBlockId(),
    start: cutTime,
    end: cur.end,
    text: secondText,
  };
  return [...blocks.slice(0, i), first, second, ...blocks.slice(i + 1)];
}

/**
 * Cut a block in two at an exact caret position in its text. Unlike
 * `splitBlock` the caret may sit anywhere, mid-word included; whitespace at the
 * cut is dropped. Time splits proportionally to the characters on each side,
 * with both halves kept at `MIN_BLOCK_DURATION` where the block is long enough.
 * No-op when either side would be empty.
 */
export function splitBlockAtChar(
  blocks: SubtitleBlock[],
  id: string,
  charIndex: number,
): SubtitleBlock[] {
  const i = indexOfBlock(blocks, id);
  const cur = blocks[i];
  const at = Math.min(Math.max(0, charIndex), cur.text.length);
  const firstText = cur.text.slice(0, at).trim();
  const secondText = cur.text.slice(at).trim();
  if (firstText === "" || secondText === "") return blocks;

  const ratio = firstText.length / (firstText.length + secondText.length);
  const lower = cur.start + MIN_BLOCK_DURATION;
  const upper = Math.max(lower, cur.end - MIN_BLOCK_DURATION);
  const cutTime = roundMs(
    Math.min(Math.max(cur.start + (cur.end - cur.start) * ratio, lower), upper),
  );

  const first: SubtitleBlock = {
    ...cur,
    end: cutTime,
    text: firstText,
    translations: undefined,
  };
  const second: SubtitleBlock = {
    id: newBlockId(),
    start: cutTime,
    end: cur.end,
    text: secondText,
  };
  return [...blocks.slice(0, i), first, second, ...blocks.slice(i + 1)];
}

/**
 * What the Cut button does: split at the caret when the caret has text on both
 * sides, otherwise fall back to the middle word so the button always does
 * something useful.
 */
export function cutBlockAtCaret(
  blocks: SubtitleBlock[],
  id: string,
  caret: number | null,
): SubtitleBlock[] {
  if (caret != null) {
    const out = splitBlockAtChar(blocks, id, caret);
    if (out !== blocks) return out;
  }
  return splitBlock(blocks, id);
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

/** Hand-edit one language's line on one block. Blank removes that language. */
export function updateBlockTranslation(
  blocks: SubtitleBlock[],
  id: string,
  lang: string,
  text: string,
): SubtitleBlock[] {
  const i = indexOfBlock(blocks, id);
  return blocks.map((b, j) => {
    if (j !== i) return b;
    const translations = { ...b.translations, [lang]: text };
    if (text.trim() === "") delete translations[lang];
    return {
      ...b,
      translations:
        Object.keys(translations).length > 0 ? translations : undefined,
    };
  });
}

export function removeBlock(
  blocks: SubtitleBlock[],
  id: string,
): SubtitleBlock[] {
  return blocks.filter((b) => b.id !== id);
}
