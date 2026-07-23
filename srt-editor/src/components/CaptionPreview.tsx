import { useRef, useState } from "react";
import { useAppStore } from "../state/store";
import { captionText } from "../lib/captions/types";
import { findActiveBlock } from "../lib/blocks/active";
import { getMedia } from "../lib/player";

/** `#rrggbb` + 0–1 opacity → CSS rgba(). */
function rgba(hex: string, opacity: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const rgb = m ? m[1] : "000000";
  const r = parseInt(rgb.slice(0, 2), 16);
  const g = parseInt(rgb.slice(2, 4), 16);
  const b = parseInt(rgb.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Live, draggable approximation of the burned-in caption, rendered over the
 * video while the Caption Studio tab is open. Font size and outline scale with
 * the on-screen frame so the proportions match the export.
 */
export function CaptionPreview({
  container,
}: {
  container: React.RefObject<HTMLDivElement | null>;
}) {
  const style = useAppStore((s) => s.settings.captionStyle);
  const setStyle = useAppStore((s) => s.setCaptionStyle);
  const blocks = useAppStore((s) => s.blocks);
  const currentTime = useAppStore((s) => s.currentTime);
  /** Position while dragging; committed (and persisted) on release. */
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const latest = useRef<{ x: number; y: number } | null>(null);

  // Preview the playhead's block, or the first one so there is always
  // something to drag and style.
  const active = findActiveBlock(blocks, currentTime) ?? blocks[0];
  if (!active) return null;
  const text = captionText(active, style);
  if (text === "") return null;

  const frame = container.current;
  const frameH = frame?.clientHeight ?? 0;
  const video = getMedia() as HTMLVideoElement | null;
  // Outline/shadow are in video pixels; scale them to the on-screen frame.
  const scale = video?.videoHeight ? frameH / video.videoHeight : 0.3;
  const pos = dragPos ?? { x: style.posX, y: style.posY };
  const fontPx = Math.max(8, (style.fontSizePct / 100) * frameH);
  const o = style.outlineWidth * scale;
  const outlineShadows =
    style.outlineWidth > 0
      ? [
          `${o}px 0 0 ${style.outlineColor}`,
          `-${o}px 0 0 ${style.outlineColor}`,
          `0 ${o}px 0 ${style.outlineColor}`,
          `0 -${o}px 0 ${style.outlineColor}`,
          `${o}px ${o}px 0 ${style.outlineColor}`,
          `-${o}px ${o}px 0 ${style.outlineColor}`,
          `${o}px -${o}px 0 ${style.outlineColor}`,
          `-${o}px -${o}px 0 ${style.outlineColor}`,
        ]
      : [];
  const depth = style.shadow * scale * 2;
  const shadows = [
    ...outlineShadows,
    ...(style.shadow > 0 ? [`${depth}px ${depth}px ${depth}px rgba(0,0,0,0.8)`] : []),
  ].join(", ");

  const clamp = (v: number) => Math.min(0.98, Math.max(0.02, v));

  const onPointerMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!latest.current || !frame) return;
    const r = frame.getBoundingClientRect();
    const next = {
      x: clamp((e.clientX - r.left) / r.width),
      y: clamp((e.clientY - r.top) / r.height),
    };
    latest.current = next;
    setDragPos(next);
  };

  return (
    <span
      // Remounting on block or animation change replays the CSS animation.
      key={`${active.id}-${style.animation}`}
      className={`caption-preview anim-${style.animation}`}
      style={{
        left: `${pos.x * 100}%`,
        top: `${pos.y * 100}%`,
        fontSize: `${fontPx}px`,
        fontFamily: `"${style.fontFamily}", sans-serif`,
        fontWeight: style.bold ? 700 : 400,
        color: style.color,
        background: style.bgEnabled
          ? rgba(style.bgColor, style.bgOpacity)
          : "transparent",
        textShadow: shadows,
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        latest.current = { x: pos.x, y: pos.y };
      }}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        if (latest.current) {
          setStyle({ posX: latest.current.x, posY: latest.current.y });
        }
        latest.current = null;
        setDragPos(null);
      }}
    >
      {text}
    </span>
  );
}
