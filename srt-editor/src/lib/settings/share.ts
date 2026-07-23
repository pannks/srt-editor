/**
 * Settings as they may leave this machine — inside a saved project, and inside
 * a project bundle handed to someone else.
 */

/** The fields that are credentials, wherever they sit in the settings object. */
export interface Secretive {
  /** ≤ v0.3.x stored the Gemini key at the top level. */
  apiKey?: string;
  transcription?: { apiKey?: string };
  translation?: { apiKey?: string };
  /** Each saved profile carries the keys of both stages. */
  profiles?: unknown[];
}

/** Same settings minus the keys — the nested groups lose only their own key. */
export type Shared<T extends Secretive> = Omit<
  T,
  "apiKey" | "transcription" | "translation" | "profiles"
> & {
  transcription?: Record<string, unknown>;
  translation?: Record<string, unknown>;
};

/**
 * Drop every API key. The fields are **removed**, not blanked: `mergeSettings`
 * spreads a stored snapshot over the current settings, so an absent field keeps
 * the reader's own key while a blank one would wipe it. Profiles are dropped
 * wholesale — they exist to hold credentials.
 */
export function stripSecrets<T extends Secretive>(settings: T): Shared<T> {
  const {
    apiKey: _apiKey,
    transcription,
    translation,
    profiles: _profiles,
    ...rest
  } = settings;
  const out = rest as Shared<T>;
  if (transcription) {
    const { apiKey: _tKey, ...transcriptionRest } = transcription;
    out.transcription = transcriptionRest;
  }
  if (translation) {
    const { apiKey: _translationKey, ...translationRest } = translation;
    out.translation = translationRest;
  }
  return out;
}

/** True when a settings snapshot still carries a key — for tests and asserts. */
export function hasSecrets(settings: Secretive): boolean {
  return (
    "apiKey" in settings ||
    !!settings.transcription?.apiKey ||
    !!settings.translation?.apiKey ||
    (settings.profiles?.length ?? 0) > 0
  );
}
