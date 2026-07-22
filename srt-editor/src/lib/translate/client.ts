import { invoke } from "@tauri-apps/api/core";
import {
  modelsUrl,
  parseModelList,
  providerApi,
  providerSpec,
  type ModelOption,
  type ProviderApi,
} from "./providers";

export interface ChatRequest {
  /** Wire protocol, not the preset id — see `providerApi`. */
  api: ProviderApi;
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
}

/**
 * One chat completion, returned as raw text for the parser in `batch.ts`.
 *
 * The call runs in Rust: a local server on `http://localhost` is plain HTTP,
 * which the webview blocks from the app's origin, and keeping every provider
 * behind one command means the frontend never touches provider-specific HTTP.
 */
export const chatComplete = (request: ChatRequest): Promise<string> =>
  invoke<string>("translate_chat", { request });

/** Raw body of the provider's model-list endpoint. */
const fetchModels = (
  api: ProviderApi,
  url: string,
  apiKey: string,
): Promise<string> => invoke<string>("list_models", { api, url, apiKey });

/**
 * Ask the provider which models it has. Ollama and LM Studio answer without a
 * key, which is what makes "detect" worth a button rather than a text field.
 */
export async function listModels(
  provider: string,
  baseUrl: string,
  apiKey: string,
): Promise<ModelOption[]> {
  const spec = providerSpec(provider);
  if (spec.needsKey && apiKey.trim() === "") {
    throw new Error("an API key is needed to list this provider's models");
  }
  const api = providerApi(provider);
  const body = await fetchModels(api, modelsUrl(provider, baseUrl), apiKey);
  return parseModelList(api, body);
}

/** Smallest possible round-trip, used by the Settings "Test connection" button. */
export const pingProvider = (
  request: Omit<ChatRequest, "system" | "user">,
): Promise<string> =>
  chatComplete({
    ...request,
    system: "You are a translation service. Answer with a single word.",
    user: "Reply with exactly: OK",
  });
