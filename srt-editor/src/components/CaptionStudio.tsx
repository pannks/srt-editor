import { useEffect, useMemo } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Clapperboard, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useAppStore } from "../state/store";
import { toast } from "../state/toasts";
import { useT } from "../state/useT";
import {
  CAPTION_FONTS,
  MAX_FONT_PCT,
  MIN_FONT_PCT,
  type CaptionAnimation,
  type CaptionLayer,
} from "../lib/captions/types";
import { buildAss } from "../lib/captions/ass";
import { ensureCaptionFonts } from "../lib/captions/fonts";
import { translatedLanguages } from "../lib/blocks/translations";
import { languageLabel } from "../lib/i18n/languages";
import { getMedia } from "../lib/player";

const ANIMATIONS: CaptionAnimation[] = ["none", "fade", "pop", "karaoke"];

/**
 * Style controls for the burned-in captions. Several layers stack on the video
 * (Thai over English over Chinese, each independently styled); the live preview
 * sits on the video in the player pane. Export burns the layers into a new MP4.
 */
export function CaptionStudio() {
  const layers = useAppStore((s) => s.settings.captionLayers);
  const selectedId = useAppStore((s) => s.captionSelectedLayer);
  const selectLayer = useAppStore((s) => s.selectCaptionLayer);
  const updateLayer = useAppStore((s) => s.updateCaptionLayer);
  const addLayer = useAppStore((s) => s.addCaptionLayer);
  const removeLayer = useAppStore((s) => s.removeCaptionLayer);
  const resetLayer = useAppStore((s) => s.resetCaptionLayer);
  const blocks = useAppStore((s) => s.blocks);
  const mediaPath = useAppStore((s) => s.mediaPath);
  const mediaKind = useAppStore((s) => s.mediaKind);
  const exporting = useAppStore((s) => s.exporting);
  const setExporting = useAppStore((s) => s.setExporting);
  const setExportProgress = useAppStore((s) => s.setExportProgress);
  const appendLog = useAppStore((s) => s.appendLog);
  const t = useT();

  // Load the Google fonts once so the preview renders them.
  useEffect(() => ensureCaptionFonts(), []);

  const translated = useMemo(() => translatedLanguages(blocks), [blocks]);

  // The layer being edited: the selected one, or the first as a fallback.
  const layer = layers.find((l) => l.id === selectedId) ?? layers[0];
  // Keep the selection valid when layers change under it.
  useEffect(() => {
    if (layer && layer.id !== selectedId) selectLayer(layer.id);
  }, [layer, selectedId, selectLayer]);

  const layerLabel = (l: CaptionLayer) =>
    l.language === "" ? t("captions.sourceLine") : languageLabel(l.language);

  // Languages worth offering as a new layer: source + anything translated.
  const addChoices = ["", ...translated];

  const patch = (fields: Partial<CaptionLayer>) => {
    if (layer) updateLayer(layer.id, fields);
  };

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
      const ass = buildAss(blocks, layers, { width, height });
      const fonts = [...new Set(layers.map((l) => l.fontFamily))];
      await invoke<string>("export_captioned_video", {
        inputPath: mediaPath,
        outputPath,
        assContent: ass,
        fonts,
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
      {/* Layer switcher: one chip per stacked caption line. */}
      <div className="cap-layers">
        {layers.map((l) => (
          <button
            key={l.id}
            className={l.id === layer?.id ? "cap-chip current" : "cap-chip"}
            onClick={() => selectLayer(l.id)}
          >
            {layerLabel(l)}
          </button>
        ))}
        <select
          className="cap-add"
          value=""
          title={t("captions.addLayer")}
          onChange={(e) => {
            addLayer(e.target.value);
            e.target.value = "";
          }}
        >
          <option value="" disabled>
            + {t("captions.addLayer")}
          </option>
          {addChoices.map((code) => (
            <option key={code || "src"} value={code}>
              {code === "" ? t("captions.sourceLine") : languageLabel(code)}
            </option>
          ))}
        </select>
      </div>

      {layer && (
        <div className="cap-editor">
          {/* Text */}
          <div className="cap-section">
            <div className="cap-row">
              <span>{t("captions.language")}</span>
              <select
                value={layer.language}
                onChange={(e) => patch({ language: e.target.value })}
              >
                <option value="">{t("captions.sourceLine")}</option>
                {translated.map((code) => (
                  <option key={code} value={code}>
                    {languageLabel(code)}
                  </option>
                ))}
              </select>
            </div>
            <div className="cap-row">
              <span>{t("captions.font")}</span>
              <select
                value={layer.fontFamily}
                onChange={(e) => patch({ fontFamily: e.target.value })}
                style={{ fontFamily: `"${layer.fontFamily}", sans-serif` }}
              >
                {CAPTION_FONTS.map((f) => (
                  <option
                    key={f.family}
                    value={f.family}
                    style={{ fontFamily: `"${f.family}", sans-serif` }}
                  >
                    {f.family}
                    {f.note ? ` — ${f.note}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="cap-row">
              <span>{t("captions.size")}</span>
              <span className="cap-slider">
                <input
                  type="range"
                  min={MIN_FONT_PCT}
                  max={MAX_FONT_PCT}
                  step={0.5}
                  value={layer.fontSizePct}
                  onChange={(e) =>
                    patch({ fontSizePct: Number(e.target.value) })
                  }
                />
                <em>{layer.fontSizePct}%</em>
              </span>
            </div>
            <div className="cap-row">
              <span>{t("captions.animation")}</span>
              <select
                value={layer.animation}
                onChange={(e) =>
                  patch({ animation: e.target.value as CaptionAnimation })
                }
              >
                {ANIMATIONS.map((a) => (
                  <option key={a} value={a}>
                    {t(`captions.anim.${a}` as Parameters<typeof t>[0])}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Colour */}
          <div className="cap-section">
            <label className="cap-swatch">
              <input
                type="color"
                value={layer.color}
                onChange={(e) => patch({ color: e.target.value })}
              />
              {t("captions.textColor")}
            </label>
            <label className="cap-check">
              <input
                type="checkbox"
                checked={layer.bold}
                onChange={(e) => patch({ bold: e.target.checked })}
              />
              {t("captions.bold")}
            </label>
            <label className="cap-swatch">
              <input
                type="color"
                value={layer.outlineColor}
                onChange={(e) => patch({ outlineColor: e.target.value })}
              />
              {t("captions.outlineColor")}
            </label>
            <div className="cap-row">
              <span>{t("captions.outline")}</span>
              <span className="cap-slider">
                <input
                  type="range"
                  min={0}
                  max={4}
                  step={0.5}
                  value={layer.outlineWidth}
                  onChange={(e) =>
                    patch({ outlineWidth: Number(e.target.value) })
                  }
                />
                <em>{layer.outlineWidth}</em>
              </span>
            </div>
            <div className="cap-row">
              <span>{t("captions.shadow")}</span>
              <span className="cap-slider">
                <input
                  type="range"
                  min={0}
                  max={4}
                  step={1}
                  value={layer.shadow}
                  onChange={(e) => patch({ shadow: Number(e.target.value) })}
                />
                <em>{layer.shadow}</em>
              </span>
            </div>
          </div>

          {/* Background box */}
          <div className="cap-section">
            <label className="cap-check">
              <input
                type="checkbox"
                checked={layer.bgEnabled}
                onChange={(e) => patch({ bgEnabled: e.target.checked })}
              />
              {t("captions.background")}
            </label>
            {layer.bgEnabled && (
              <>
                <label className="cap-swatch">
                  <input
                    type="color"
                    value={layer.bgColor}
                    onChange={(e) => patch({ bgColor: e.target.value })}
                  />
                  {t("captions.bgColor")}
                </label>
                <div className="cap-row">
                  <span>{t("captions.bgOpacity")}</span>
                  <span className="cap-slider">
                    <input
                      type="range"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={layer.bgOpacity}
                      onChange={(e) =>
                        patch({ bgOpacity: Number(e.target.value) })
                      }
                    />
                    <em>{Math.round(layer.bgOpacity * 100)}%</em>
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="cap-layer-actions">
            <button onClick={() => resetLayer(layer.id)}>
              <RotateCcw size={13} /> {t("captions.reset")}
            </button>
            <button
              className="danger"
              onClick={() => removeLayer(layer.id)}
              disabled={layers.length === 1}
              title={
                layers.length === 1
                  ? t("captions.lastLayer")
                  : t("captions.removeLayer")
              }
            >
              <Trash2 size={13} /> {t("captions.removeLayer")}
            </button>
          </div>
        </div>
      )}

      <div className="caption-actions">
        <span className="muted caption-hint">{t("captions.dragHint")}</span>
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
