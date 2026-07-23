import { useEffect, useState } from "react";
import { Clock, Search, Undo2 } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { DEFAULT_SETTINGS, hydrateSettings, useAppStore } from "./state/store";
import { openPath } from "./state/openFiles";
import { useT } from "./state/useT";
import { checkFfmpeg } from "./lib/audio/tauri";
import { dbVersion } from "./lib/db/projects";
import { firstOpenable } from "./lib/media/kind";
import { APP_VERSION } from "./lib/version";
import { applyTheme } from "./lib/theme";
import { toast } from "./state/toasts";
import { Toolbar } from "./components/Toolbar";
import { PlayerPane } from "./components/PlayerPane";
import { ProcessPanel } from "./components/ProcessPanel";
import { BlockList } from "./components/BlockList";
import { CaptionStudio } from "./components/CaptionStudio";
import { FindReplaceBar } from "./components/FindReplaceBar";
import { TimingDialog } from "./components/TimingDialog";
import { Splitter } from "./components/Splitter";
import { Toasts } from "./components/Toasts";
import "./App.css";

let booted = false;

function App() {
  const appendLog = useAppStore((s) => s.appendLog);
  const setEnv = useAppStore((s) => s.setEnv);
  const setPaneWidth = useAppStore((s) => s.setPaneWidth);
  const layout = useAppStore((s) => s.settings.layout);
  const theme = useAppStore((s) => s.settings.theme);
  const sidebarWidth = useAppStore((s) => s.settings.sidebarWidth);
  const processWidth = useAppStore((s) => s.settings.processWidth);
  const mediaHeight = useAppStore((s) => s.settings.mediaHeight);
  const mediaUrl = useAppStore((s) => s.mediaUrl);
  const workspaceTab = useAppStore((s) => s.workspaceTab);
  const setWorkspaceTab = useAppStore((s) => s.setWorkspaceTab);
  const hasBlocks = useAppStore((s) => s.blocks.length > 0);
  const canUndoBulk = useAppStore((s) => s.blocksBackup !== null);
  const undoBulkEdit = useAppStore((s) => s.undoBulkEdit);
  const [dragging, setDragging] = useState(false);
  const [showFind, setShowFind] = useState(false);
  const [showTiming, setShowTiming] = useState(false);
  const t = useT();

  // ⌘F / Ctrl+F opens find & replace while the block list is on screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setShowFind(true);
        useAppStore.getState().setWorkspaceTab("blocks");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const unlisten = listen<string>("process-log", (e) =>
      appendLog(e.payload, "info"),
    );
    if (!booted) {
      booted = true;
      appendLog(`SRT Studio v${APP_VERSION}`, "info");
      dbVersion()
        .then(async (v) => {
          appendLog(`Database ready (schema v${v})`, "ok");
          setEnv({ dbSchema: v });
          await hydrateSettings();
        })
        .catch((e) => appendLog(`Database unavailable: ${e}`, "err"));
      checkFfmpeg()
        .then((v) => {
          appendLog(`ffmpeg OK: ${v}`, "ok");
          setEnv({ ffmpeg: v });
        })
        .catch((e) => {
          appendLog(String(e), "err");
          toast.err(String(e));
        });
    }
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [appendLog, setEnv]);

  // Resolve the theme to an attribute on <html>; follow the OS while on `system`.
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme(theme);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  // Drop a video, an audio file or an SRT anywhere on the window to open it.
  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;
    // Plain `bun run dev` has no Tauri webview: `getCurrentWebview()` throws
    // synchronously there, which would take the whole tree down with it.
    let webview: ReturnType<typeof getCurrentWebview>;
    try {
      webview = getCurrentWebview();
    } catch {
      return;
    }
    void webview
      .onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "enter" || payload.type === "over") {
          setDragging(true);
          return;
        }
        setDragging(false);
        if (payload.type !== "drop") return;
        const path = firstOpenable(payload.paths);
        if (path) void openPath(path);
        else appendLog(`Nothing to open in ${payload.paths.length} dropped item(s)`, "err");
      })
      .then((fn) => {
        // The listener may resolve after the effect has been torn down.
        if (cancelled) fn();
        else dispose = fn;
      })
      // Plain `bun run dev` has no Tauri webview; drag-and-drop is simply absent.
      .catch(() => {});
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [appendLog]);

  return (
    <div
      className={`app layout-${layout}`}
      style={
        {
          "--sidebar-w": `${sidebarWidth}px`,
          "--process-w": `${processWidth}px`,
          "--media-h": `${mediaHeight}px`,
        } as React.CSSProperties
      }
    >
      <Toolbar />
      <PlayerPane />
      {layout === "top" && mediaUrl && (
        <Splitter
          className="splitter-player"
          cssVar="--media-h"
          axis="y"
          width={mediaHeight}
          min={120}
          max={640}
          defaultWidth={DEFAULT_SETTINGS.mediaHeight}
          direction={1}
          title={t("player.mediaResize")}
          onCommit={(px) => setPaneWidth("mediaHeight", px)}
        />
      )}
      <Splitter
        className="splitter-sidebar"
        cssVar="--sidebar-w"
        width={sidebarWidth}
        min={240}
        max={900}
        defaultWidth={DEFAULT_SETTINGS.sidebarWidth}
        direction={1}
        title="Player column width"
        onCommit={(px) => setPaneWidth("sidebarWidth", px)}
      />
      <div className="body">
        <div className="workspace">
          <div className="workspace-tabs tabs" role="tablist">
            <button
              role="tab"
              aria-selected={workspaceTab === "blocks"}
              className={workspaceTab === "blocks" ? "tab current" : "tab"}
              onClick={() => setWorkspaceTab("blocks")}
            >
              {t("workspace.blocks")}
            </button>
            <button
              role="tab"
              aria-selected={workspaceTab === "captions"}
              className={workspaceTab === "captions" ? "tab current" : "tab"}
              onClick={() => setWorkspaceTab("captions")}
            >
              {t("workspace.captions")}
            </button>
            <span className="spacer" />
            {canUndoBulk && (
              <button
                className="icon-only"
                title={t("tools.undoHint")}
                aria-label={t("tools.undoHint")}
                onClick={() => undoBulkEdit()}
              >
                <Undo2 size={14} />
              </button>
            )}
            <button
              className="icon-only"
              disabled={!hasBlocks}
              title={t("tools.findReplace")}
              aria-label={t("tools.findReplace")}
              onClick={() => {
                setWorkspaceTab("blocks");
                setShowFind((v) => !v);
              }}
            >
              <Search size={14} />
            </button>
            <button
              className="icon-only"
              disabled={!hasBlocks}
              title={t("tools.timing")}
              aria-label={t("tools.timing")}
              onClick={() => setShowTiming(true)}
            >
              <Clock size={14} />
            </button>
          </div>
          {showFind && workspaceTab === "blocks" && (
            <FindReplaceBar onClose={() => setShowFind(false)} />
          )}
          {workspaceTab === "blocks" ? <BlockList /> : <CaptionStudio />}
        </div>
        <Splitter
          className="splitter-process"
          cssVar="--process-w"
          width={processWidth}
          min={180}
          max={720}
          defaultWidth={DEFAULT_SETTINGS.processWidth}
          direction={-1}
          title="Process log width"
          onCommit={(px) => setPaneWidth("processWidth", px)}
        />
        <ProcessPanel />
      </div>
      {showTiming && <TimingDialog onClose={() => setShowTiming(false)} />}
      {dragging && <div className="drop-overlay">{t("player.drop")}</div>}
      <Toasts />
    </div>
  );
}

export default App;
