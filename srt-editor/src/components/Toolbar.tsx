import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useAppStore } from "../state/store";
import { generateBlocks } from "../lib/pipeline/generate";
import { blocksToSrt } from "../lib/srt/generate";
import { parseSrt } from "../lib/srt/parse";
import { readTextFile, saveTextFile } from "../lib/audio/tauri";
import { SettingsDialog } from "./SettingsDialog";

const VIDEO_EXT = ["mp4", "mov", "mkv", "webm", "avi", "m4v"];
const AUDIO_EXT = ["mp3", "wav", "m4a", "aac", "flac", "ogg", "opus"];

export function Toolbar() {
  const store = useAppStore();
  const [showSettings, setShowSettings] = useState(false);

  const openMedia = async () => {
    const path = await open({
      multiple: false,
      filters: [
        { name: "Media", extensions: [...VIDEO_EXT, ...AUDIO_EXT] },
        { name: "Video", extensions: VIDEO_EXT },
        { name: "Audio", extensions: AUDIO_EXT },
      ],
    });
    if (typeof path !== "string") return;
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const kind = AUDIO_EXT.includes(ext) ? "audio" : "video";
    store.setMedia(path, convertFileSrc(path), kind);
    store.appendLog(`Opened ${kind}: ${path}`, "ok");
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

  const importSrt = async () => {
    const path = await open({
      multiple: false,
      filters: [{ name: "SubRip", extensions: ["srt"] }],
    });
    if (typeof path !== "string") return;
    try {
      const blocks = parseSrt(await readTextFile(path));
      store.setBlocks(blocks);
      store.appendLog(`Loaded ${blocks.length} block(s) from ${path}`, "ok");
    } catch (e) {
      store.appendLog(
        `Could not read SRT: ${e instanceof Error ? e.message : e}`,
        "err",
      );
    }
  };

  const exportSrt = async () => {
    if (store.blocks.length === 0) return;
    const path = await save({
      defaultPath: "subtitles.srt",
      filters: [{ name: "SubRip", extensions: ["srt"] }],
    });
    if (!path) return;
    try {
      await saveTextFile(path, blocksToSrt(store.blocks));
      store.appendLog(`Exported SRT: ${path}`, "ok");
    } catch (e) {
      store.appendLog(`Export failed: ${e}`, "err");
    }
  };

  return (
    <header className="toolbar">
      <span className="app-title">SRT Studio</span>
      <button onClick={openMedia}>Open media</button>
      <button
        onClick={generate}
        disabled={!store.mediaPath || store.generating}
        className="primary"
      >
        {store.generating
          ? store.progress
            ? `Transcribing ${store.progress.done}/${store.progress.total}…`
            : "Working…"
          : "Generate SRT"}
      </button>
      <button onClick={importSrt} title="Edit an existing subtitle file">
        Open SRT
      </button>
      <button onClick={exportSrt} disabled={store.blocks.length === 0}>
        Export SRT
      </button>
      <span className="spacer" />
      <button
        title="Player above the blocks, or beside them (fits 9:16 video)"
        onClick={() =>
          store.setLayout(store.settings.layout === "top" ? "side" : "top")
        }
      >
        {store.settings.layout === "top" ? "▤ Top" : "◧ Sidebar"}
      </button>
      <button onClick={() => setShowSettings(true)}>Settings</button>
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </header>
  );
}
