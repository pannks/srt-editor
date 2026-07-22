import type { SubtitleBlock } from "./types";

/** Translations of one block, keyed by language code. */
export type TranslationMap = Record<string, string>;

/**
 * Translations in start-time order — the same order `blocksToSrt` writes cues
 * in, which is what lets a saved project pair the two back up on load. Block
 * ids are regenerated when the SRT is parsed, so position is the only key.
 */
export function extractTranslations(blocks: SubtitleBlock[]): TranslationMap[] {
  return [...blocks]
    .sort((a, b) => a.start - b.start)
    .map((b) => ({ ...b.translations }));
}

/** Put a stored translation list back onto freshly parsed blocks. */
export function attachTranslations(
  blocks: SubtitleBlock[],
  stored: TranslationMap[] | null | undefined,
): SubtitleBlock[] {
  if (!stored || stored.length === 0) return blocks;
  const order = [...blocks]
    .sort((a, b) => a.start - b.start)
    .map((b) => b.id);
  const byId = new Map<string, TranslationMap>();
  order.forEach((id, i) => {
    const map = stored[i];
    if (map && Object.keys(map).length > 0) byId.set(id, map);
  });
  return blocks.map((b) => {
    const translations = byId.get(b.id);
    return translations ? { ...b, translations } : b;
  });
}

/** Language codes present anywhere in the list, in first-seen order. */
export function translatedLanguages(blocks: SubtitleBlock[]): string[] {
  const seen: string[] = [];
  for (const block of blocks) {
    for (const code of Object.keys(block.translations ?? {})) {
      if (!seen.includes(code)) seen.push(code);
    }
  }
  return seen;
}

/** How many blocks already have a translation in `lang`. */
export function translatedCount(blocks: SubtitleBlock[], lang: string): number {
  return blocks.filter((b) => (b.translations?.[lang] ?? "").trim() !== "")
    .length;
}
