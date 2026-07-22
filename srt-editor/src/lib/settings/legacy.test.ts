import { describe, expect, it } from "vitest";
import { migrateLegacySettings } from "./legacy";

describe("migrateLegacySettings", () => {
  it("turns the single overlay language into a list", () => {
    const out = migrateLegacySettings({ overlayLanguage: "th" });
    expect(out).toEqual({ overlayLanguages: ["th"] });
  });

  it("reads the old empty value as no overlay at all", () => {
    expect(migrateLegacySettings({ overlayLanguage: "" })).toEqual({
      overlayLanguages: [],
    });
  });

  it("drops the legacy key so it cannot be written back", () => {
    const out = migrateLegacySettings({ overlayLanguage: "th" });
    expect("overlayLanguage" in out).toBe(false);
  });

  it("leaves a snapshot that already has the new field alone", () => {
    const out = migrateLegacySettings({
      overlayLanguage: "th",
      overlayLanguages: ["en", "ja"],
    });
    expect(out).toEqual({ overlayLanguages: ["en", "ja"] });
  });

  it("passes through everything it does not know about", () => {
    const out = migrateLegacySettings({ model: "x", chunkSecs: 300 });
    expect(out).toEqual({ model: "x", chunkSecs: 300 });
  });
});
