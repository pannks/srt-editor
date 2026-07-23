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
    const out = migrateLegacySettings({ layout: "side", theme: "dark" });
    expect(out).toEqual({ layout: "side", theme: "dark" });
  });

  it("moves the flat Gemini fields into the transcription group", () => {
    const out = migrateLegacySettings({
      apiKey: "AIza-test",
      model: "gemini-3.1-pro-preview",
      prompt: "custom",
      chunkSecs: 120,
    }) as { transcription?: Record<string, unknown> };
    expect(out.transcription).toMatchObject({
      provider: "gemini",
      apiKey: "AIza-test",
      model: "gemini-3.1-pro-preview",
      prompt: "custom",
      chunkSecs: 120,
    });
    expect("apiKey" in out).toBe(false);
    expect("model" in out).toBe(false);
  });

  it("keeps an existing transcription group over the flat fields", () => {
    const out = migrateLegacySettings({
      apiKey: "old",
      transcription: { provider: "openai", apiKey: "new" },
    }) as { transcription?: Record<string, unknown> };
    expect(out.transcription).toEqual({ provider: "openai", apiKey: "new" });
  });

  it("does not invent a transcription group from nothing", () => {
    const out = migrateLegacySettings({ layout: "top" });
    expect("transcription" in out).toBe(false);
  });
});
