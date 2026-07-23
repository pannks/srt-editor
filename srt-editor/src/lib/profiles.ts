import type { Settings } from "../state/store";
import type { ProviderId } from "./translate/providers";

/**
 * A named bundle of "which model, where, with which prompt" for both stages.
 * Profiles stay on this machine: `stripSecrets` drops them from anything
 * exported, because each stage carries its API key.
 */
export interface ProfileStage {
  provider: ProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
}

export interface ModelProfile {
  id: string;
  name: string;
  transcription: ProfileStage & { chunkSecs: number };
  translation: ProfileStage;
}

const stage = (s: ProfileStage): ProfileStage => ({
  provider: s.provider,
  baseUrl: s.baseUrl,
  apiKey: s.apiKey,
  model: s.model,
  prompt: s.prompt,
});

export function profileFromSettings(
  name: string,
  settings: Settings,
): ModelProfile {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    transcription: {
      ...stage(settings.transcription),
      chunkSecs: settings.transcription.chunkSecs,
    },
    translation: stage(settings.translation),
  };
}

/**
 * Overlay the profile onto the current settings. Only the stage fields are
 * touched: targets, batch size and everything else the user tuned stay put.
 */
export function applySettingsProfile(
  settings: Settings,
  profile: ModelProfile,
): Settings {
  return {
    ...settings,
    transcription: { ...settings.transcription, ...profile.transcription },
    translation: { ...settings.translation, ...stage(profile.translation) },
  };
}
