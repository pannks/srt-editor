import { useRef, useState } from "react";
import { useAppStore } from "../state/store";
import { captionText, type CaptionLayer } from "../lib/captions/types";
import { findActiveBlock } from "../lib/blocks/active";
import { getMedia } from "../lib/player";
import type { SubtitleBlock } from "../lib/blocks/types";

/** `#rrggbb` + 0–1 opacity → CSS rgba(). */
function rgba(hex: string, opacity: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const rgb = m ? m[1] : "000000";
  const r = parseInt(rgb.slice(0, 2), 16);
  const g = parseInt(rgb.slice(2, 4), 16);
  const b = parseInt(rgb.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/** Dim colour the karaoke sweep reveals from, matching the export's grey. */
const KARAOKE_DIM = "#888888";

/**
 * One caption layer, draggable and live-styled over the video. A render helper
 * per layer so each stacks independently and remembers its own drag.
 */
function LayerSpan({
  layer,
  block,
  frameH,
  scale,
  container,
}: {
  layer: CaptionLayer;
  block: SubtitleBlock;
  frameH: number;
  scale: number;
  container: React.RefObject<HTMLDivElement | null>;
}) {
  const selectedId = useAppStore((s) => s.captionSelectedLayer);
  const selectLayer = useAppStore((s) => s.selectCaptionLayer);
  const updateLayer = useAppStore((s) => s.updateCaptionLayer);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const latest = useRef<{ x: number; y: number } | null>(null);

  const text = captionText(block, layer);
  if (text === "") return null;

  const pos = dragPos ?? { x: layer.posX, y: layer.posY };
  const fontPx = Math.max(8, (layer.fontSizePct / 100) * frameH);
  const o = layer.outlineWidth * scale;
  const outlineShadows =
    layer.outlineWidth > 0
      ? [
          `${o}px 0 0 ${layer.outlineColor}`,
          `-${o}px 0 0 ${layer.outlineColor}`,
          `0 ${o}px 0 ${layer.outlineColor}`,
          `0 -${o}px 0 ${layer.outlineColor}`,
          `${o}px ${o}px 0 ${layer.outlineColor}`,
          `-${o}px ${o}px 0 ${layer.outlineColor}`,
          `${o}px -${o}px 0 ${layer.outlineColor}`,
          `-${o}px -${o}px 0 ${layer.outlineColor}`,
        ]
      : [];
  const depth = layer.shadow * scale * 2;
  const shadows = [
    ...outlineShadows,
    ...(layer.shadow > 0 ? [`${depth}px ${depth}px ${depth}px rgba(0,0,0,0.8)`] : []),
  ].join(", ");

  const clamp = (v: number) => Math.min(0.98, Math.max(0.02, v));

  const onPointerMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!latest.current || !container.current) return;
    const r = container.current.getBoundingClientRect();
    const next = {
      x: clamp((e.clientX - r.left) / r.width),
      y: clamp((e.clientY - r.top) / r.height),
    };
    latest.current = next;
    setDragPos(next);
  };

  const karaoke = layer.animation === "karaoke";
  const durationSec = Math.max(0.3, block.end - block.start);

  // Karaoke reveals the colour left-to-right via a two-tone gradient clipped to
  // the glyphs; the outline still draws from the glyph shape, not the fill.
  const karaokeStyle: React.CSSProperties = karaoke
    ? {
        color: "transparent",
        backgroundImage: `linear-gradient(90deg, ${layer.color} 0 50%, ${KARAOKE_DIM} 50% 100%)`,
        backgroundSize: "200% 100%",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        // The animation moves the window from the dim half to the colour half.
        ["--kara-dur" as string]: `${durationSec}s`,
      }
    : { color: layer.color };

  return (
    <span
      // Remount on block/animation change so the CSS animation replays.
      key={`${block.id}-${layer.animation}`}
      className={`caption-preview anim-${layer.animation}${
        selectedId === layer.id ? " selected" : ""
      }`}
      style={{
        left: `${pos.x * 100}%`,
        top: `${pos.y * 100}%`,
        fontSize: `${fontPx}px`,
        fontFamily: `"${layer.fontFamily}", sans-serif`,
        fontWeight: layer.bold ? 700 : 400,
        background: layer.bgEnabled
          ? rgba(layer.bgColor, layer.bgOpacity)
          : "transparent",
        textShadow: shadows,
        ...karaokeStyle,
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        selectLayer(layer.id);
        latest.current = { x: pos.x, y: pos.y };
      }}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        if (latest.current) {
          updateLayer(layer.id, {
            posX: latest.current.x,
            posY: latest.current.y,
          });
        }
        latest.current = null;
        setDragPos(null);
      }}
    >
      {text}
    </span>
  );
}

/**
 * Live, draggable preview of every burned-in caption layer over the video.
 * Sizes and outlines scale with the on-screen frame so the proportions match
 * the export.
 */
export function CaptionPreview({
  container,
}: {
  container: React.RefObject<HTMLDivElement | null>;
}) {
  const layers = useAppStore((s) => s.settings.captionLayers);
  const blocks = useAppStore((s) => s.blocks);
  const currentTime = useAppStore((s) => s.currentTime);

  // Preview the playhead's block, or the first one so there is always
  // something to drag and style.
  const active = findActiveBlock(blocks, currentTime) ?? blocks[0];
  if (!active) return null;

  const frame = container.current;
  const frameH = frame?.clientHeight ?? 0;
  const video = getMedia() as HTMLVideoElement | null;
  // Outline/shadow are in video pixels; scale them to the on-screen frame.
  const scale = video?.videoHeight ? frameH / video.videoHeight : 0.3;

  return (
    <>
      {layers.map((layer) => (
        <LayerSpan
          key={layer.id}
          layer={layer}
          block={active}
          frameH={frameH}
          scale={scale}
          container={container}
        />
      ))}
    </>
  );
}
