import { describe, expect, it } from "vitest";
import {
  attachTranslations,
  extractTranslations,
  translatedCount,
  translatedLanguages,
} from "./translations";
import type { SubtitleBlock } from "./types";

const block = (
  id: string,
  start: number,
  translations?: Record<string, string>,
): SubtitleBlock => ({ id, start, end: start + 1, text: id, translations });

describe("extractTranslations", () => {
  it("returns one entry per block, in start-time order", () => {
    const blocks = [block("b", 5, { th: "สอง" }), block("a", 1, { th: "หนึ่ง" })];
    expect(extractTranslations(blocks)).toEqual([{ th: "หนึ่ง" }, { th: "สอง" }]);
  });

  it("uses an empty object for untranslated blocks", () => {
    expect(extractTranslations([block("a", 0)])).toEqual([{}]);
  });
});

describe("attachTranslations", () => {
  it("round-trips through the stored order, not through block ids", () => {
    const original = [block("a", 1, { th: "หนึ่ง" }), block("b", 5, { th: "สอง" })];
    const stored = extractTranslations(original);
    // Ids differ, as they do after the SRT is parsed back.
    const reparsed = [block("x", 1), block("y", 5)];
    const out = attachTranslations(reparsed, stored);
    expect(out[0].translations).toEqual({ th: "หนึ่ง" });
    expect(out[1].translations).toEqual({ th: "สอง" });
  });

  it("is a no-op without stored data", () => {
    const blocks = [block("a", 0)];
    expect(attachTranslations(blocks, null)).toBe(blocks);
    expect(attachTranslations(blocks, [])).toBe(blocks);
  });

  it("ignores a stored list shorter than the blocks", () => {
    const out = attachTranslations([block("a", 0), block("b", 1)], [{ th: "x" }]);
    expect(out[0].translations).toEqual({ th: "x" });
    expect(out[1].translations).toBeUndefined();
  });
});

describe("summaries", () => {
  const blocks = [
    block("a", 0, { th: "หนึ่ง", en: "one" }),
    block("b", 1, { th: "  " }),
    block("c", 2),
  ];

  it("lists every language seen, in first-seen order", () => {
    expect(translatedLanguages(blocks)).toEqual(["th", "en"]);
  });

  it("counts only blocks with real text", () => {
    expect(translatedCount(blocks, "th")).toBe(1);
    expect(translatedCount(blocks, "en")).toBe(1);
    expect(translatedCount(blocks, "ja")).toBe(0);
  });
});
