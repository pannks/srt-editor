/**
 * Settings as they may leave this machine — inside a saved project, and inside
 * a project bundle handed to someone else.
 */

/** The fields that are credentials, wherever they sit in the settings object. */
export interface Secretive {
  apiKey?: string;
  translation?: { apiKey?: string };
}

/** Same settings minus the keys — the nested group loses only its own key. */
export type Shared<T extends Secretive> = Omit<T, "apiKey" | "translation"> & {
  translation?: Record<string, unknown>;
};

/**
 * Drop every API key. The fields are **removed**, not blanked: `mergeSettings`
 * spreads a stored snapshot over the current settings, so an absent field keeps
 * the reader's own key while a blank one would wipe it.
 */
export function stripSecrets<T extends Secretive>(settings: T): Shared<T> {
  const { apiKey: _apiKey, translation, ...rest } = settings;
  if (!translation) return rest as Shared<T>;
  const { apiKey: _translationKey, ...translationRest } = translation;
  return { ...rest, translation: translationRest } as Shared<T>;
}

/** True when a settings snapshot still carries a key — for tests and asserts. */
export function hasSecrets(settings: Secretive): boolean {
  return "apiKey" in settings || !!settings.translation?.apiKey;
}
