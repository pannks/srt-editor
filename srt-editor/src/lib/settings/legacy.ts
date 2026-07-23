import { DEFAULT_TRANSCRIPTION } from "../transcribe/types";

/**
 * Shapes older settings snapshots used, mapped onto the current one.
 *
 * Settings are stored as JSON in `localStorage` and SQLite, so a snapshot
 * written by any shipped version can turn up at load time. Renaming a field
 * without a mapping here silently resets it to its default.
 */
export interface LegacySettings {
  /** v0.3.0 dev builds: one overlay language instead of a list. */
  overlayLanguage?: string;
  /** ≤ v0.3.x: transcription was Gemini-only and lived at the top level. */
  apiKey?: string;
  model?: string;
  prompt?: string;
  chunkSecs?: number;
}

/**
 * Rewrite legacy fields in a stored snapshot. Returns a new object; the legacy
 * keys are dropped so they cannot come back on the next save.
 */
export function migrateLegacySettings<T extends Record<string, unknown>>(
  stored: T & LegacySettings,
): T {
  const { overlayLanguage, apiKey, model, prompt, chunkSecs, ...rest } = stored;
  const patch = rest as T & {
    overlayLanguages?: string[];
    transcription?: Record<string, unknown>;
  };
  if (overlayLanguage !== undefined && patch.overlayLanguages === undefined) {
    patch.overlayLanguages = overlayLanguage ? [overlayLanguage] : [];
  }
  // The flat Gemini fields become the transcription group. A snapshot that
  // already has the group wins — it is the newer shape.
  if (
    patch.transcription === undefined &&
    (apiKey !== undefined ||
      model !== undefined ||
      prompt !== undefined ||
      chunkSecs !== undefined)
  ) {
    patch.transcription = {
      ...DEFAULT_TRANSCRIPTION,
      ...(apiKey !== undefined ? { apiKey } : {}),
      ...(model !== undefined ? { model } : {}),
      ...(prompt !== undefined ? { prompt } : {}),
      ...(chunkSecs !== undefined ? { chunkSecs } : {}),
    };
  }
  return patch;
}
