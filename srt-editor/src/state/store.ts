import { create } from "zustand";
import type { SubtitleBlock } from "../lib/blocks/types";
import {
  mergeWithPrevious,
  mergeWithNext,
  splitBlock,
  setBlockTimes,
  updateBlockText,
  removeBlock,
} from "../lib/blocks/ops";
import {
  DEFAULT_CHUNK_SECS,
  DEFAULT_MODEL,
  DEFAULT_PROMPT,
} from "../lib/gemini/prompt";

export type LogStatus = "info" | "run" | "ok" | "err";

export interface LogEntry {
  id: number;
  time: string;
  message: string;
  status: LogStatus;
}

/** `top` stacks the player above the blocks; `side` puts it in a column, which suits 9:16 video. */
export type Layout = "top" | "side";

export interface Settings {
  apiKey: string;
  model: string;
  chunkSecs: number;
  prompt: string;
  layout: Layout;
}

const SETTINGS_KEY = "srt-editor.settings";

function loadSettings(): Settings {
  const defaults: Settings = {
    apiKey: "",
    model: DEFAULT_MODEL,
    chunkSecs: DEFAULT_CHUNK_SECS,
    prompt: DEFAULT_PROMPT,
    layout: "top",
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}

export type MediaKind = "video" | "audio";

interface AppState {
  mediaPath: string | null;
  mediaUrl: string | null;
  mediaKind: MediaKind;
  blocks: SubtitleBlock[];
  log: LogEntry[];
  generating: boolean;
  progress: { done: number; total: number } | null;
  currentTime: number;
  settings: Settings;

  setMedia: (path: string, url: string, kind: MediaKind) => void;
  appendLog: (message: string, status?: LogStatus) => void;
  setGenerating: (v: boolean) => void;
  setProgress: (p: { done: number; total: number } | null) => void;
  setCurrentTime: (t: number) => void;
  setBlocks: (blocks: SubtitleBlock[]) => void;
  editText: (id: string, text: string) => void;
  mergePrev: (id: string) => void;
  mergeNext: (id: string) => void;
  split: (id: string, wordIndex?: number) => void;
  setTimes: (id: string, start: number, end: number) => void;
  remove: (id: string) => void;
  saveSettings: (s: Settings) => void;
  setLayout: (layout: Layout) => void;
}

let logId = 0;

export const useAppStore = create<AppState>((set) => ({
  mediaPath: null,
  mediaUrl: null,
  mediaKind: "video",
  blocks: [],
  log: [],
  generating: false,
  progress: null,
  currentTime: 0,
  settings: loadSettings(),

  setMedia: (path, url, kind) =>
    set({ mediaPath: path, mediaUrl: url, mediaKind: kind, blocks: [] }),
  appendLog: (message, status = "info") =>
    set((s) => ({
      log: [
        ...s.log,
        {
          id: ++logId,
          time: new Date().toLocaleTimeString(),
          message,
          status,
        },
      ],
    })),
  setGenerating: (generating) => set({ generating }),
  setProgress: (progress) => set({ progress }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setBlocks: (blocks) => set({ blocks }),
  editText: (id, text) =>
    set((s) => ({ blocks: updateBlockText(s.blocks, id, text) })),
  mergePrev: (id) => set((s) => ({ blocks: mergeWithPrevious(s.blocks, id) })),
  mergeNext: (id) => set((s) => ({ blocks: mergeWithNext(s.blocks, id) })),
  split: (id, wordIndex) =>
    set((s) => ({ blocks: splitBlock(s.blocks, id, wordIndex) })),
  setTimes: (id, start, end) =>
    set((s) => ({ blocks: setBlockTimes(s.blocks, id, start, end) })),
  remove: (id) => set((s) => ({ blocks: removeBlock(s.blocks, id) })),
  saveSettings: (settings) => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    set({ settings });
  },
  setLayout: (layout) =>
    set((s) => {
      const settings = { ...s.settings, layout };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      return { settings };
    }),
}));

// Dev-only handle so tooling/agents can drive the store from the console.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__store = useAppStore;
}
