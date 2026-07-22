import {
  migrateProviderId,
  providerSpec,
  type ProviderId,
} from "./providers";

export type { ProviderId, ProviderApi } from "./providers";

export interface TranslationSettings {
  /** Which preset from `providers.ts` — Ollama, LM Studio, Anthropic, … */
  provider: ProviderId;
  /** Endpoint root. Fixed by the preset unless it is a self-hosted one. */
  baseUrl: string;
  /** Blank is normal for a local server. */
  apiKey: string;
  model: string;
  /** ISO code of the spoken language, or `""` to let the model detect it. */
  sourceLanguage: string;
  /** ISO codes to translate into; each becomes a line under every block. */
  targets: string[];
  /** How many neighbouring blocks travel with each request as context. */
  contextBlocks: number;
  /** How many blocks one request translates. */
  batchSize: number;
  prompt: string;
}

export const DEFAULT_TRANSLATION_PROMPT = `You are a professional subtitle translator.

Translate every numbered line from {source} into {target}.

Rules:
- Translate meaning, not words — the result must sound natural when spoken.
- Keep each line about as short as the original; subtitles are read at a glance.
- "Context before" and "Context after" are neighbouring subtitle lines. Use them to resolve pronouns, names and continued sentences, but NEVER translate or return them.
- Keep names, numbers and technical terms intact.
- Return one translation per input line, even if the line is a fragment.
- Return ONLY a JSON array of {"n": <number>, "text": "<translation>"} objects, with the same "n" values you were given.`;

export const DEFAULT_TRANSLATION: TranslationSettings = {
  provider: "ollama",
  baseUrl: providerSpec("ollama").baseUrl,
  apiKey: "",
  model: providerSpec("ollama").defaultModel,
  sourceLanguage: "",
  targets: [],
  contextBlocks: 2,
  batchSize: 12,
  prompt: DEFAULT_TRANSLATION_PROMPT,
};

export const MIN_BATCH_SIZE = 1;
export const MAX_BATCH_SIZE = 50;
export const MAX_CONTEXT_BLOCKS = 10;

/**
 * Switch preset: the URL follows the new provider, and the model is replaced
 * only when it cannot belong to the new one — keeping a hand-typed model that
 * still applies, and never leaving an Ollama tag selected for Anthropic.
 */
export function applyProvider(
  settings: TranslationSettings,
  id: ProviderId,
  knownModels: string[] = [],
): TranslationSettings {
  const spec = providerSpec(id);
  const keepModel =
    knownModels.includes(settings.model) &&
    providerSpec(settings.provider).api === spec.api;
  return {
    ...settings,
    provider: id,
    baseUrl: spec.baseUrl,
    model: keepModel ? settings.model : spec.defaultModel,
  };
}

/** Clamp the user-editable numbers to what the pipeline can actually send. */
export function normalizeTranslation(
  settings: TranslationSettings,
): TranslationSettings {
  const provider = migrateProviderId(settings.provider, settings.baseUrl);
  const spec = providerSpec(provider);
  return {
    ...settings,
    provider,
    // A fixed-endpoint provider ignores whatever URL was stored before.
    baseUrl: spec.editableBaseUrl ? settings.baseUrl : spec.baseUrl,
    batchSize: Math.min(
      MAX_BATCH_SIZE,
      Math.max(MIN_BATCH_SIZE, Math.round(settings.batchSize) || 1),
    ),
    contextBlocks: Math.min(
      MAX_CONTEXT_BLOCKS,
      Math.max(0, Math.round(settings.contextBlocks) || 0),
    ),
    targets: [...new Set(settings.targets.filter((t) => t.trim() !== ""))],
  };
}
