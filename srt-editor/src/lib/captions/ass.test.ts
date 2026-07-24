import { describe, expect, it } from "vitest";
import {
  assAlignment,
  assColor,
  assTime,
  buildAss,
  escapeAssText,
  karaokeText,
  wrapMargins,
} from "./ass";
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

describe("assAlignment", () => {
  it("maps anchor pairs onto the \\an numpad", () => {
    expect(assAlignment({ alignH: "center", alignV: "middle" })).toBe(5);
    expect(assAlignment({ alignH: "left", alignV: "bottom" })).toBe(1);
    expect(assAlignment({ alignH: "right", alignV: "top" })).toBe(9);
  });
});

describe("wrapMargins", () => {
  it("splits the leftover width around a centred anchor", () => {
    const m = wrapMargins({ posX: 0.5, alignH: "center", widthPct: 0.5 }, dims);
    expect(m).toEqual({ marginL: 270, marginR: 270 });
  });

  it("hangs the box off the anchor for edge alignments", () => {
    expect(
      wrapMargins({ posX: 0.1, alignH: "left", widthPct: 0.5 }, dims),
    ).toEqual({ marginL: 108, marginR: 432 });
    expect(
      wrapMargins({ posX: 0.9, alignH: "right", widthPct: 0.5 }, dims),
    ).toEqual({ marginL: 432, marginR: 108 });
  });

  it("clamps when the box would leave the frame", () => {
    const m = wrapMargins({ posX: 0.05, alignH: "center", widthPct: 0.9 }, dims);
    expect(m.marginL).toBe(0);
    expect(m.marginR).toBeGreaterThan(0);
  });
});

describe("buildAss", () => {
  it("carries the alignment into the style and the position tag", () => {
    const out = buildAss(
      [block(0, 1, "hi")],
      one({ alignH: "left", alignV: "bottom" }),
      dims,
    );
    expect(out).toContain("\\an1\\pos(");
  });

  it("pre-wraps with explicit breaks and no auto-wrap, not margins", () => {
    // Lines are broken by the shared wrapper (which needs a DOM); in Node it
    // returns the text unwrapped, so a dialogue carries zero margins and the
    // script disables libass auto-wrap.
    const out = buildAss([block(0, 1, "hi")], one({ widthPct: 0.5 }), dims);
    expect(out).toContain("WrapStyle: 2");
    expect(out).toContain(",Caption0,,0,0,0,,");
  });

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

  it("segments Thai karaoke without spaces", () => {
    const out = buildAss(
      [block(0, 2, "สวัสดีครับ")],
      one({ animation: "karaoke" }),
      dims,
    );
    // More than one \k tag means the run was broken into words.
    expect([...out.matchAll(/\\k\d+/g)].length).toBeGreaterThan(1);
  });

  it("highlight mode redraws once per word with an accent colour", () => {
    const out = buildAss(
      [block(0, 2, "two words")],
      one({ animation: "highlight", highlightColor: "#ff0000" }),
      dims,
    );
    const dialogue = out.split("\n").filter((l) => l.startsWith("Dialogue:"));
    expect(dialogue).toHaveLength(2); // one per word
    // Accent colour override (#ff0000 → &H000000FF) appears in the body.
    expect(out).toContain("&H000000FF");
  });

  it("word mode shows one word at a time with a pop", () => {
    const out = buildAss(
      [block(0, 2, "two words")],
      one({ animation: "word" }),
      dims,
    );
    const dialogue = out.split("\n").filter((l) => l.startsWith("Dialogue:"));
    expect(dialogue).toHaveLength(2);
    expect(dialogue[0]).toContain("\\t(0,120,");
    // Only its own word, not the whole caption, in each event.
    expect(dialogue[0]).toContain("two");
    expect(dialogue[0]).not.toContain("words");
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
