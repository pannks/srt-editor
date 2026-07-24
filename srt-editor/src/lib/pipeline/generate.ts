import { listen } from "@tauri-apps/api/event";
import { extractAudioChunks } from "../audio/tauri";
import { transcribeChunk, type RawSegment } from "../transcribe/client";
import { offsetSegments, segmentsToBlocks } from "../audio/merge";
import { providerSpec } from "../translate/providers";
import type { SubtitleBlock } from "../blocks/types";
import type { Settings } from "../../state/store";

export interface GenerateCallbacks {
  log: (message: string, status?: "info" | "run" | "ok" | "err") => void;
  progress: (done: number, total: number) => void;
}

/** Live agent activity streamed from Rust while an ACP chunk runs. */
interface AcpProgress {
  kind: string;
  detail: string;
}

const acpProgressLine = (p: AcpProgress): string =>
  p.kind === "tool"
    ? `Agent: ${p.detail}`
    : p.kind === "thinking"
      ? "Agent: thinking…"
      : `Agent: writing the reply (${p.detail})`;

/**
 * Full generation pipeline: extract + chunk audio (ffmpeg via Rust), transcribe
 * each chunk with the configured provider, offset to absolute time, merge into
 * subtitle blocks.
 */
export async function generateBlocks(
  mediaPath: string,
  settings: Settings,
  cb: GenerateCallbacks,
): Promise<SubtitleBlock[]> {
  const transcription = settings.transcription;
  const spec = providerSpec(transcription.provider);
  const viaAcp = spec.api === "acp";
  if (viaAcp) {
    // An agent brings its own login and model, so those checks don't apply.
    if (!transcription.agentCmd.trim()) {
      throw new Error("No ACP agent command set — open Settings first.");
    }
  } else {
    if (spec.needsKey && !transcription.apiKey) {
      throw new Error(`No ${spec.label} API key set — open Settings first.`);
    }
    if (!transcription.model.trim()) {
      throw new Error("No transcription model set — open Settings first.");
    }
  }
  /** What is doing the transcribing, for the log lines. */
  const engine = viaAcp ? transcription.agentCmd.trim() : transcription.model;

  cb.log("Step 1/3 — extracting and chunking audio…", "run");
  const chunks = await extractAudioChunks(mediaPath, transcription.chunkSecs);
  cb.log(`Audio ready: ${chunks.length} chunk(s)`, "ok");

  cb.log(
    `Step 2/3 — transcribing with ${engine} via ${spec.label} (${chunks.length} request(s))…`,
    "run",
  );
  // An agent turn can take minutes; relay its activity so the wait is not
  // silent. HTTP providers stream nothing, so there is nothing to listen to.
  const unlisten = viaAcp
    ? await listen<AcpProgress>("acp-progress", (e) =>
        cb.log(acpProgressLine(e.payload), "info"),
      )
    : undefined;
  const all: RawSegment[] = [];
  try {
    for (const [i, chunk] of chunks.entries()) {
      cb.progress(i, chunks.length);
      const label = `Chunk ${i + 1}/${chunks.length}`;
      cb.log(
        `${label}: sending ${chunk.durationSec.toFixed(1)}s of audio to ${spec.label}…`,
        "run",
      );
      const startedAt = Date.now();
      const segments = await transcribeChunk(transcription, chunk.path);
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      cb.log(
        `${label}: ${segments.length} segment(s) received in ${elapsed}s`,
        "ok",
      );
      all.push(...offsetSegments(segments, chunk.startSec));
    }
  } finally {
    unlisten?.();
  }
  cb.progress(chunks.length, chunks.length);

  // A model that cannot hear the audio answers with an empty list rather than
  // an error (the provider accepted the request but ignored the audio part).
  // Surface that instead of silently returning zero blocks.
  if (all.length === 0) {
    throw new Error(
      `No segments came back from ${engine} via ${spec.label} — ` +
        `the model may not accept audio input. Try a transcription model such ` +
        `as ${spec.label} audio, Gemini, or gpt-4o-audio.`,
    );
  }

  cb.log("Step 3/3 — merging segments into subtitle blocks…", "run");
  const blocks = segmentsToBlocks(all);
  cb.log(`Done: ${blocks.length} subtitle block(s)`, "ok");
  return blocks;
}
