/**
 * Subtitle languages offered as translation targets. Separate from the
 * interface locales in `index.ts`: the app is translated into two languages,
 * but subtitles can be translated into any of these.
 */
export interface SubtitleLanguage {
  /** ISO 639-1 code — also the `{lang}` token in export file names. */
  code: string;
  /** English name, used in the prompt sent to the model. */
  name: string;
  /** Endonym, shown in the picker next to the English name. */
  native: string;
}

export const SUBTITLE_LANGUAGES: SubtitleLanguage[] = [
  { code: "th", name: "Thai", native: "ไทย" },
  { code: "en", name: "English", native: "English" },
  { code: "zh", name: "Chinese (Simplified)", native: "简体中文" },
  { code: "zh-TW", name: "Chinese (Traditional)", native: "繁體中文" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "ko", name: "Korean", native: "한국어" },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia" },
  { code: "ms", name: "Malay", native: "Bahasa Melayu" },
  { code: "lo", name: "Lao", native: "ລາວ" },
  { code: "km", name: "Khmer", native: "ខ្មែរ" },
  { code: "my", name: "Burmese", native: "မြန်မာ" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "ar", name: "Arabic", native: "العربية" },
  { code: "fr", name: "French", native: "Français" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "tr", name: "Turkish", native: "Türkçe" },
];

const BY_CODE = new Map(SUBTITLE_LANGUAGES.map((l) => [l.code, l]));

export const languageByCode = (code: string): SubtitleLanguage | undefined =>
  BY_CODE.get(code);

/** English name for the prompt; unknown codes are passed through as-is. */
export const languageName = (code: string): string =>
  BY_CODE.get(code)?.name ?? code;

/** `Thai (th)` — what the pickers and the block rows show. */
export const languageLabel = (code: string): string => {
  const lang = BY_CODE.get(code);
  return lang ? `${lang.native} · ${lang.name} (${lang.code})` : code;
};

/** Short form for the per-block translation rows. */
export const languageTag = (code: string): string =>
  BY_CODE.get(code)?.native ?? code.toUpperCase();
