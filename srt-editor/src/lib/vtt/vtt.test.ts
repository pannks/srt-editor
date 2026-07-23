import { describe, expect, it } from "vitest";
import { formatVttTime, parseVttTime } from "./time";
import { blocksToVtt, escapeVttText } from "./generate";
import { parseVtt } from "./parse";

describe("WebVTT time", () => {
  it("formats seconds as HH:MM:SS.mmm", () => {
    expect(formatVttTime(0)).toBe("00:00:00.000");
    expect(formatVttTime(61.5)).toBe("00:01:01.500");
    expect(formatVttTime(3723.042)).toBe("01:02:03.042");
  });

  it("clamps negative time to zero", () => {
    expect(formatVttTime(-3)).toBe("00:00:00.000");
  });

  it("parses stamps with and without hours, and , or . separators", () => {
    expect(parseVttTime("00:01:01.500")).toBeCloseTo(61.5);
    expect(parseVttTime("01:02.500")).toBeCloseTo(62.5);
    expect(parseVttTime("00:01:01,500")).toBeCloseTo(61.5);
  });

  it("round-trips", () => {
    for (const t of [0, 1.001, 59.999, 3600.5, 7325.25]) {
      expect(parseVttTime(formatVttTime(t))).toBeCloseTo(t, 3);
    }
  });

  it("rejects invalid timestamps", () => {
    expect(() => parseVttTime("nope")).toThrow();
  });
});

describe("blocksToVtt", () => {
  it("writes the WEBVTT header and ordered cues", () => {
    const vtt = blocksToVtt([
      { id: "b", start: 2, end: 3.5, text: "world" },
      { id: "a", start: 0, end: 1.5, text: "hello" },
    ]);
    expect(vtt).toBe(
      "WEBVTT\n\n00:00:00.000 --> 00:00:01.500\nhello\n\n00:00:02.000 --> 00:00:03.500\nworld\n",
    );
  });

  it("escapes markup characters in cue text", () => {
    expect(escapeVttText("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
    expect(blocksToVtt([{ id: "a", start: 0, end: 1, text: "1 < 2" }])).toContain(
      "1 &lt; 2",
    );
  });
});

describe("parseVtt", () => {
  it("round-trips with blocksToVtt", () => {
    const blocks = [
      { id: "a", start: 0.25, end: 1.5, text: "hello" },
      { id: "b", start: 2, end: 3.75, text: "multi\nline" },
    ];
    const parsed = parseVtt(blocksToVtt(blocks));
    expect(parsed).toHaveLength(2);
    expect(parsed[0].start).toBeCloseTo(0.25);
    expect(parsed[1].text).toBe("multi\nline");
  });

  it("round-trips escaped markup back to the original characters", () => {
    const parsed = parseVtt(blocksToVtt([{ id: "a", start: 0, end: 1, text: "1 < 2 & 3" }]));
    expect(parsed[0].text).toBe("1 < 2 & 3");
  });

  it("skips header, notes and cue identifiers, and drops cue settings", () => {
    const parsed = parseVtt(
      "WEBVTT\n\nNOTE this is a comment\n\nintro\n00:00:00.000 --> 00:00:01.000 line:0 position:50%\nhi\n\n00:00:02.000 --> 00:00:03.000\nthere\n",
    );
    expect(parsed.map((b) => b.text)).toEqual(["hi", "there"]);
    expect(parsed[0].start).toBeCloseTo(0);
    expect(parsed[1].end).toBeCloseTo(3);
  });

  it("tolerates CRLF and a missing WEBVTT header", () => {
    const parsed = parseVtt(
      "00:00:00.000 --> 00:00:01.000\r\nhi\r\n\r\n00:00:02.000 --> 00:00:03.000\r\nthere\r\n",
    );
    expect(parsed.map((b) => b.text)).toEqual(["hi", "there"]);
  });
});

describe("multi-language VTT", () => {
  const blocks = [
    { id: "a", start: 0, end: 1, text: "hello", translations: { th: "สวัสดี" } },
    { id: "b", start: 1, end: 2, text: "world" },
  ];

  it("writes the translation when a language is asked for", () => {
    const vtt = blocksToVtt(blocks, { lang: "th" });
    expect(vtt).toContain("สวัสดี");
    expect(vtt).not.toContain("hello");
  });

  it("stacks the translation under the source when bilingual", () => {
    expect(blocksToVtt(blocks, { lang: "th", bilingual: true })).toContain(
      "hello\nสวัสดี",
    );
  });
});
