import { invoke } from "@tauri-apps/api/core";

export interface ChunkInfo {
  path: string;
  startSec: number;
  durationSec: number;
}

export const checkFfmpeg = (): Promise<string> => invoke("check_ffmpeg");

export const extractAudioChunks = (
  inputPath: string,
  chunkSecs: number,
): Promise<ChunkInfo[]> =>
  invoke("extract_audio_chunks", { inputPath, chunkSecs });

export const saveTextFile = (path: string, contents: string): Promise<void> =>
  invoke("save_text_file", { path, contents });

export const readTextFile = (path: string): Promise<string> =>
  invoke("read_text_file", { path });
