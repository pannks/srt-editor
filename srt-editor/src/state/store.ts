import { create } from "zustand";
import type { SubtitleBlock } from "../lib/blocks/types";
import {
  mergeWithPrevious,
  mergeWithNext,
  splitBlock,
  cutBlockAtCaret,
  setBlockTimes,
  updateBlockText,
  updateBlockTranslation,
  removeBlock,
} from "../lib/blocks/ops";
import { applyTranslations, stripLanguage } from "../lib/translate/batch";
import {
  DEFAULT_TRANSLATION,
  type TranslationSettings,
} from "../lib/translate/types";
import {
  DEFAULT_TRANSCRIPTION,
  type TranscriptionSettings,
} from "../lib/transcribe/types";
import type { ModelProfile } from "../lib/profiles";
import {
  DEFAULT_CAPTION_LAYERS,
  makeCaptionLayer,
  nextLayerPosY,
  normalizeLayer,
  type CaptionLayer,
} from "../lib/captions/types";
import {
  DEFAULT_EXPORT_PATTERN,
  DEFAULT_EXPORT_PREFIX,
} from "../lib/srt/naming";
import { isUiLanguage, type UiLanguage } from "../lib/i18n";
import { isThemeMode, type ThemeMode } from "../lib/theme";
import { migrateLegacySettings } from "../lib/settings/legacy";
import { getSetting, setSetting } from "../lib/db/projects";

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
  transcription: TranscriptionSettings;
  layout: Layout;
  /** Color theme; `system` follows the OS preference live. */
  theme: ThemeMode;
  /** Width of the player column in the `side` layout, pixels. */
  sidebarWidth: number;
  /** Width of the process log column, pixels. */
  processWidth: number;
  /** Max height of the video in the `top` layout, pixels. */
  mediaHeight: number;
  /** Language of the app's own interface. */
  uiLanguage: UiLanguage;
  /** Show the translated lines under each block's source text. */
  showTranslations: boolean;
  /** Languages stacked under the source line on the video overlay. */
  overlayLanguages: string[];
  /** Prepended verbatim to every exported file name. */
  exportPrefix: string;
  /** Token pattern for exported file names — see `lib/srt/naming.ts`. */
  exportPattern: string;
  translation: TranslationSettings;
  /** Saved model/prompt bundles; local-only, never exported. */
  profiles: ModelProfile[];
  /** Stacked caption lines burned in by the Caption Studio. */
  captionLayers: CaptionLayer[];
}

const SETTINGS_KEY = "srt-editor.settings";

export const DEFAULT_SETTINGS: Settings = {
  transcription: DEFAULT_TRANSCRIPTION,
  layout: "top",
  theme: "dark",
  sidebarWidth: 360,
  processWidth: 320,
  mediaHeight: 260,
  uiLanguage: detectUiLanguage(),
  showTranslations: true,
  overlayLanguages: [],
  exportPrefix: DEFAULT_EXPORT_PREFIX,
  exportPattern: DEFAULT_EXPORT_PATTERN,
  translation: DEFAULT_TRANSLATION,
  profiles: [],
  captionLayers: DEFAULT_CAPTION_LAYERS,
};

/** First run follows the OS language when the app is available in it. */
function detectUiLanguage(): UiLanguage {
  const tag = (globalThis.navigator?.language ?? "en").slice(0, 2).toLowerCase();
  return isUiLanguage(tag) ? tag : "en";
}

/**
 * Read caption layers out of a stored snapshot: the new array as-is (each
 * layer filled to the full shape), or the pre-0.4 single `captionStyle` object
 * wrapped in a one-element list, or the default.
 */
function migrateCaptionLayers(
  current: Partial<Settings> & Record<string, unknown>,
  base: Settings,
): CaptionLayer[] {
  if (Array.isArray(current.captionLayers)) {
    const layers = current.captionLayers.map(normalizeLayer);
    return layers.length > 0 ? layers : base.captionLayers;
  }
  const legacy = current.captionStyle as Partial<CaptionLayer> | undefined;
  if (legacy && typeof legacy === "object") return [normalizeLayer(legacy)];
  return base.captionLayers;
}

/**
 * Shallow-merge would replace the whole `translation` object when a stored
 * snapshot predates a field, so nested settings are merged one level deeper.
 */
export function mergeSettings(
  base: Settings,
  patch: Partial<Settings> | null | undefined,
): Settings {
  if (!patch) return base;
  const current = migrateLegacySettings(
    patch as Partial<Settings> & Record<string, unknown>,
  );
  const merged = {
    ...base,
    ...current,
    transcription: { ...base.transcription, ...(current.transcription ?? {}) },
    translation: { ...base.translation, ...(current.translation ?? {}) },
    captionLayers: migrateCaptionLayers(current, base),
  };
  // A stored snapshot could carry anything; the attribute ends up on <html>.
  if (!isThemeMode(merged.theme)) merged.theme = base.theme;
  return merged;
}

/**
 * Synchronous first paint comes from `localStorage`; SQLite is the durable copy
 * and overrides it right after launch (see `hydrateSettings`).
 */
function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw
      ? mergeSettings(DEFAULT_SETTINGS, JSON.parse(raw) as Partial<Settings>)
      : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function persistSettings(settings: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* private mode — SQLite still has it */
  }
  // Fire-and-forget: outside Tauri (plain `bun run dev`) there is no backend.
  void setSetting(SETTINGS_KEY, JSON.stringify(settings)).catch(() => {});
}

export type MediaKind = "video" | "audio";

/** Which view fills the block-list zone. */
export type WorkspaceTab = "blocks" | "captions";

interface AppState {
  mediaPath: string | null;
  mediaUrl: string | null;
  mediaKind: MediaKind;
  blocks: SubtitleBlock[];
  log: LogEntry[];
  generating: boolean;
  progress: { done: number; total: number } | null;
  translating: boolean;
  translateProgress: { done: number; total: number } | null;
  workspaceTab: WorkspaceTab;
  /** Caption layer being edited / highlighted in the studio, by id. */
  captionSelectedLayer: string | null;
  exporting: boolean;
  /** Seconds done / total while ffmpeg burns captions. */
  exportProgress: { done: number; total: number } | null;
  /** Polled by the run between requests; see `requestStopTranslation`. */
  translateStopRequested: boolean;
  currentTime: number;
  /** Snapshot taken before the last bulk edit (replace-all / retiming), for one-step undo. */
  blocksBackup: SubtitleBlock[] | null;
  settings: Settings;
  /** Row id of the open project, or null when nothing has been saved yet. */
  projectId: number | null;
  projectName: string;
  /** What the boot checks found, so About can report it without re-probing. */
  env: { ffmpeg: string | null; dbSchema: number | null };

  setMedia: (path: string, url: string, kind: MediaKind) => void;
  appendLog: (message: string, status?: LogStatus) => void;
  setGenerating: (v: boolean) => void;
  setProgress: (p: { done: number; total: number } | null) => void;
  setTranslating: (v: boolean) => void;
  setTranslateProgress: (p: { done: number; total: number } | null) => void;
  setWorkspaceTab: (tab: WorkspaceTab) => void;
  setExporting: (v: boolean) => void;
  setExportProgress: (p: { done: number; total: number } | null) => void;
  updateCaptionLayer: (id: string, patch: Partial<CaptionLayer>) => void;
  addCaptionLayer: (language: string) => void;
  removeCaptionLayer: (id: string) => void;
  resetCaptionLayer: (id: string) => void;
  selectCaptionLayer: (id: string) => void;
  requestStopTranslation: () => void;
  setCurrentTime: (t: number) => void;
  setBlocks: (blocks: SubtitleBlock[]) => void;
  editText: (id: string, text: string) => void;
  editTranslation: (id: string, lang: string, text: string) => void;
  applyTranslationBatch: (
    lang: string,
    indices: number[],
    results: Map<number, string>,
  ) => void;
  dropLanguage: (lang: string) => void;
  mergePrev: (id: string) => void;
  mergeNext: (id: string) => void;
  split: (id: string, wordIndex?: number) => void;
  cutAtCaret: (id: string, caret: number | null) => void;
  setTimes: (id: string, start: number, end: number) => void;
  remove: (id: string) => void;
  /** Replace the whole list, keeping the previous list for `undoBulkEdit`. */
  applyBulkEdit: (blocks: SubtitleBlock[]) => void;
  undoBulkEdit: () => void;
  saveSettings: (s: Settings) => void;
  setLayout: (layout: Layout) => void;
  setTheme: (theme: ThemeMode) => void;
  setPaneWidth: (
    pane: "sidebarWidth" | "processWidth" | "mediaHeight",
    px: number,
  ) => void;
  setProject: (id: number | null, name: string) => void;
  setEnv: (env: Partial<AppState["env"]>) => void;
  closeWorkspace: () => void;
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
  translating: false,
  translateProgress: null,
  workspaceTab: "blocks",
  captionSelectedLayer: null,
  exporting: false,
  exportProgress: null,
  translateStopRequested: false,
  currentTime: 0,
  blocksBackup: null,
  settings: loadSettings(),
  projectId: null,
  projectName: "Untitled project",
  env: { ffmpeg: null, dbSchema: null },

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
  // Starting a run clears any stop left over from the previous one.
  setTranslating: (translating) =>
    set(translating ? { translating, translateStopRequested: false } : { translating }),
  setTranslateProgress: (translateProgress) => set({ translateProgress }),
  setWorkspaceTab: (workspaceTab) => set({ workspaceTab }),
  setExporting: (exporting) => set({ exporting }),
  setExportProgress: (exportProgress) => set({ exportProgress }),
  updateCaptionLayer: (id, patch) =>
    set((s) => {
      const settings = {
        ...s.settings,
        captionLayers: s.settings.captionLayers.map((l) =>
          l.id === id ? { ...l, ...patch } : l,
        ),
      };
      persistSettings(settings);
      return { settings };
    }),
  addCaptionLayer: (language) =>
    set((s) => {
      const layer = makeCaptionLayer({
        language,
        posY: nextLayerPosY(s.settings.captionLayers),
      });
      const settings = {
        ...s.settings,
        captionLayers: [...s.settings.captionLayers, layer],
      };
      persistSettings(settings);
      return { settings, captionSelectedLayer: layer.id };
    }),
  removeCaptionLayer: (id) =>
    set((s) => {
      // Never leave the studio with nothing to style.
      const rest = s.settings.captionLayers.filter((l) => l.id !== id);
      const captionLayers = rest.length > 0 ? rest : [makeCaptionLayer()];
      const settings = { ...s.settings, captionLayers };
      persistSettings(settings);
      return {
        settings,
        captionSelectedLayer:
          s.captionSelectedLayer === id ? captionLayers[0].id : s.captionSelectedLayer,
      };
    }),
  selectCaptionLayer: (captionSelectedLayer) => set({ captionSelectedLayer }),
  resetCaptionLayer: (id) =>
    set((s) => {
      const settings = {
        ...s.settings,
        captionLayers: s.settings.captionLayers.map((l) =>
          l.id === id
            ? makeCaptionLayer({ id: l.id, language: l.language, posY: l.posY })
            : l,
        ),
      };
      persistSettings(settings);
      return { settings };
    }),
  requestStopTranslation: () => set({ translateStopRequested: true }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  // A fresh list (open, generate) makes any bulk-edit backup meaningless.
  setBlocks: (blocks) => set({ blocks, blocksBackup: null }),
  applyBulkEdit: (blocks) => set((s) => ({ blocks, blocksBackup: s.blocks })),
  undoBulkEdit: () =>
    set((s) =>
      s.blocksBackup ? { blocks: s.blocksBackup, blocksBackup: null } : s,
    ),
  editText: (id, text) =>
    set((s) => ({ blocks: updateBlockText(s.blocks, id, text) })),
  editTranslation: (id, lang, text) =>
    set((s) => ({ blocks: updateBlockTranslation(s.blocks, id, lang, text) })),
  applyTranslationBatch: (lang, indices, results) =>
    set((s) => ({
      blocks: applyTranslations(s.blocks, lang, indices, results),
    })),
  dropLanguage: (lang) =>
    set((s) => ({ blocks: stripLanguage(s.blocks, lang) })),
  mergePrev: (id) => set((s) => ({ blocks: mergeWithPrevious(s.blocks, id) })),
  mergeNext: (id) => set((s) => ({ blocks: mergeWithNext(s.blocks, id) })),
  split: (id, wordIndex) =>
    set((s) => ({ blocks: splitBlock(s.blocks, id, wordIndex) })),
  cutAtCaret: (id, caret) =>
    set((s) => ({ blocks: cutBlockAtCaret(s.blocks, id, caret) })),
  setTimes: (id, start, end) =>
    set((s) => ({ blocks: setBlockTimes(s.blocks, id, start, end) })),
  remove: (id) => set((s) => ({ blocks: removeBlock(s.blocks, id) })),
  saveSettings: (settings) => {
    persistSettings(settings);
    set({ settings });
  },
  setLayout: (layout) =>
    set((s) => {
      const settings = { ...s.settings, layout };
      persistSettings(settings);
      return { settings };
    }),
  setTheme: (theme) =>
    set((s) => {
      const settings = { ...s.settings, theme };
      persistSettings(settings);
      return { settings };
    }),
  setPaneWidth: (pane, px) =>
    set((s) => {
      const settings = { ...s.settings, [pane]: Math.round(px) };
      persistSettings(settings);
      return { settings };
    }),
  setProject: (projectId, projectName) => set({ projectId, projectName }),
  setEnv: (env) => set((s) => ({ env: { ...s.env, ...env } })),
  // Settings and the process log survive: they describe the app, not the work.
  closeWorkspace: () =>
    set({
      mediaPath: null,
      mediaUrl: null,
      mediaKind: "video",
      blocks: [],
      blocksBackup: null,
      currentTime: 0,
      progress: null,
      translateProgress: null,
      exportProgress: null,
      workspaceTab: "blocks",
      projectId: null,
      projectName: "Untitled project",
    }),
}));

/** Replace the bootstrap settings with the durable SQLite copy, if there is one. */
export async function hydrateSettings(): Promise<void> {
  const raw = await getSetting(SETTINGS_KEY);
  if (!raw) return;
  const stored = JSON.parse(raw) as Partial<Settings>;
  useAppStore.setState((s) => ({ settings: mergeSettings(s.settings, stored) }));
}

// Dev-only handle so tooling/agents can drive the store from the console.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__store = useAppStore;
}
