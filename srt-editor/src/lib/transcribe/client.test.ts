import { describe, expect, it } from "vitest";
import { parseSegmentsJson, stripFences } from "./client";

describe("stripFences", () => {
  it("unwraps a ```json fence", () => {
    expect(stripFences('```json\n[{"a":1}]\n```')).toBe('[{"a":1}]');
  });

  it("unwraps a bare ``` fence", () => {
    expect(stripFences("```\n[]\n```")).toBe("[]");
  });

  it("leaves unfenced text alone", () => {
    expect(stripFences(' [{"a":1}] ')).toBe('[{"a":1}]');
  });

  it("leaves an inner fence alone", () => {
    expect(stripFences('[{"text":"```"}]')).toBe('[{"text":"```"}]');
  });
});

describe("parseSegmentsJson", () => {
  it("accepts a fenced reply, as OpenAI-compatible models often answer", () => {
    const out = parseSegmentsJson(
      '```json\n[{"start":0,"end":1.5,"text":"hi"}]\n```',
    );
    expect(out).toEqual([{ start: 0, end: 1.5, text: "hi" }]);
  });

  it("drops malformed entries and sorts by start", () => {
    const out = parseSegmentsJson(
      '[{"start":2,"end":3,"text":"b"},{"start":0,"end":1,"text":"a"},{"start":"x","end":1,"text":"bad"},{"start":0,"end":1,"text":"  "}]',
    );
    expect(out.map((s) => s.text)).toEqual(["a", "b"]);
  });

  it("clamps end to start", () => {
    const out = parseSegmentsJson('[{"start":5,"end":4,"text":"x"}]');
    expect(out[0].end).toBe(5);
  });

  it("rejects non-JSON", () => {
    expect(() => parseSegmentsJson("sorry, I cannot")).toThrow(/not valid JSON/);
  });

  it("rejects a non-array", () => {
    expect(() => parseSegmentsJson('{"a":1}')).toThrow(/not an array/);
  });
});
