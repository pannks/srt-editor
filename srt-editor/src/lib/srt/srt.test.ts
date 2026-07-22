import { describe, expect, it } from "vitest";
import {
  formatSrtTime,
  parseSrtTime,
  formatShortTime,
  formatTimecode,
  parseFlexibleTime,
} from "./time";
import { blocksToSrt } from "./generate";
import { parseSrt } from "./parse";

describe("SRT time", () => {
  it("formats seconds as HH:MM:SS,mmm", () => {
    expect(formatSrtTime(0)).toBe("00:00:00,000");
    expect(formatSrtTime(61.5)).toBe("00:01:01,500");
    expect(formatSrtTime(3723.042)).toBe("01:02:03,042");
  });

  it("clamps negative time to zero", () => {
    expect(formatSrtTime(-3)).toBe("00:00:00,000");
  });

  it("parses timestamps with , and . separators", () => {
    expect(parseSrtTime("00:01:01,500")).toBeCloseTo(61.5);
    expect(parseSrtTime("01:02:03.042")).toBeCloseTo(3723.042);
  });

  it("round-trips", () => {
    for (const t of [0, 1.001, 59.999, 3600.5, 7325.25]) {
      expect(parseSrtTime(formatSrtTime(t))).toBeCloseTo(t, 3);
    }
  });

  it("rejects invalid timestamps", () => {
    expect(() => parseSrtTime("nope")).toThrow();
  });

  it("formats short display time", () => {
    expect(formatShortTime(65.25)).toBe("1:05.3");
  });
});

describe("editable timecodes", () => {
  it("formats minutes, and hours only when needed", () => {
    expect(formatTimecode(5.5)).toBe("0:05.50");
    expect(formatTimecode(65.25)).toBe("1:05.25");
    expect(formatTimecode(3725.5)).toBe("1:02:05.50");
  });

  it("parses plain seconds, m:ss and h:mm:ss, with , or . for decimals", () => {
    expect(parseFlexibleTime("12.5")).toBeCloseTo(12.5);
    expect(parseFlexibleTime("1:05.3")).toBeCloseTo(65.3);
    expect(parseFlexibleTime("1:02:05,5")).toBeCloseTo(3725.5);
    expect(parseFlexibleTime("  0:30  ")).toBeCloseTo(30);
  });

  it("round-trips what it formats", () => {
    for (const t of [0, 5.5, 65.25, 3725.5]) {
      expect(parseFlexibleTime(formatTimecode(t))).toBeCloseTo(t, 2);
    }
  });

  it("rejects junk so the field can revert", () => {
    for (const bad of ["", "abc", "1:2:3:4", "1::2", "-3"]) {
      expect(() => parseFlexibleTime(bad)).toThrow();
    }
  });
});

describe("blocksToSrt", () => {
  it("serializes ordered numbered cues", () => {
    const srt = blocksToSrt([
      { id: "b", start: 2, end: 3.5, text: "world" },
      { id: "a", start: 0, end: 1.5, text: "hello" },
    ]);
    expect(srt).toBe(
      "1\n00:00:00,000 --> 00:00:01,500\nhello\n\n2\n00:00:02,000 --> 00:00:03,500\nworld\n",
    );
  });
});

describe("parseSrt", () => {
  it("round-trips with blocksToSrt", () => {
    const blocks = [
      { id: "a", start: 0.25, end: 1.5, text: "hello" },
      { id: "b", start: 2, end: 3.75, text: "multi\nline" },
    ];
    const parsed = parseSrt(blocksToSrt(blocks));
    expect(parsed).toHaveLength(2);
    expect(parsed[0].start).toBeCloseTo(0.25);
    expect(parsed[1].text).toBe("multi\nline");
  });

  it("tolerates CRLF and missing indices", () => {
    const parsed = parseSrt(
      "00:00:00,000 --> 00:00:01,000\r\nhi\r\n\r\n00:00:02,000 --> 00:00:03,000\r\nthere\r\n",
    );
    expect(parsed.map((b) => b.text)).toEqual(["hi", "there"]);
  });
});

describe("multi-language SRT", () => {
  const blocks = [
    {
      id: "a",
      start: 0,
      end: 1,
      text: "hello",
      translations: { th: "สวัสดี" },
    },
    { id: "b", start: 1, end: 2, text: "world" },
  ];

  it("writes the source text by default", () => {
    expect(blocksToSrt(blocks)).toContain("hello");
    expect(blocksToSrt(blocks)).not.toContain("สวัสดี");
  });

  it("writes the translation when a language is asked for", () => {
    const srt = blocksToSrt(blocks, { lang: "th" });
    expect(srt).toContain("สวัสดี");
    expect(srt).not.toContain("hello");
  });

  it("falls back to the source for untranslated cues", () => {
    expect(blocksToSrt(blocks, { lang: "th" })).toContain("world");
  });

  it("stacks the translation under the source when bilingual", () => {
    expect(blocksToSrt(blocks, { lang: "th", bilingual: true })).toContain(
      "hello\nสวัสดี",
    );
  });

  it("keeps cue numbering and timing untouched by the language", () => {
    expect(blocksToSrt(blocks, { lang: "th" })).toContain(
      "1\n00:00:00,000 --> 00:00:01,000",
    );
  });
});
