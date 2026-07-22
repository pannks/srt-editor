import { describe, expect, it } from "vitest";
import { offsetSegments, segmentsToBlocks } from "./merge";
import { parseSegmentsJson } from "../gemini/client";

describe("offsetSegments", () => {
  it("shifts times by the chunk start", () => {
    const out = offsetSegments(
      [{ start: 1, end: 2, text: "hi" }],
      300,
    );
    expect(out[0]).toMatchObject({ start: 301, end: 302 });
  });
});

describe("segmentsToBlocks", () => {
  it("orders segments and clamps overlaps at chunk boundaries", () => {
    const out = segmentsToBlocks([
      { start: 299.5, end: 301, text: "tail of chunk 1" },
      { start: 300.2, end: 302, text: "head of chunk 2" },
      { start: 0, end: 2, text: "first" },
    ]);
    expect(out.map((b) => b.text)).toEqual([
      "first",
      "tail of chunk 1",
      "head of chunk 2",
    ]);
    expect(out[2].start).toBeGreaterThanOrEqual(out[1].end);
    expect(out[2].end).toBeGreaterThanOrEqual(out[2].start);
  });
});

describe("parseSegmentsJson", () => {
  it("parses and sanitizes model output", () => {
    const out = parseSegmentsJson(
      JSON.stringify([
        { start: 5, end: 4, text: " reversed times " },
        { start: 0, end: 1, text: "ok" },
        { start: 1, end: 2, text: "" },
        { start: "bad", end: 2, text: "dropped" },
      ]),
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ start: 0, end: 1, text: "ok" });
    expect(out[1]).toMatchObject({ start: 5, end: 5, text: "reversed times" });
  });

  it("throws on non-JSON and non-array", () => {
    expect(() => parseSegmentsJson("not json")).toThrow();
    expect(() => parseSegmentsJson('{"a":1}')).toThrow();
  });
});
