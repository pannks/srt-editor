import { describe, expect, it } from "vitest";
import {
  mergeWithPrevious,
  mergeWithNext,
  splitBlock,
  splitBlockAtChar,
  cutBlockAtCaret,
  setBlockTimes,
  updateBlockText,
  removeBlock,
  updateBlockTranslation,
  MIN_BLOCK_DURATION,
} from "./ops";
import { findActiveBlock } from "./active";
import type { SubtitleBlock } from "./types";

const blocks = (): SubtitleBlock[] => [
  { id: "a", start: 0, end: 1, text: "one" },
  { id: "b", start: 1, end: 2, text: "two" },
  { id: "c", start: 2, end: 3, text: "three" },
];

describe("mergeWithPrevious", () => {
  it("absorbs text and end time into the previous block", () => {
    const out = mergeWithPrevious(blocks(), "b");
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: "a", start: 0, end: 2, text: "one two" });
    expect(out[1].id).toBe("c");
  });

  it("is a no-op on the first block", () => {
    expect(mergeWithPrevious(blocks(), "a")).toEqual(blocks());
  });

  it("throws for unknown id", () => {
    expect(() => mergeWithPrevious(blocks(), "zzz")).toThrow();
  });
});

describe("mergeWithNext", () => {
  it("absorbs the next block", () => {
    const out = mergeWithNext(blocks(), "b");
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ id: "b", start: 1, end: 3, text: "two three" });
  });

  it("is a no-op on the last block", () => {
    expect(mergeWithNext(blocks(), "c")).toEqual(blocks());
  });
});

describe("splitBlock", () => {
  it("splits at the middle word by default, time proportional to text", () => {
    const out = splitBlock(
      [{ id: "a", start: 0, end: 4, text: "aa bb cc dd" }],
      "a",
    );
    expect(out).toHaveLength(2);
    expect(out[0].text).toBe("aa bb");
    expect(out[1].text).toBe("cc dd");
    expect(out[0].end).toBeCloseTo(2);
    expect(out[1].start).toBeCloseTo(2);
    expect(out[1].end).toBe(4);
  });

  it("splits at a given word index", () => {
    const out = splitBlock(
      [{ id: "a", start: 0, end: 3, text: "x y z" }],
      "a",
      1,
    );
    expect(out[0].text).toBe("x");
    expect(out[1].text).toBe("y z");
  });

  it("clamps out-of-range word index", () => {
    const out = splitBlock(
      [{ id: "a", start: 0, end: 3, text: "x y z" }],
      "a",
      99,
    );
    expect(out[0].text).toBe("x y");
    expect(out[1].text).toBe("z");
  });

  it("is a no-op for single-word blocks", () => {
    const single = [{ id: "a", start: 0, end: 1, text: "word" }];
    expect(splitBlock(single, "a")).toEqual(single);
  });
});

describe("splitBlockAtChar", () => {
  const one = (text: string, end = 4): SubtitleBlock[] => [
    { id: "a", start: 0, end, text },
  ];

  it("cuts at the caret, keeping both sides in order", () => {
    const out = splitBlockAtChar(one("hello there world"), "a", 11);
    expect(out.map((b) => b.text)).toEqual(["hello there", "world"]);
    expect(out[0].start).toBe(0);
    expect(out[0].end).toBe(out[1].start);
    expect(out[1].end).toBe(4);
  });

  it("cuts inside a word", () => {
    const out = splitBlockAtChar(one("abcdef"), "a", 3);
    expect(out.map((b) => b.text)).toEqual(["abc", "def"]);
    expect(out[0].end).toBeCloseTo(2);
  });

  it("drops the whitespace at the cut", () => {
    const out = splitBlockAtChar(one("aa   bb"), "a", 3);
    expect(out.map((b) => b.text)).toEqual(["aa", "bb"]);
  });

  it("is a no-op when one side would be empty", () => {
    const blocks = one("hello");
    expect(splitBlockAtChar(blocks, "a", 0)).toEqual(blocks);
    expect(splitBlockAtChar(blocks, "a", 5)).toEqual(blocks);
    expect(splitBlockAtChar(one("  hi"), "a", 2)).toEqual(one("  hi"));
  });

  it("keeps both halves at the minimum duration on very short blocks", () => {
    const out = splitBlockAtChar(one("a bbbbbbbbbb", 0.06), "a", 1);
    expect(out[0].end - out[0].start).toBeGreaterThanOrEqual(MIN_BLOCK_DURATION);
    expect(out[1].start).toBeLessThanOrEqual(out[1].end);
  });

  it("clamps a caret past the end of the text", () => {
    const blocks = one("hello world");
    expect(splitBlockAtChar(blocks, "a", 999)).toEqual(blocks);
  });
});

describe("cutBlockAtCaret", () => {
  it("uses the caret when it has text on both sides", () => {
    const out = cutBlockAtCaret(
      [{ id: "a", start: 0, end: 4, text: "one two three" }],
      "a",
      3,
    );
    expect(out.map((b) => b.text)).toEqual(["one", "two three"]);
  });

  it("falls back to the middle word with no caret", () => {
    const out = cutBlockAtCaret(
      [{ id: "a", start: 0, end: 4, text: "aa bb cc dd" }],
      "a",
      null,
    );
    expect(out.map((b) => b.text)).toEqual(["aa bb", "cc dd"]);
  });

  it("falls back to the middle word when the caret sits at an edge", () => {
    const out = cutBlockAtCaret(
      [{ id: "a", start: 0, end: 4, text: "aa bb cc dd" }],
      "a",
      0,
    );
    expect(out.map((b) => b.text)).toEqual(["aa bb", "cc dd"]);
  });
});

describe("setBlockTimes", () => {
  const noOverlap = (out: SubtitleBlock[]) =>
    out.every((b, i) => b.end > b.start && (i === 0 || b.start >= out[i - 1].end));

  it("retimes without touching neighbours that still clear", () => {
    const out = setBlockTimes(blocks(), "b", 1.2, 1.8);
    expect(out[1]).toMatchObject({ start: 1.2, end: 1.8 });
    expect(out[0]).toEqual(blocks()[0]);
    expect(out[2]).toEqual(blocks()[2]);
  });

  it("pulls the previous block's end back when the start moves earlier", () => {
    const out = setBlockTimes(blocks(), "b", 0.4, 2);
    expect(out[0]).toMatchObject({ start: 0, end: 0.4 });
    expect(out[1]).toMatchObject({ start: 0.4, end: 2 });
    expect(noOverlap(out)).toBe(true);
  });

  it("pushes the next block's start out when the end moves later", () => {
    const out = setBlockTimes(blocks(), "b", 1, 2.6);
    expect(out[1]).toMatchObject({ start: 1, end: 2.6 });
    expect(out[2]).toMatchObject({ start: 2.6, end: 3 });
    expect(noOverlap(out)).toBe(true);
  });

  it("ripples across several blocks and keeps a minimum duration", () => {
    const out = setBlockTimes(blocks(), "a", 0, 2.99);
    expect(out[1].start).toBeCloseTo(2.99);
    expect(out[1].end).toBeCloseTo(2.99 + MIN_BLOCK_DURATION);
    expect(out[2].start).toBeCloseTo(2.99 + MIN_BLOCK_DURATION);
    expect(noOverlap(out)).toBe(true);
  });

  it("ripples backwards across several blocks", () => {
    const out = setBlockTimes(blocks(), "c", 0.9, 3);
    expect(out[2].start).toBeCloseTo(0.9);
    expect(out[1].end).toBeCloseTo(0.9);
    expect(out[0].end).toBeLessThanOrEqual(out[1].start);
    expect(noOverlap(out)).toBe(true);
  });

  it("refuses to start so early that earlier blocks would vanish", () => {
    const out = setBlockTimes(blocks(), "c", 0, 3);
    // Two blocks precede it, each needing MIN_BLOCK_DURATION.
    expect(out[2].start).toBeCloseTo(2 * MIN_BLOCK_DURATION);
    expect(out.every((b) => b.end - b.start >= MIN_BLOCK_DURATION - 1e-9)).toBe(
      true,
    );
    expect(noOverlap(out)).toBe(true);
  });

  it("clamps a negative start and an inverted range", () => {
    const out = setBlockTimes(blocks(), "a", -5, -9);
    expect(out[0].start).toBe(0);
    expect(out[0].end).toBeCloseTo(MIN_BLOCK_DURATION);
  });

  it("rounds to whole milliseconds", () => {
    const out = setBlockTimes(blocks(), "b", 1.00049, 1.9999);
    expect(out[1]).toMatchObject({ start: 1, end: 2 });
  });
});

describe("findActiveBlock", () => {
  it("matches the half-open range and returns null in gaps", () => {
    const list = [
      { id: "a", start: 0, end: 1, text: "one" },
      { id: "b", start: 2, end: 3, text: "two" },
    ];
    expect(findActiveBlock(list, 0)?.id).toBe("a");
    expect(findActiveBlock(list, 0.99)?.id).toBe("a");
    expect(findActiveBlock(list, 1)).toBeNull();
    expect(findActiveBlock(list, 2.5)?.id).toBe("b");
    expect(findActiveBlock(list, 9)).toBeNull();
  });
});

describe("updateBlockText / removeBlock", () => {
  it("updates text immutably", () => {
    const input = blocks();
    const out = updateBlockText(input, "b", "TWO");
    expect(out[1].text).toBe("TWO");
    expect(input[1].text).toBe("two");
  });

  it("removes a block", () => {
    expect(removeBlock(blocks(), "b").map((b) => b.id)).toEqual(["a", "c"]);
  });
});

describe("translations across edits", () => {
  const translated = (): SubtitleBlock[] => [
    { id: "a", start: 0, end: 1, text: "one", translations: { th: "หนึ่ง" } },
    { id: "b", start: 1, end: 2, text: "two", translations: { th: "สอง" } },
    { id: "c", start: 2, end: 3, text: "three words here" },
  ];

  it("joins the translations when two blocks merge", () => {
    const out = mergeWithPrevious(translated(), "b");
    expect(out[0].translations).toEqual({ th: "หนึ่ง สอง" });
  });

  it("carries over a language only one side has", () => {
    const input = translated();
    input[1].translations = { en: "two" };
    const out = mergeWithNext(input, "a");
    expect(out[0].translations).toEqual({ th: "หนึ่ง", en: "two" });
  });

  it("drops the stale translation from both halves of a cut", () => {
    const out = splitBlockAtChar(translated(), "a", 1);
    expect(out[0].translations).toBeUndefined();
    expect(out[1].translations).toBeUndefined();
  });

  it("drops it on a word-boundary split too", () => {
    const input = translated();
    input[2].translations = { th: "สาม" };
    const out = splitBlock(input, "c");
    expect(out[2].translations).toBeUndefined();
    expect(out[3].translations).toBeUndefined();
  });

  it("edits one language without touching the others", () => {
    const input = translated();
    input[0].translations = { th: "หนึ่ง", en: "one" };
    const out = updateBlockTranslation(input, "a", "en", "ONE");
    expect(out[0].translations).toEqual({ th: "หนึ่ง", en: "ONE" });
  });

  it("removes a language when its text is cleared", () => {
    const out = updateBlockTranslation(translated(), "a", "th", "  ");
    expect(out[0].translations).toBeUndefined();
  });
});
