import { describe, expect, it } from "vitest";
import {
  mergeWithPrevious,
  mergeWithNext,
  splitBlock,
  setBlockTimes,
  updateBlockText,
  removeBlock,
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
