import type { SubtitleBlock } from "./types";

/** Plain-text search options — no regex, what the user types is matched literally. */
export interface ReplaceOptions {
  matchCase: boolean;
  /** Also search and replace inside every translated line. */
  includeTranslations: boolean;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const matcher = (query: string, matchCase: boolean) =>
  new RegExp(escapeRegExp(query), matchCase ? "g" : "gi");

/** How many times the query occurs across the blocks. Empty query matches nothing. */
export function countMatches(
  blocks: SubtitleBlock[],
  query: string,
  opts: ReplaceOptions,
): number {
  if (query === "") return 0;
  const re = matcher(query, opts.matchCase);
  let count = 0;
  for (const b of blocks) {
    count += b.text.match(re)?.length ?? 0;
    if (opts.includeTranslations && b.translations) {
      for (const line of Object.values(b.translations)) {
        count += line.match(re)?.length ?? 0;
      }
    }
  }
  return count;
}

/**
 * Replace every occurrence of the query in every block. A translation replaced
 * down to whitespace is dropped, matching how hand-clearing a line behaves.
 */
export function replaceAll(
  blocks: SubtitleBlock[],
  query: string,
  replacement: string,
  opts: ReplaceOptions,
): { blocks: SubtitleBlock[]; replaced: number } {
  if (query === "") return { blocks, replaced: 0 };
  const re = matcher(query, opts.matchCase);
  let replaced = 0;

  const swap = (text: string): string => {
    const hits = text.match(re)?.length ?? 0;
    if (hits === 0) return text;
    replaced += hits;
    return text.replace(re, replacement);
  };

  const out = blocks.map((b) => {
    const before = replaced;
    const text = swap(b.text);
    let translations = b.translations;
    if (opts.includeTranslations && b.translations) {
      const next: Record<string, string> = {};
      for (const [lang, line] of Object.entries(b.translations)) {
        const swapped = swap(line);
        if (swapped.trim() !== "") next[lang] = swapped;
      }
      translations = Object.keys(next).length > 0 ? next : undefined;
    }
    return replaced === before ? b : { ...b, text, translations };
  });

  return replaced === 0 ? { blocks, replaced } : { blocks: out, replaced };
}
