import { invoke } from "@tauri-apps/api/core";

export interface RawSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscribeParams {
  apiKey: string;
  model: string;
  prompt: string;
  /** path of the WAV chunk on disk */
  chunkPath: string;
}

/**
 * Transcribe one audio chunk; returns segments timed relative to the chunk.
 *
 * The HTTP call happens in Rust — the inline audio payload is far larger than
 * the webview's fetch will accept.
 */
export async function transcribeChunk(
  params: TranscribeParams,
): Promise<RawSegment[]> {
  const text = await invoke<string>("transcribe_chunk", {
    chunkPath: params.chunkPath,
    apiKey: params.apiKey,
    model: params.model,
    prompt: params.prompt,
  });
  return parseSegmentsJson(text);
}

/** Parse and sanitize the model's JSON segment list. */
export function parseSegmentsJson(text: string): RawSegment[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Gemini response is not valid JSON: ${text.slice(0, 120)}…`);
  }
  if (!Array.isArray(data)) throw new Error("Gemini response is not an array");
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
