import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "./state/store";
import { checkFfmpeg } from "./lib/audio/tauri";
import { Toolbar } from "./components/Toolbar";
import { PlayerPane } from "./components/PlayerPane";
import { ProcessPanel } from "./components/ProcessPanel";
import { BlockList } from "./components/BlockList";
import "./App.css";

let ffmpegChecked = false;

function App() {
  const appendLog = useAppStore((s) => s.appendLog);
  const layout = useAppStore((s) => s.settings.layout);

  useEffect(() => {
    const unlisten = listen<string>("process-log", (e) =>
      appendLog(e.payload, "info"),
    );
    if (!ffmpegChecked) {
      ffmpegChecked = true;
      checkFfmpeg()
        .then((v) => appendLog(`ffmpeg OK: ${v}`, "ok"))
        .catch((e) => appendLog(String(e), "err"));
    }
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [appendLog]);

  return (
    <div className={`app layout-${layout}`}>
      <Toolbar />
      <PlayerPane />
      <div className="body">
        <BlockList />
        <ProcessPanel />
      </div>
    </div>
  );
}

export default App;
