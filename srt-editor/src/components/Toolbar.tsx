import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Captions,
  Columns2,
  Database,
  FileVideo,
  Languages,
  Loader2,
  Info,
  PanelTop,
  Settings as SettingsIcon,
  Sparkles,
  Square,
  XCircle,
} from "lucide-react";
import { useAppStore } from "../state/store";
import { useT } from "../state/useT";
import { openPath } from "../state/openFiles";
import { generateBlocks } from "../lib/pipeline/generate";
import { translateBlocks } from "../lib/translate/run";
import { AUDIO_EXT, VIDEO_EXT } from "../lib/media/kind";
import { APP_VERSION } from "../lib/version";
import { SettingsDialog } from "./SettingsDialog";
import { ProjectsDialog } from "./ProjectsDialog";
import { ExportMenu } from "./ExportMenu";
import { AboutDialog } from "./AboutDialog";

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
      filters: [{ name: "SubRip", extensions: ["srt"] }],
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
    } catch (e) {
      store.appendLog(`Generation failed: ${e instanceof Error ? e.message : e}`, "err");
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
    } catch (e) {
      store.appendLog(
        `Translation failed: ${e instanceof Error ? e.message : e}`,
        "err",
      );
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
      <img className="app-logo" src="/logo-srt-editor.png" alt="" />
      <span className="app-title">
        {t("app.name")}
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
        title={t("toolbar.layoutHint")}
        onClick={() =>
          store.setLayout(store.settings.layout === "top" ? "side" : "top")
        }
      >
        {store.settings.layout === "top" ? (
          <>
            <PanelTop size={14} /> {t("toolbar.layoutTop")}
          </>
        ) : (
          <>
            <Columns2 size={14} /> {t("toolbar.layoutSide")}
          </>
        )}
      </button>
      <button onClick={() => setShowSettings(true)}>
        <SettingsIcon size={14} /> {t("toolbar.settings")}
      </button>
      <button
        className="icon-only"
        onClick={() => setShowAbout(true)}
        title={t("toolbar.about")}
        aria-label={t("toolbar.about")}
      >
        <Info size={14} />
      </button>
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
      {showProjects && <ProjectsDialog onClose={() => setShowProjects(false)} />}
      {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}
    </header>
  );
}
