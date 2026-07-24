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
 * The heavy lifting happens in Rust — the inline audio payload is far larger
 * than the webview's fetch will accept. `api` picks the wire protocol there:
 * Gemini native, an OpenAI-compatible chat completion, or — for `acp` — a
 * locally installed agent driven over the Agent Client Protocol.
 */
export async function transcribeChunk(
  settings: TranscriptionSettings,
  chunkPath: string,
): Promise<RawSegment[]> {
  const text =
    settings.provider === "acp"
      ? await invoke<string>("acp_transcribe_chunk", {
          chunkPath,
          command: settings.agentCmd,
          prompt: settings.prompt,
        })
      : await invoke<string>("transcribe_chunk", {
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

/**
 * Pull each top-level `{…}` object out of a partial array. A small-context
 * server (Ollama defaults to 4096 tokens) cuts the reply off mid-array once
 * the audio plus output fill the window, so `JSON.parse` on the whole string
 * fails; scanning for balanced braces recovers every object that did finish
 * and drops the truncated tail. Also skips any prose around the array.
 */
function salvageObjects(raw: string): unknown[] {
  const out: unknown[] = [];
  let depth = 0;
  let objStart = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === "}" && depth > 0) {
      depth--;
      if (depth === 0 && objStart >= 0) {
        try {
          out.push(JSON.parse(raw.slice(objStart, i + 1)));
        } catch {
          /* a malformed object is dropped, not fatal */
        }
        objStart = -1;
      }
    }
  }
  return out;
}

/** Parse and sanitize the model's JSON segment list. */
export function parseSegmentsJson(text: string): RawSegment[] {
  const raw = stripFences(text);
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    // Truncated or prose-wrapped reply: recover whatever objects are intact.
    // An empty salvage means nothing parseable came back at all — that is the
    // real error; a cleanly parsed empty array (a silent chunk) is not.
    data = salvageObjects(raw);
    if (Array.isArray(data) && data.length === 0) {
      throw new Error(`model response is not valid JSON: ${raw.slice(0, 120)}…`);
    }
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
