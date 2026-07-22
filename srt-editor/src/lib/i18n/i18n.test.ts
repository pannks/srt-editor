import { describe, expect, it } from "vitest";
import { en } from "./en";
import { th } from "./th";
import { isUiLanguage, translate, UI_LANGUAGES } from "./index";
import { languageLabel, languageName, languageTag } from "./languages";

describe("dictionaries", () => {
  it("cover exactly the same keys", () => {
    expect(Object.keys(th).sort()).toEqual(Object.keys(en).sort());
  });

  it("leave no string empty", () => {
    for (const [key, value] of Object.entries(th)) {
      expect(value.trim(), key).not.toBe("");
    }
  });

  it("lists every locale it can render", () => {
    for (const { code } of UI_LANGUAGES) expect(isUiLanguage(code)).toBe(true);
    expect(isUiLanguage("xx")).toBe(false);
  });
});

describe("translate", () => {
  it("returns the locale's string", () => {
    expect(translate("th", "settings.save")).toBe("บันทึก");
    expect(translate("en", "settings.save")).toBe("Save");
  });

  it("substitutes only the parameters it is given", () => {
    expect(
      translate("en", "toolbar.transcribing", { done: 2, total: 5 }),
    ).toBe("Transcribing 2/5…");
  });

  it("leaves literal braces alone when no parameters are passed", () => {
    expect(translate("en", "settings.exportPatternHint")).toContain("{media}");
  });
});

describe("subtitle languages", () => {
  it("names Thai in English for the prompt", () => {
    expect(languageName("th")).toBe("Thai");
  });

  it("shows the endonym in the picker and the block rows", () => {
    expect(languageLabel("th")).toContain("ไทย");
    expect(languageTag("th")).toBe("ไทย");
  });

  it("passes unknown codes straight through", () => {
    expect(languageName("qq")).toBe("qq");
    expect(languageTag("qq")).toBe("QQ");
  });
});
