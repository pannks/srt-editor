import { useEffect, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Clapperboard, Loader2, RotateCcw } from "lucide-react";
import { useAppStore } from "../state/store";
import { toast } from "../state/toasts";
import { useT } from "../state/useT";
import {
  DEFAULT_CAPTION_STYLE,
  MAX_FONT_PCT,
  MIN_FONT_PCT,
  type CaptionAnimation,
} from "../lib/captions/types";
import { buildAss } from "../lib/captions/ass";
import { translatedLanguages } from "../lib/blocks/translations";
import { languageLabel } from "../lib/i18n/languages";
import { getMedia } from "../lib/player";

const ANIMATIONS: CaptionAnimation[] = ["none", "fade", "pop", "karaoke"];

/**
 * Style controls for burned-in captions. The live preview sits on the video in
 * the player pane (drag it to reposition); export burns the design into a new
 * MP4 with ffmpeg.
 */
export function CaptionStudio() {
  const style = useAppStore((s) => s.settings.captionStyle);
  const setStyle = useAppStore((s) => s.setCaptionStyle);
  const blocks = useAppStore((s) => s.blocks);
  const mediaPath = useAppStore((s) => s.mediaPath);
  const mediaKind = useAppStore((s) => s.mediaKind);
  const exporting = useAppStore((s) => s.exporting);
  const setExporting = useAppStore((s) => s.setExporting);
  const setExportProgress = useAppStore((s) => s.setExportProgress);
  const appendLog = useAppStore((s) => s.appendLog);
  const t = useT();
  const [languages, setLanguages] = useState<string[]>([]);

  // The choice list only needs refreshing when the block set changes shape.
  useEffect(() => {
    setLanguages(translatedLanguages(blocks));
  }, [blocks]);

  const canExport =
    mediaPath !== null &&
    mediaKind === "video" &&
    blocks.length > 0 &&
    !exporting;

  const exportVideo = async () => {
    if (!canExport || !mediaPath) return;
    const video = getMedia() as HTMLVideoElement | null;
    const width = video?.videoWidth ?? 0;
    const height = video?.videoHeight ?? 0;
    if (!width || !height) {
      toast.err(t("captions.noDimensions"));
      return;
    }
    const base = mediaPath.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
    const outputPath = await save({
      defaultPath: `${base}-captioned.mp4`,
      filters: [{ name: "MP4 video", extensions: ["mp4"] }],
    });
    if (!outputPath) return;

    setExporting(true);
    setExportProgress(null);
    const unlisten = await listen<{ doneSec: number; totalSec: number }>(
      "export-progress",
      (e) =>
        setExportProgress({ done: e.payload.doneSec, total: e.payload.totalSec }),
    );
    try {
      const ass = buildAss(blocks, style, { width, height });
      await invoke<string>("export_captioned_video", {
        inputPath: mediaPath,
        outputPath,
        assContent: ass,
      });
      appendLog(`Exported captioned video: ${outputPath}`, "ok");
      toast.ok(t("toast.videoExported", { path: outputPath }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      appendLog(`Video export failed: ${message}`, "err");
      toast.err(t("toast.videoExportFailed", { error: message }));
    } finally {
      unlisten();
      setExporting(false);
      setExportProgress(null);
    }
  };

  if (blocks.length === 0) {
    return (
      <div className="caption-studio empty muted">{t("captions.empty")}</div>
    );
  }

  return (
    <div className="caption-studio">
      <p className="muted caption-hint">{t("captions.dragHint")}</p>

      <div className="caption-grid">
        <label>
          {t("captions.language")}
          <select
            value={style.language}
            onChange={(e) => setStyle({ language: e.target.value })}
          >
            <option value="">{t("captions.sourceLine")}</option>
            {languages.map((code) => (
              <option key={code} value={code}>
                {languageLabel(code)}
              </option>
            ))}
          </select>
        </label>

        <label>
          {t("captions.animation")}
          <select
            value={style.animation}
            onChange={(e) =>
              setStyle({ animation: e.target.value as CaptionAnimation })
            }
          >
            {ANIMATIONS.map((a) => (
              <option key={a} value={a}>
                {t(`captions.anim.${a}` as Parameters<typeof t>[0])}
              </option>
            ))}
          </select>
        </label>

        <label>
          {t("captions.font")}
          <input
            type="text"
            value={style.fontFamily}
            spellCheck={false}
            onChange={(e) => setStyle({ fontFamily: e.target.value })}
          />
          <small className="muted">{t("captions.fontHint")}</small>
        </label>

        <label>
          {t("captions.size", { pct: style.fontSizePct })}
          <input
            type="range"
            min={MIN_FONT_PCT}
            max={MAX_FONT_PCT}
            step={0.5}
            value={style.fontSizePct}
            onChange={(e) => setStyle({ fontSizePct: Number(e.target.value) })}
          />
        </label>

        <label className="check">
          <input
            type="checkbox"
            checked={style.bold}
            onChange={(e) => setStyle({ bold: e.target.checked })}
          />
          {t("captions.bold")}
        </label>

        <label>
          {t("captions.textColor")}
          <input
            type="color"
            value={style.color}
            onChange={(e) => setStyle({ color: e.target.value })}
          />
        </label>

        <label>
          {t("captions.outlineColor")}
          <input
            type="color"
            value={style.outlineColor}
            onChange={(e) => setStyle({ outlineColor: e.target.value })}
          />
        </label>

        <label>
          {t("captions.outline", { width: style.outlineWidth })}
          <input
            type="range"
            min={0}
            max={4}
            step={0.5}
            value={style.outlineWidth}
            onChange={(e) => setStyle({ outlineWidth: Number(e.target.value) })}
          />
        </label>

        <label>
          {t("captions.shadow", { depth: style.shadow })}
          <input
            type="range"
            min={0}
            max={4}
            step={1}
            value={style.shadow}
            onChange={(e) => setStyle({ shadow: Number(e.target.value) })}
          />
        </label>

        <label className="check">
          <input
            type="checkbox"
            checked={style.bgEnabled}
            onChange={(e) => setStyle({ bgEnabled: e.target.checked })}
          />
          {t("captions.background")}
        </label>

        {style.bgEnabled && (
          <>
            <label>
              {t("captions.bgColor")}
              <input
                type="color"
                value={style.bgColor}
                onChange={(e) => setStyle({ bgColor: e.target.value })}
              />
            </label>
            <label>
              {t("captions.bgOpacity", {
                pct: Math.round(style.bgOpacity * 100),
              })}
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={style.bgOpacity}
                onChange={(e) => setStyle({ bgOpacity: Number(e.target.value) })}
              />
            </label>
          </>
        )}
      </div>

      <div className="caption-actions">
        <button onClick={() => setStyle(DEFAULT_CAPTION_STYLE)}>
          <RotateCcw size={14} /> {t("captions.reset")}
        </button>
        <span className="spacer" />
        <button
          className="primary"
          onClick={exportVideo}
          disabled={!canExport}
          title={
            mediaKind !== "video"
              ? t("captions.exportNeedsVideo")
              : t("captions.exportHint")
          }
        >
          {exporting ? (
            <Loader2 size={14} className="spin" />
          ) : (
            <Clapperboard size={14} />
          )}
          {exporting ? t("captions.exporting") : t("captions.export")}
        </button>
      </div>
    </div>
  );
}
