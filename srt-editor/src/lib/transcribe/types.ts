import {
  PROVIDERS,
  migrateProviderId,
  providerSpec,
  type ProviderId,
  type ProviderSpec,
} from "../translate/providers";
import {
  DEFAULT_CHUNK_SECS,
  DEFAULT_MODEL,
  DEFAULT_PROMPT,
} from "../gemini/prompt";

/**
 * Transcription needs a model that accepts raw audio. Anthropic's API does
 * not, so it is the one preset missing here; everything OpenAI-compatible is
 * offered because audio support depends on the chosen model, not the server.
 */
export const TRANSCRIBE_PROVIDERS: ProviderSpec[] = PROVIDERS.filter(
  (p) => p.api !== "anthropic",
);

/** The strongly recommended default; shown as a hint in Settings. */
export const RECOMMENDED_TRANSCRIBE_MODEL = DEFAULT_MODEL;

export interface TranscriptionSettings {
  provider: ProviderId;
  /** Endpoint root. Fixed by the preset unless it is a self-hosted one. */
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  /** Seconds of audio per request, 30–1800. */
  chunkSecs: number;
  /**
   * Command line that starts an ACP agent on stdio (only used when the
   * provider is `acp`), e.g. `gemini --experimental-acp`.
   */
  agentCmd: string;
}

export const MIN_CHUNK_SECS = 30;
export const MAX_CHUNK_SECS = 1800;

export const DEFAULT_TRANSCRIPTION: TranscriptionSettings = {
  provider: "gemini",
  baseUrl: providerSpec("gemini").baseUrl,
  apiKey: "",
  model: DEFAULT_MODEL,
  prompt: DEFAULT_PROMPT,
  chunkSecs: DEFAULT_CHUNK_SECS,
  agentCmd: "",
};

export function normalizeTranscription(
  settings: TranscriptionSettings,
): TranscriptionSettings {
  const provider = migrateProviderId(settings.provider, settings.baseUrl);
  const spec = providerSpec(provider);
  return {
    ...settings,
    provider,
    baseUrl: spec.editableBaseUrl ? settings.baseUrl : spec.baseUrl,
    // Settings saved before 0.5.0 predate the field.
    agentCmd: settings.agentCmd ?? "",
    chunkSecs: Math.min(
      MAX_CHUNK_SECS,
      Math.max(MIN_CHUNK_SECS, Math.round(settings.chunkSecs) || DEFAULT_CHUNK_SECS),
    ),
  };
}
