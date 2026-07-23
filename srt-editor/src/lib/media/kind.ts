/** Containers the player and ffmpeg handle. */
export const VIDEO_EXT = ["mp4", "mov", "mkv", "webm", "avi", "m4v"];
export const AUDIO_EXT = ["mp3", "wav", "m4a", "aac", "flac", "ogg", "opus"];
export const SUBTITLE_EXT = ["srt", "vtt"];

/** What a dropped or picked path is, or `null` when the app cannot open it. */
export type OpenableKind = "video" | "audio" | "srt" | "vtt" | null;

export function extensionOf(path: string): string {
  const file = path.split(/[\\/]/).pop() ?? path;
  const dot = file.lastIndexOf(".");
  return dot === -1 ? "" : file.slice(dot + 1).toLowerCase();
}

export function classifyPath(path: string): OpenableKind {
  const ext = extensionOf(path);
  if (AUDIO_EXT.includes(ext)) return "audio";
  if (VIDEO_EXT.includes(ext)) return "video";
  if (ext === "vtt") return "vtt";
  if (SUBTITLE_EXT.includes(ext)) return "srt";
  return null;
}

/** First path the app knows how to open, so a multi-file drop still works. */
export function firstOpenable(paths: string[]): string | null {
  return paths.find((p) => classifyPath(p) !== null) ?? null;
}
