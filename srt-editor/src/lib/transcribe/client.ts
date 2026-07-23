import { invoke } from "@tauri-apps/api/core";
import { providerApi } from "../translate/providers";
import type { TranscriptionSettings } from "./types";

export interface RawSegment {
  start: number;
  end: number;
  text: string;
}

/**
 * Transcribe one audio chunk; returns segments timed relative to the chunk.
 *
 * The HTTP call happens in Rust — the inline audio payload is far larger than
 * the webview's fetch will accept — and the wire protocol is chosen there from
 * `api`: Gemini native, or an OpenAI-compatible chat completion.
 */
export async function transcribeChunk(
  settings: TranscriptionSettings,
  chunkPath: string,
): Promise<RawSegment[]> {
  const text = await invoke<string>("transcribe_chunk", {
    chunkPath,
    api: providerApi(settings.provider),
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    model: settings.model,
    prompt: settings.prompt,
  });
  return parseSegmentsJson(text);
}

/**
 * Gemini answers under a response schema; an OpenAI-compatible model answers
 * free text that usually — but not always — arrives fenced.
 */
export function stripFences(text: string): string {
  const trimmed = text.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return match ? match[1] : trimmed;
}

/** Parse and sanitize the model's JSON segment list. */
export function parseSegmentsJson(text: string): RawSegment[] {
  const raw = stripFences(text);
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`model response is not valid JSON: ${raw.slice(0, 120)}…`);
  }
  if (!Array.isArray(data)) throw new Error("model response is not an array");
  const segments: RawSegment[] = [];
  for (const item of data) {
    if (typeof item !== "object" || item === null) continue;
    const { start, end, text: t } = item as Record<string, unknown>;
    if (typeof start !== "number" || typeof end !== "number") continue;
    if (typeof t !== "string" || t.trim() === "") continue;
    segments.push({ start, end: Math.max(end, start), text: t.trim() });
  }
  segments.sort((a, b) => a.start - b.start);
  return segments;
}
