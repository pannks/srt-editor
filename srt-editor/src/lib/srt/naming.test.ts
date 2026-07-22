import { describe, expect, it } from "vitest";
import { basename, buildExportName, sanitizeFileName } from "./naming";

const date = new Date(2026, 6, 22);

describe("basename", () => {
  it("drops the directory and the extension", () => {
    expect(basename("/movies/clip one.mp4")).toBe("clip one");
    expect(basename("C:\\media\\clip.mkv")).toBe("clip");
    expect(basename("noext")).toBe("noext");
  });
});

describe("sanitizeFileName", () => {
  it("removes path and reserved characters but keeps spaces and dashes", () => {
    expect(sanitizeFileName("a/b:c*d?e final-cut")).toBe("abcde final-cut");
  });

  it("trims leading and trailing dots", () => {
    expect(sanitizeFileName("..name..")).toBe("name");
  });
});

describe("buildExportName", () => {
  it("fills the tokens and adds the extension", () => {
    expect(
      buildExportName("", "{media}-{lang}", {
        mediaPath: "/movies/clip.mp4",
        lang: "th",
      }),
    ).toBe("clip-th.srt");
  });

  it("prepends the prefix verbatim", () => {
    expect(
      buildExportName("final-", "{media}", { mediaPath: "/m/clip.mp4" }),
    ).toBe("final-clip.srt");
  });

  it("leaves no stranded separator when a token is empty", () => {
    expect(
      buildExportName("", "{media}-{lang}", { mediaPath: "/m/clip.mp4" }),
    ).toBe("clip.srt");
    expect(buildExportName("", "{project}-{lang}", { lang: "th" })).toBe(
      "th.srt",
    );
  });

  it("supports the project and date tokens", () => {
    expect(
      buildExportName("", "{project}_{date}", { projectName: "Ep 3", date }),
    ).toBe("Ep 3_2026-07-22.srt");
  });

  it("falls back to a usable name when everything resolves empty", () => {
    expect(buildExportName("", "{media}{project}{lang}")).toBe("subtitles.srt");
  });

  it("uses the default pattern when none is set", () => {
    expect(buildExportName("", "", { mediaPath: "/m/clip.mp4", lang: "en" })).toBe(
      "clip-en.srt",
    );
  });
});

describe("buildExportName leaves .srt as the only extension", () => {
  it("turns a dot in the pattern into a dash", () => {
    expect(
      buildExportName("", "{media}.{lang}", {
        mediaPath: "/m/clip.mp4",
        lang: "th",
      }),
    ).toBe("clip-th.srt");
  });

  it("turns dots inside the media name into dashes", () => {
    expect(
      buildExportName("", "{media}-{lang}", {
        mediaPath: "/m/my.video.mp4",
        lang: "th",
      }),
    ).toBe("my-video-th.srt");
  });

  it("handles a dotted prefix", () => {
    expect(buildExportName("v2.", "{media}", { mediaPath: "/m/clip.mp4" })).toBe(
      "v2-clip.srt",
    );
  });

  it("never doubles a separator where a dot met a dash", () => {
    expect(
      buildExportName("", "{media}.-{lang}", {
        mediaPath: "/m/clip.mp4",
        lang: "th",
      }),
    ).toBe("clip-th.srt");
  });

  it("holds for every token combination", () => {
    const name = buildExportName("x.", "{media}.{project}.{lang}.{date}", {
      mediaPath: "/m/a.b.mp4",
      projectName: "Ep.3",
      lang: "zh-TW",
      date,
    });
    expect(name.match(/\./g)).toHaveLength(1);
    expect(name.endsWith(".srt")).toBe(true);
  });
});
