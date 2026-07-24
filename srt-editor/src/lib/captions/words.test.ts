import { describe, expect, it } from "vitest";
import {
  activeWordIndex,
  layoutWords,
  timeWords,
  timedWords,
  tokenizeCaption,
} from "./words";

describe("tokenizeCaption", () => {
  it("splits English on spaces, keeping the separators on the word", () => {
    const toks = tokenizeCaption("hello brave world");
    expect(toks.map((t) => t.text)).toEqual(["hello ", "brave ", "world"]);
  });

  it("segments Thai by dictionary, not spaces", () => {
    // No spaces, yet the run breaks into real words.
    const toks = tokenizeCaption("สวัสดีครับ");
    expect(toks.length).toBeGreaterThan(1);
    expect(toks.map((t) => t.text).join("")).toBe("สวัสดีครับ");
  });

  it("flattens newlines so a word never straddles a break", () => {
    const toks = tokenizeCaption("one\ntwo");
    expect(toks.map((t) => t.text.trim())).toEqual(["one", "two"]);
  });

  it("returns nothing for blank text", () => {
    expect(tokenizeCaption("   ")).toEqual([]);
  });
});

describe("timeWords", () => {
  it("tiles the block by weight and sums exactly to the end", () => {
    const words = timeWords(
      [
        { text: "a", weight: 1 },
        { text: "bbb", weight: 3 },
      ],
      0,
      4,
    );
    expect(words[0]).toMatchObject({ start: 0, end: 1 });
    expect(words[1]).toMatchObject({ start: 1, end: 4 });
  });

  it("lets the last word absorb rounding so it always reaches the end", () => {
    const words = timeWords(
      [
        { text: "x", weight: 1 },
        { text: "y", weight: 1 },
        { text: "z", weight: 1 },
      ],
      0,
      1,
    );
    expect(words[words.length - 1].end).toBe(1);
  });
});

describe("timedWords + activeWordIndex", () => {
  const words = timedWords("one two three", 0, 3);

  it("finds the word under the playhead", () => {
    expect(activeWordIndex(words, -1)).toBe(-1);
    expect(activeWordIndex(words, 0)).toBe(0);
    expect(activeWordIndex(words, 1.5)).toBe(1);
    expect(activeWordIndex(words, 2.9)).toBe(2);
  });
});

describe("layoutWords", () => {
  it("keeps every word on one line without a measurer (node)", () => {
    const words = timedWords("one two three four", 0, 4);
    const lines = layoutWords(words, 100, 40, "Arial", false);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveLength(words.length);
  });
});
