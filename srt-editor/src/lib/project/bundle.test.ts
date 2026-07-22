import { describe, expect, it } from "vitest";
import {
  BUNDLE_FORMAT,
  BUNDLE_VERSION,
  buildBundle,
  bundleFileName,
  parseBundle,
  serializeBundle,
} from "./bundle";
import { hasSecrets, stripSecrets } from "../settings/share";

const input = {
  app: "0.3.0",
  name: "Episode 3",
  mediaPath: "/movies/ep3.mp4",
  mediaKind: "video" as const,
  srt: "1\n00:00:00,000 --> 00:00:01,000\nhello\n",
  translations: [{ th: "สวัสดี" }],
  settings: { model: "x" },
  now: new Date(Date.UTC(2026, 6, 22, 12)),
};

describe("buildBundle", () => {
  it("stamps the format, version and export time", () => {
    const bundle = buildBundle(input);
    expect(bundle.format).toBe(BUNDLE_FORMAT);
    expect(bundle.version).toBe(BUNDLE_VERSION);
    expect(bundle.exportedAt).toBe("2026-07-22T12:00:00.000Z");
    expect(bundle.app).toBe("0.3.0");
  });

  it("references the media by path and by name", () => {
    const bundle = buildBundle(input);
    expect(bundle.media).toEqual({
      path: "/movies/ep3.mp4",
      name: "ep3.mp4",
      kind: "video",
    });
  });

  it("carries no media name when there is no media", () => {
    const bundle = buildBundle({ ...input, mediaPath: null });
    expect(bundle.media.path).toBeNull();
    expect(bundle.media.name).toBeNull();
  });
});

describe("round trip", () => {
  it("survives serialize → parse unchanged", () => {
    const bundle = buildBundle(input);
    expect(parseBundle(serializeBundle(bundle))).toEqual(bundle);
  });

  it("keeps the translations aligned to the cues", () => {
    const out = parseBundle(serializeBundle(buildBundle(input)));
    expect(out.translations).toEqual([{ th: "สวัสดี" }]);
  });
});

describe("parseBundle rejections", () => {
  it("refuses a file that is not JSON", () => {
    expect(() => parseBundle("nope")).toThrow(/not valid JSON/);
  });

  it("refuses JSON that is not a project file", () => {
    expect(() => parseBundle('{"hello":1}')).toThrow(/not an SRT Studio project/);
  });

  it("refuses a file written by a newer app", () => {
    const future = { ...buildBundle(input), version: BUNDLE_VERSION + 1 };
    expect(() => parseBundle(JSON.stringify(future))).toThrow(/newer SRT Studio/);
  });

  it("refuses a project with no subtitles field", () => {
    const broken = { format: BUNDLE_FORMAT, version: 1 };
    expect(() => parseBundle(JSON.stringify(broken))).toThrow(/no subtitles/);
  });
});

describe("parseBundle tolerance", () => {
  it("fills in a missing name, media block and translations", () => {
    const minimal = { format: BUNDLE_FORMAT, version: 1, srt: "" };
    const out = parseBundle(JSON.stringify(minimal));
    expect(out.name).toBe("Imported project");
    expect(out.media).toEqual({ path: null, name: null, kind: "video" });
    expect(out.translations).toEqual([]);
    expect(out.settings).toBeNull();
  });

  it("derives the media name from the path when only the path is there", () => {
    const partial = {
      format: BUNDLE_FORMAT,
      version: 1,
      srt: "",
      media: { path: "/a/b/clip.mkv" },
    };
    expect(parseBundle(JSON.stringify(partial)).media.name).toBe("clip.mkv");
  });
});

describe("bundleFileName", () => {
  it("keeps the project name and adds the extension", () => {
    expect(bundleFileName("Episode 3")).toBe("Episode 3.srtproj");
  });

  it("leaves .srtproj as the only extension", () => {
    expect(bundleFileName("Ep.3 v1.2")).toBe("Ep-3 v1-2.srtproj");
  });

  it("falls back when the name has nothing usable", () => {
    expect(bundleFileName("///")).toBe("project.srtproj");
  });
});

describe("a shared bundle carries no credentials", () => {
  const settings = {
    apiKey: "AIza-secret",
    model: "gemini",
    translation: { apiKey: "sk-secret", model: "qwen3:8b", baseUrl: "http://x" },
  };

  it("strips both keys", () => {
    const safe = stripSecrets(settings);
    expect(hasSecrets(safe)).toBe(false);
    expect(JSON.stringify(safe)).not.toContain("secret");
  });

  it("removes the fields rather than blanking them, so a reader keeps its own", () => {
    const safe = stripSecrets(settings) as Record<string, unknown>;
    expect("apiKey" in safe).toBe(false);
    expect("apiKey" in (safe.translation as object)).toBe(false);
  });

  it("keeps everything that is not a credential", () => {
    const safe = stripSecrets(settings);
    expect(safe.model).toBe("gemini");
    expect(safe.translation).toEqual({
      model: "qwen3:8b",
      baseUrl: "http://x",
    });
  });

  it("survives settings with no translation block", () => {
    expect(stripSecrets({ apiKey: "x" })).toEqual({});
  });

  it("never lets a key reach the serialized file", () => {
    const text = serializeBundle(
      buildBundle({ ...input, settings: stripSecrets(settings) }),
    );
    expect(text).not.toContain("secret");
  });
});
