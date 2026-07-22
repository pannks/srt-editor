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
}

/**
 * Rewrite legacy fields in a stored snapshot. Returns a new object; the legacy
 * keys are dropped so they cannot come back on the next save.
 */
export function migrateLegacySettings<T extends Record<string, unknown>>(
  stored: T & LegacySettings,
): T {
  const { overlayLanguage, ...rest } = stored;
  const patch = rest as T & { overlayLanguages?: string[] };
  if (overlayLanguage !== undefined && patch.overlayLanguages === undefined) {
    patch.overlayLanguages = overlayLanguage ? [overlayLanguage] : [];
  }
  return patch;
}
