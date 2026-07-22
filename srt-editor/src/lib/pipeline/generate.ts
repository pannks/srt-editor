import { extractAudioChunks } from "../audio/tauri";
import { transcribeChunk, type RawSegment } from "../gemini/client";
import { offsetSegments, segmentsToBlocks } from "../audio/merge";
import type { SubtitleBlock } from "../blocks/types";
import type { Settings } from "../../state/store";

export interface GenerateCallbacks {
  log: (message: string, status?: "info" | "run" | "ok" | "err") => void;
  progress: (done: number, total: number) => void;
}

/**
 * Full generation pipeline: extract + chunk audio (ffmpeg via Rust), transcribe
 * each chunk with Gemini, offset to absolute time, merge into subtitle blocks.
 */
export async function generateBlocks(
  mediaPath: string,
  settings: Settings,
  cb: GenerateCallbacks,
): Promise<SubtitleBlock[]> {
  if (!settings.apiKey) {
    throw new Error("No Gemini API key set — open Settings first.");
  }

  cb.log("Step 1/3 — extracting and chunking audio…", "run");
  const chunks = await extractAudioChunks(mediaPath, settings.chunkSecs);
  cb.log(`Audio ready: ${chunks.length} chunk(s)`, "ok");

  cb.log(
    `Step 2/3 — transcribing with ${settings.model} (${chunks.length} request(s))…`,
    "run",
  );
  const all: RawSegment[] = [];
  for (const [i, chunk] of chunks.entries()) {
    cb.progress(i, chunks.length);
    const label = `Chunk ${i + 1}/${chunks.length}`;
    cb.log(
      `${label}: sending ${chunk.durationSec.toFixed(1)}s of audio to Gemini…`,
      "run",
    );
    const startedAt = Date.now();
    const segments = await transcribeChunk({
      apiKey: settings.apiKey,
      model: settings.model,
      prompt: settings.prompt,
      chunkPath: chunk.path,
    });
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    cb.log(
      `${label}: ${segments.length} segment(s) received in ${elapsed}s`,
      "ok",
    );
    all.push(...offsetSegments(segments, chunk.startSec));
  }
  cb.progress(chunks.length, chunks.length);

  cb.log("Step 3/3 — merging segments into subtitle blocks…", "run");
  const blocks = segmentsToBlocks(all);
  cb.log(`Done: ${blocks.length} subtitle block(s)`, "ok");
  return blocks;
}
