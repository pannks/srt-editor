import { describe, expect, it } from "vitest";
import { assColor, assTime, buildAss, escapeAssText, karaokeText } from "./ass";
import { makeCaptionLayer, type CaptionLayer } from "./types";
import type { SubtitleBlock } from "../blocks/types";

const dims = { width: 1080, height: 1920 };

/** A layer with the defaults plus overrides — the tests only care about a few. */
const layer = (over: Partial<CaptionLayer> = {}) => makeCaptionLayer(over);
const one = (over: Partial<CaptionLayer> = {}) => [layer(over)];

const block = (
  start: number,
  end: number,
  text: string,
  translations?: Record<string, string>,
): SubtitleBlock => ({ id: `${start}`, start, end, text, translations });

describe("assColor", () => {
  it("converts RGB to ASS BGR with opaque alpha", () => {
    expect(assColor("#ff8000")).toBe("&H000080FF");
  });

  it("carries the alpha byte", () => {
    expect(assColor("#ffffff", 255)).toBe("&HFFFFFFFF");
  });

  it("falls back to white on junk", () => {
    expect(assColor("nope")).toBe("&H00FFFFFF");
  });
});

describe("assTime", () => {
  it("formats centiseconds", () => {
    expect(assTime(0)).toBe("0:00:00.00");
    expect(assTime(61.235)).toBe("0:01:01.24");
    expect(assTime(3723.5)).toBe("1:02:03.50");
  });
});

describe("escapeAssText", () => {
  it("neutralises override braces and keeps line breaks", () => {
    expect(escapeAssText("a {b}\nc")).toBe("a (b)\\Nc");
  });
});

describe("karaokeText", () => {
  it("gives every word a \\k share summing to the duration", () => {
    const out = karaokeText("hello brave world", 2);
    const shares = [...out.matchAll(/\\k(\d+)/g)].map((m) => Number(m[1]));
    expect(shares).toHaveLength(3);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(200);
  });

  it("leaves empty text alone", () => {
    expect(karaokeText("  ", 2)).toBe("  ");
  });
});

describe("buildAss", () => {
  it("emits a playres header matching the video", () => {
    const out = buildAss([block(0, 1, "hi")], one(), dims);
    expect(out).toContain("PlayResX: 1080");
    expect(out).toContain("PlayResY: 1920");
  });

  it("scales the font from the percentage and positions from fractions", () => {
    const out = buildAss([block(0, 1, "hi")], one(), dims);
    // 5% of 1920 = 96; pos 0.5,0.85 of 1080x1920 = 540,1632
    expect(out).toContain(",96,");
    expect(out).toContain("\\pos(540,1632)");
  });

  it("writes one dialogue per block and skips blocks without text", () => {
    const out = buildAss(
      [block(0, 1, "one"), block(1, 2, ""), block(2, 3, "three")],
      one(),
      dims,
    );
    const lines = out.split("\n").filter((l) => l.startsWith("Dialogue:"));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("0:00:00.00,0:00:01.00");
  });

  it("uses the chosen translation line", () => {
    const out = buildAss(
      [block(0, 1, "source", { th: "แปลแล้ว" })],
      one({ language: "th" }),
      dims,
    );
    expect(out).toContain("แปลแล้ว");
    expect(out).not.toContain("source");
  });

  it("adds fade tags when asked", () => {
    const out = buildAss([block(0, 1, "hi")], one({ animation: "fade" }), dims);
    expect(out).toContain("\\fad(150,150)");
  });

  it("switches to an opaque box with the requested opacity", () => {
    const out = buildAss(
      [block(0, 1, "hi")],
      one({ bgEnabled: true, bgOpacity: 0.5 }),
      dims,
    );
    // BorderStyle 3, and the box alpha byte is 0.5 → 0x80 (rounded 128)
    expect(out).toMatch(/,3,2,1,5,/);
    expect(out).toContain("&H80000000");
  });

  it("emits karaoke word timings", () => {
    const out = buildAss(
      [block(0, 2, "two words")],
      one({ animation: "karaoke" }),
      dims,
    );
    expect(out).toMatch(/\{\\k\d+\}two \{\\k\d+\}words/);
  });

  it("stacks several layers, each its own style and language", () => {
    const out = buildAss(
      [block(0, 1, "hi", { th: "สวัสดี", zh: "你好" })],
      [
        layer({ language: "", posY: 0.85 }),
        layer({ language: "th", posY: 0.7, color: "#ffdd00" }),
        layer({ language: "zh", posY: 0.55 }),
      ],
      dims,
    );
    // Three named styles and three dialogue lines with the right text.
    expect(out).toContain("Style: Caption0,");
    expect(out).toContain("Style: Caption1,");
    expect(out).toContain("Style: Caption2,");
    const dialogue = out.split("\n").filter((l) => l.startsWith("Dialogue:"));
    expect(dialogue).toHaveLength(3);
    expect(out).toContain("hi");
    expect(out).toContain("สวัสดี");
    expect(out).toContain("你好");
    // The Thai layer sits higher and carries its own colour.
    expect(out).toContain("\\pos(540,1344)");
  });
});
