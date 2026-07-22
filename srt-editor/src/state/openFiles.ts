import { convertFileSrc } from "@tauri-apps/api/core";
import { classifyPath } from "../lib/media/kind";
import { parseSrt } from "../lib/srt/parse";
import { readTextFile } from "../lib/audio/tauri";
import { translate } from "../lib/i18n";
import { useAppStore } from "./store";

/**
 * Open one path by what it is. Shared by the toolbar's file dialogs and the
 * window's drag-and-drop, so both behave identically.
 */
export async function openPath(path: string): Promise<void> {
  const store = useAppStore.getState();
  const lang = store.settings.uiLanguage;
  const kind = classifyPath(path);

  if (kind === "srt") {
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
    return;
  }

  if (kind === "video" || kind === "audio") {
    store.setMedia(path, convertFileSrc(path), kind);
    store.appendLog(translate(lang, "log.opened", { kind, path }), "ok");
    return;
  }

  store.appendLog(`Unsupported file: ${path}`, "err");
}
