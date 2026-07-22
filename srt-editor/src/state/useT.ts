import { useMemo } from "react";
import { translate, type Translator } from "../lib/i18n";
import { useAppStore } from "./store";

/** Translator bound to the interface language, re-made only when it changes. */
export function useT(): Translator {
  const lang = useAppStore((s) => s.settings.uiLanguage);
  return useMemo<Translator>(
    () => (key, params) => translate(lang, key, params),
    [lang],
  );
}
