import { DEFAULT_MODEL as GEMINI_DEFAULT_MODEL } from "../gemini/prompt";

/** What the user picks in Settings. */
export type ProviderId =
  | "ollama"
  | "lmstudio"
  | "local"
  | "openai"
  | "openrouter"
  | "anthropic"
  | "gemini"
  | "cloud"
  | "acp";

/**
 * The wire protocol behind it — all Rust needs to know. `acp` is not HTTP at
 * all: an installed agent subprocess spoken to over the Agent Client Protocol.
 */
export type ProviderApi = "openai" | "anthropic" | "gemini" | "acp";

export interface ProviderSpec {
  id: ProviderId;
  label: string;
  api: ProviderApi;
  /** Runs on the user's machine: no key, and the model list is free to fetch. */
  local: boolean;
  /** Fixed for the hosted APIs, editable for anything self-hosted. */
  baseUrl: string;
  editableBaseUrl: boolean;
  /** A blank key is fine for a local server. */
  needsKey: boolean;
  /** Pre-filled until the model list is detected. */
  defaultModel: string;
}

export const PROVIDERS: ProviderSpec[] = [
  {
    id: "ollama",
    label: "Ollama",
    api: "openai",
    local: true,
    baseUrl: "http://localhost:11434/v1",
    editableBaseUrl: true,
    needsKey: false,
    defaultModel: "qwen3:8b",
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    api: "openai",
    local: true,
    baseUrl: "http://localhost:1234/v1",
    editableBaseUrl: true,
    needsKey: false,
    defaultModel: "",
  },
  {
    id: "local",
    label: "Other local server",
    api: "openai",
    local: true,
    baseUrl: "http://localhost:8080/v1",
    editableBaseUrl: true,
    needsKey: false,
    defaultModel: "",
  },
  {
    id: "acp",
    label: "Agent (ACP)",
    api: "acp",
    local: true,
    baseUrl: "",
    editableBaseUrl: false,
    needsKey: false,
    defaultModel: "",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    api: "anthropic",
    local: false,
    baseUrl: "https://api.anthropic.com/v1",
    editableBaseUrl: false,
    needsKey: true,
    defaultModel: "claude-sonnet-5",
  },
  {
    id: "openai",
    label: "OpenAI",
    api: "openai",
    local: false,
    baseUrl: "https://api.openai.com/v1",
    editableBaseUrl: false,
    needsKey: true,
    defaultModel: "gpt-4o-mini",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    api: "gemini",
    local: false,
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    editableBaseUrl: false,
    needsKey: true,
    defaultModel: GEMINI_DEFAULT_MODEL,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    api: "openai",
    local: false,
    baseUrl: "https://openrouter.ai/api/v1",
    editableBaseUrl: false,
    needsKey: true,
    defaultModel: "",
  },
  {
    id: "cloud",
    label: "Other cloud (OpenAI-compatible)",
    api: "openai",
    local: false,
    baseUrl: "https://openrouter.ai/api/v1",
    editableBaseUrl: true,
    needsKey: true,
    defaultModel: "",
  },
];

const BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));

// Translation stays HTTP-only for now, so the ACP entry is left out here;
// transcription builds its own list in `transcribe/types.ts`.
export const LOCAL_PROVIDERS = PROVIDERS.filter((p) => p.local && p.api !== "acp");
export const CLOUD_PROVIDERS = PROVIDERS.filter((p) => !p.local);

/** Unknown ids fall back to Ollama, which is the safe local default. */
export function providerSpec(id: string): ProviderSpec {
  return BY_ID.get(id as ProviderId) ?? PROVIDERS[0];
}

export const providerApi = (id: string): ProviderApi => providerSpec(id).api;

/**
 * Settings written before the provider list existed only knew `openai` (which
 * meant "any OpenAI-compatible server", defaulting to Ollama) and `gemini`.
 * Recognise the old value by the URL it was paired with.
 */
export function migrateProviderId(id: string, baseUrl: string): ProviderId {
  if (BY_ID.has(id as ProviderId) && id !== "openai") return id as ProviderId;
  if (id === "openai") {
    if (baseUrl.includes("11434")) return "ollama";
    if (baseUrl.includes("1234")) return "lmstudio";
    if (/localhost|127\.0\.0\.1|\[::1\]/.test(baseUrl)) return "local";
    if (baseUrl.includes("api.openai.com") || baseUrl.trim() === "")
      return "openai";
    return "cloud";
  }
  return "ollama";
}

export interface ModelOption {
  id: string;
  label: string;
}

/** Where the provider lists its models. */
export function modelsUrl(id: string, baseUrl: string): string {
  const spec = providerSpec(id);
  const base = (spec.editableBaseUrl ? baseUrl : spec.baseUrl)
    .trim()
    .replace(/\/+$/, "");
  return `${base || spec.baseUrl}/models`;
}

/**
 * Read a model list out of whichever shape the provider answers with. Kept in
 * TypeScript, like the other response parsing, so it stays unit-tested.
 */
export function parseModelList(api: ProviderApi, body: string): ModelOption[] {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`model list is not JSON: ${body.trim().slice(0, 120)}…`);
  }
  const root = data as Record<string, unknown>;
  const raw = Array.isArray(root.data)
    ? root.data
    : Array.isArray(root.models)
      ? root.models
      : null;
  if (!raw) throw new Error("no model list in the reply");

  const out: ModelOption[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      out.push({ id: item, label: item });
      continue;
    }
    if (typeof item !== "object" || item === null) continue;
    const model = item as Record<string, unknown>;
    if (api === "gemini") {
      const name = typeof model.name === "string" ? model.name : "";
      const methods = model.supportedGenerationMethods;
      // Embedding and legacy models cannot answer a chat request.
      if (Array.isArray(methods) && !methods.includes("generateContent")) continue;
      const id = name.replace(/^models\//, "");
      if (id) {
        out.push({
          id,
          label:
            typeof model.displayName === "string" && model.displayName
              ? `${model.displayName} (${id})`
              : id,
        });
      }
      continue;
    }
    const id = typeof model.id === "string" ? model.id : "";
    if (!id) continue;
    const display =
      typeof model.display_name === "string" ? model.display_name : "";
    out.push({ id, label: display ? `${display} (${id})` : id });
  }

  const seen = new Set<string>();
  return out
    .filter((m) => (seen.has(m.id) ? false : seen.add(m.id)))
    .sort((a, b) => a.id.localeCompare(b.id));
}
