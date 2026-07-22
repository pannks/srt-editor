import { en, type Dict, type TKey } from "./en";
import { th } from "./th";

export type { TKey, Dict };

/** Languages the interface itself is available in. */
export const UI_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "th", label: "ไทย (Thai)" },
] as const;

export type UiLanguage = (typeof UI_LANGUAGES)[number]["code"];

const DICTS: Record<UiLanguage, Dict> = { en, th };

export const isUiLanguage = (value: string): value is UiLanguage =>
  value in DICTS;

/**
 * Look up a string and fill its `{placeholders}`. Only the placeholders passed
 * in `params` are substituted, so literal braces in help text survive.
 * Unknown locales fall back to English, as does a key a locale has not filled.
 */
export function translate(
  lang: UiLanguage,
  key: TKey,
  params?: Record<string, string | number>,
): string {
  const dict = DICTS[lang] ?? en;
  let text = dict[key] || en[key] || key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

export type Translator = (
  key: TKey,
  params?: Record<string, string | number>,
) => string;
