import { lazy, Suspense, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Captions,
  Columns2,
  Database,
  FileVideo,
  Languages,
  Loader2,
  Info,
  Moon,
  PanelTop,
  Settings as SettingsIcon,
  Sparkles,
  Square,
  Sun,
  XCircle,
} from "lucide-react";
import { useAppStore } from "../state/store";
import { toast } from "../state/toasts";
import { useT } from "../state/useT";
import { resolveTheme } from "../lib/theme";
import { openPath } from "../state/openFiles";
import { generateBlocks } from "../lib/pipeline/generate";
import { cancelAcp } from "../lib/transcribe/acp";
import { translateBlocks } from "../lib/translate/run";
import { AUDIO_EXT, VIDEO_EXT } from "../lib/media/kind";
import { APP_VERSION } from "../lib/version";
import { ProjectsDialog } from "./ProjectsDialog";
import { ExportMenu } from "./ExportMenu";
import { AboutDialog } from "./AboutDialog";
import { OpProgress } from "./OpProgress";

// The settings dialog carries the brand-icon set (~1.7 MB minified), which
// nothing else uses — split it out so the editor itself loads without it.
const SettingsDialog = lazy(() =>
  import("./SettingsDialog").then((m) => ({ default: m.SettingsDialog })),
);

export function Toolbar() {
  const store = useAppStore();
  const t = useT();
  const [showSettings, setShowSettings] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  const pickMedia = async () => {
    const path = await open({
      multiple: false,
      filters: [
        { name: "Media", extensions: [...VIDEO_EXT, ...AUDIO_EXT] },
        { name: "Video", extensions: VIDEO_EXT },
        { name: "Audio", extensions: AUDIO_EXT },
      ],
    });
    if (typeof path === "string") await openPath(path);
  };

  const pickSrt = async () => {
    const path = await open({
      multiple: false,
      filters: [
        { name: "Subtitles", extensions: ["srt", "vtt"] },
        { name: "SubRip", extensions: ["srt"] },
        { name: "WebVTT", extensions: ["vtt"] },
      ],
    });
    if (typeof path === "string") await openPath(path);
  };

  const generate = async () => {
    if (!store.mediaPath || store.generating) return;
    store.setGenerating(true);
    store.setProgress(null);
    try {
      const blocks = await generateBlocks(store.mediaPath, store.settings, {
        log: store.appendLog,
        progress: (done, total) => store.setProgress({ done, total }),
      });
      store.setBlocks(blocks);
      toast.ok(t("toast.generateDone", { count: blocks.length }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      store.appendLog(`Generation failed: ${message}`, "err");
      toast.err(t("toast.generateFailed", { error: message }));
    } finally {
      store.setGenerating(false);
      store.setProgress(null);
    }
  };

  const translate = async (retranslateAll = false) => {
    if (store.translating || store.blocks.length === 0) return;
    if (store.settings.translation.targets.length === 0) {
      store.appendLog(t("log.noTranslationTargets"), "err");
      setShowSettings(true);
      return;
    }
    store.setTranslating(true);
    store.setTranslateProgress(null);
    try {
      await translateBlocks(
        store.blocks,
        store.settings.translation,
        {
          log: store.appendLog,
          progress: (done, total) => store.setTranslateProgress({ done, total }),
          // Results are written straight to the store, so the lines under each
          // block fill in while the remaining batches are still running.
          apply: store.applyTranslationBatch,
          // Read from the store, not from a captured value, so pressing Stop
          // during the run is seen by the next batch.
          shouldStop: () => useAppStore.getState().translateStopRequested,
        },
        { retranslateAll },
      );
      toast.ok(
        useAppStore.getState().translateStopRequested
          ? t("toast.translateStopped")
          : t("toast.translateDone"),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      store.appendLog(`Translation failed: ${message}`, "err");
      toast.err(t("toast.translateFailed", { error: message }));
    } finally {
      store.setTranslating(false);
      store.setTranslateProgress(null);
    }
  };

  const closeWorkspace = () => {
    if (!store.mediaPath && store.blocks.length === 0) return;
    if (!window.confirm(t("close.confirm"))) return;
    store.closeWorkspace();
    store.appendLog(t("log.workspaceClosed"), "ok");
  };

  const busy = store.generating || store.translating;

  return (
    <header className="toolbar">
      <img className="app-logo" src="/logo-srt-editor.png" alt={t("app.name")} />
      <span className="app-title">
        <small className="app-version" title={t("toolbar.version")}>
          v{APP_VERSION}
        </small>
      </span>
      <button onClick={pickMedia}>
        <FileVideo size={14} /> {t("toolbar.openMedia")}
      </button>
      <button
        onClick={generate}
        disabled={!store.mediaPath || busy}
        className="primary"
      >
        {store.generating ? (
          <Loader2 size={14} className="spin" />
        ) : (
          <Sparkles size={14} />
        )}
        {store.generating
          ? store.progress
            ? t("toolbar.transcribing", {
                done: store.progress.done,
                total: store.progress.total,
              })
            : t("toolbar.working")
          : t("toolbar.generate")}
      </button>
      <button
        onClick={() => translate()}
        disabled={store.blocks.length === 0 || busy}
        title={t("toolbar.translateHint")}
      >
        {store.translating ? (
          <Loader2 size={14} className="spin" />
        ) : (
          <Languages size={14} />
        )}
        {store.translating
          ? store.translateProgress
            ? t("toolbar.translating", {
                done: store.translateProgress.done,
                total: store.translateProgress.total,
              })
            : t("toolbar.working")
          : t("toolbar.translate")}
      </button>
      {store.translating && (
        <button
          className="danger"
          onClick={store.requestStopTranslation}
          disabled={store.translateStopRequested}
          title={t("toolbar.stopHint")}
        >
          <Square size={13} />
          {store.translateStopRequested
            ? t("toolbar.stopping")
            : t("toolbar.stop")}
        </button>
      )}
      {store.generating && store.settings.transcription.provider === "acp" && (
        <button
          className="danger"
          onClick={() => void cancelAcp()}
          title={t("toolbar.stopAcpHint")}
        >
          <Square size={13} /> {t("toolbar.stop")}
        </button>
      )}
      <span className="toolbar-sep" aria-hidden="true" />
      <button onClick={pickSrt} title={t("toolbar.openSrtHint")}>
        <Captions size={14} /> {t("toolbar.openSrt")}
      </button>
      <ExportMenu />
      <button onClick={() => setShowProjects(true)} title={t("toolbar.projectsHint")}>
        <Database size={14} /> {t("toolbar.projects")}
      </button>
      <button
        onClick={closeWorkspace}
        disabled={!store.mediaPath && store.blocks.length === 0}
        title={t("toolbar.closeHint")}
      >
        <XCircle size={14} /> {t("toolbar.close")}
      </button>
      <span className="project-badge muted" title={t("toolbar.openProject")}>
        {store.projectName}
        {store.projectId ? ` · #${store.projectId}` : ` · ${t("toolbar.unsaved")}`}
      </span>
      <span className="spacer" />
      <button
        className="icon-only"
        title={t("toolbar.layoutHint")}
        aria-label={t("toolbar.layoutHint")}
        onClick={() =>
          store.setLayout(store.settings.layout === "top" ? "side" : "top")
        }
      >
        {store.settings.layout === "top" ? (
          <PanelTop size={14} />
        ) : (
          <Columns2 size={14} />
        )}
      </button>
      <button
        className="icon-only"
        title={
          resolveTheme(store.settings.theme) === "dark"
            ? t("toolbar.themeToLight")
            : t("toolbar.themeToDark")
        }
        aria-label={
          resolveTheme(store.settings.theme) === "dark"
            ? t("toolbar.themeToLight")
            : t("toolbar.themeToDark")
        }
        onClick={() =>
          store.setTheme(
            resolveTheme(store.settings.theme) === "dark" ? "light" : "dark",
          )
        }
      >
        {resolveTheme(store.settings.theme) === "dark" ? (
          <Sun size={14} />
        ) : (
          <Moon size={14} />
        )}
      </button>
      <button
        className="icon-only"
        onClick={() => setShowSettings(true)}
        title={t("toolbar.settings")}
        aria-label={t("toolbar.settings")}
      >
        <SettingsIcon size={14} />
      </button>
      <button
        className="icon-only"
        onClick={() => setShowAbout(true)}
        title={t("toolbar.about")}
        aria-label={t("toolbar.about")}
      >
        <Info size={14} />
      </button>
      <OpProgress />
      {showSettings && (
        <Suspense fallback={null}>
          <SettingsDialog onClose={() => setShowSettings(false)} />
        </Suspense>
      )}
      {showProjects && <ProjectsDialog onClose={() => setShowProjects(false)} />}
      {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}
    </header>
  );
}
