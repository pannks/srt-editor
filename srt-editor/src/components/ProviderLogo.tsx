import {
  Anthropic,
  Gemini,
  LmStudio,
  Ollama,
  OpenAI,
  OpenRouter,
} from "@lobehub/icons";
import { Cloud, Server } from "lucide-react";
import type { ProviderId } from "../lib/translate/providers";

const BRAND: Partial<Record<ProviderId, React.ComponentType<{ size?: number }>>> = {
  ollama: Ollama,
  lmstudio: LmStudio,
  openai: OpenAI,
  openrouter: OpenRouter,
  anthropic: Anthropic,
  gemini: Gemini.Color,
};

/**
 * Brand mark for a provider choice. The generic "local" and "cloud" entries
 * have no brand, so they fall back to a plain lucide glyph.
 */
export function ProviderLogo({ id, size = 16 }: { id: ProviderId; size?: number }) {
  const Icon = BRAND[id];
  if (Icon) return <Icon size={size} />;
  return id === "local" ? <Server size={size} /> : <Cloud size={size} />;
}
