import { invoke } from "@tauri-apps/api/core";

export interface ChunkInfo {
  path: string;
  startSec: number;
  durationSec: number;
}

export interface Waveform {
  /** Peak amplitude per bucket, 0..1. */
  peaks: number[];
  durationSec: number;
}

export const checkFfmpeg = (): Promise<string> => invoke("check_ffmpeg");

/** Peak envelope decoded by ffmpeg — the webview cannot decode most containers. */
export const waveformPeaks = (
  inputPath: string,
  buckets: number,
): Promise<Waveform> => invoke("waveform_peaks", { inputPath, buckets });

export const extractAudioChunks = (
  inputPath: string,
  chunkSecs: number,
): Promise<ChunkInfo[]> =>
  invoke("extract_audio_chunks", { inputPath, chunkSecs });

export const saveTextFile = (path: string, contents: string): Promise<void> =>
  invoke("save_text_file", { path, contents });

export const readTextFile = (path: string): Promise<string> =>
  invoke("read_text_file", { path });

/** Used before pointing the player at a path that came from another machine. */
export const pathExists = (path: string): Promise<boolean> =>
  invoke("path_exists", { path });
