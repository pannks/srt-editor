import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { DEFAULT_SETTINGS, hydrateSettings, useAppStore } from "./state/store";
import { openPath } from "./state/openFiles";
import { useT } from "./state/useT";
import { checkFfmpeg } from "./lib/audio/tauri";
import { dbVersion } from "./lib/db/projects";
import { firstOpenable } from "./lib/media/kind";
import { APP_VERSION } from "./lib/version";
import { Toolbar } from "./components/Toolbar";
import { PlayerPane } from "./components/PlayerPane";
import { ProcessPanel } from "./components/ProcessPanel";
import { BlockList } from "./components/BlockList";
import { Splitter } from "./components/Splitter";
import "./App.css";

let booted = false;

function App() {
  const appendLog = useAppStore((s) => s.appendLog);
  const setEnv = useAppStore((s) => s.setEnv);
  const setPaneWidth = useAppStore((s) => s.setPaneWidth);
  const layout = useAppStore((s) => s.settings.layout);
  const sidebarWidth = useAppStore((s) => s.settings.sidebarWidth);
  const processWidth = useAppStore((s) => s.settings.processWidth);
  const [dragging, setDragging] = useState(false);
  const t = useT();

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
        .catch((e) => appendLog(String(e), "err"));
    }
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [appendLog, setEnv]);

  // Drop a video, an audio file or an SRT anywhere on the window to open it.
  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;
    void getCurrentWebview()
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
        } as React.CSSProperties
      }
    >
      <Toolbar />
      <PlayerPane />
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
        <BlockList />
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
      {dragging && <div className="drop-overlay">{t("player.drop")}</div>}
    </div>
  );
}

export default App;
