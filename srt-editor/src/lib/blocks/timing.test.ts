import { describe, expect, it } from "vitest";
import type { SubtitleBlock } from "./types";
import { shiftBlocks, stretchBlocks } from "./timing";
import { MIN_BLOCK_DURATION } from "./ops";

const block = (id: string, start: number, end: number): SubtitleBlock => ({
  id,
  start,
  end,
  text: id,
});

describe("shiftBlocks", () => {
  it("moves every block by the offset", () => {
    const out = shiftBlocks([block("a", 1, 2), block("b", 3, 4.5)], 1.5);
    expect(out[0]).toMatchObject({ start: 2.5, end: 3.5 });
    expect(out[1]).toMatchObject({ start: 4.5, end: 6 });
  });

  it("shifts earlier with a negative offset", () => {
    const out = shiftBlocks([block("a", 5, 6)], -2);
    expect(out[0]).toMatchObject({ start: 3, end: 4 });
  });

  it("clamps at zero and keeps a minimum duration", () => {
    const out = shiftBlocks([block("a", 1, 2)], -5);
    expect(out[0].start).toBe(0);
    expect(out[0].end).toBeGreaterThanOrEqual(MIN_BLOCK_DURATION);
  });

  it("zero offset returns the same array", () => {
    const input = [block("a", 1, 2)];
    expect(shiftBlocks(input, 0)).toBe(input);
  });

  it("rounds to milliseconds", () => {
    const out = shiftBlocks([block("a", 0.1, 0.2)], 0.0004);
    expect(out[0].start).toBe(0.1);
  });
});

describe("stretchBlocks", () => {
  it("multiplies every time by the factor", () => {
    const out = stretchBlocks([block("a", 10, 20), block("b", 100, 110)], 1.1);
    expect(out[0]).toMatchObject({ start: 11, end: 22 });
    expect(out[1]).toMatchObject({ start: 110, end: 121 });
  });

  it("compresses with a factor below one", () => {
    const out = stretchBlocks([block("a", 10, 20)], 0.5);
    expect(out[0]).toMatchObject({ start: 5, end: 10 });
  });

  it("keeps a minimum duration when squeezed", () => {
    const out = stretchBlocks([block("a", 0, 0.06)], 0.1);
    expect(out[0].end - out[0].start).toBeGreaterThanOrEqual(MIN_BLOCK_DURATION - 1e-9);
  });

  it("factor 1 and invalid factors return the same array", () => {
    const input = [block("a", 1, 2)];
    expect(stretchBlocks(input, 1)).toBe(input);
    expect(stretchBlocks(input, 0)).toBe(input);
    expect(stretchBlocks(input, -2)).toBe(input);
    expect(stretchBlocks(input, NaN)).toBe(input);
  });
});
