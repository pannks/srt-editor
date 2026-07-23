import { describe, expect, it } from "vitest";
import type { SubtitleBlock } from "./types";
import { countMatches, replaceAll } from "./replace";

const block = (
  id: string,
  text: string,
  translations?: Record<string, string>,
): SubtitleBlock => ({ id, start: 0, end: 1, text, translations });

const BOTH = { matchCase: false, includeTranslations: true };
const SOURCE_ONLY = { matchCase: false, includeTranslations: false };

describe("countMatches", () => {
  it("counts every occurrence across blocks", () => {
    const blocks = [block("a", "Hello hello"), block("b", "hello world")];
    expect(countMatches(blocks, "hello", SOURCE_ONLY)).toBe(3);
  });

  it("respects case sensitivity", () => {
    const blocks = [block("a", "Hello hello")];
    expect(countMatches(blocks, "hello", { ...SOURCE_ONLY, matchCase: true })).toBe(1);
  });

  it("counts translations only when asked", () => {
    const blocks = [block("a", "dog", { th: "dog dog" })];
    expect(countMatches(blocks, "dog", SOURCE_ONLY)).toBe(1);
    expect(countMatches(blocks, "dog", BOTH)).toBe(3);
  });

  it("matches regex metacharacters literally", () => {
    const blocks = [block("a", "1+1 (two)")];
    expect(countMatches(blocks, "1+1", BOTH)).toBe(1);
    expect(countMatches(blocks, "(two)", BOTH)).toBe(1);
  });

  it("empty query matches nothing", () => {
    expect(countMatches([block("a", "text")], "", BOTH)).toBe(0);
  });
});

describe("replaceAll", () => {
  it("replaces in source text and reports the count", () => {
    const { blocks, replaced } = replaceAll(
      [block("a", "cat cat"), block("b", "dog")],
      "cat",
      "bird",
      SOURCE_ONLY,
    );
    expect(replaced).toBe(2);
    expect(blocks[0].text).toBe("bird bird");
    expect(blocks[1].text).toBe("dog");
  });

  it("returns the same array when nothing matches", () => {
    const input = [block("a", "unchanged")];
    const { blocks, replaced } = replaceAll(input, "missing", "x", BOTH);
    expect(replaced).toBe(0);
    expect(blocks).toBe(input);
  });

  it("keeps untouched blocks by reference", () => {
    const input = [block("a", "hit"), block("b", "miss")];
    const { blocks } = replaceAll(input, "hit", "x", BOTH);
    expect(blocks[0]).not.toBe(input[0]);
    expect(blocks[1]).toBe(input[1]);
  });

  it("replaces inside translations when asked", () => {
    const input = [block("a", "src", { th: "แมว cat", ja: "cat" })];
    const { blocks, replaced } = replaceAll(input, "cat", "bird", BOTH);
    expect(replaced).toBe(2);
    expect(blocks[0].translations).toEqual({ th: "แมว bird", ja: "bird" });
  });

  it("drops a translation replaced down to nothing", () => {
    const input = [block("a", "src", { th: "cat" })];
    const { blocks } = replaceAll(input, "cat", "", BOTH);
    expect(blocks[0].translations).toBeUndefined();
  });

  it("leaves translations alone when not asked", () => {
    const input = [block("a", "cat", { th: "cat" })];
    const { blocks } = replaceAll(input, "cat", "bird", SOURCE_ONLY);
    expect(blocks[0].text).toBe("bird");
    expect(blocks[0].translations).toEqual({ th: "cat" });
  });

  it("is case-insensitive by default", () => {
    const { blocks } = replaceAll([block("a", "Cat CAT cat")], "cat", "dog", BOTH);
    expect(blocks[0].text).toBe("dog dog dog");
  });
});
