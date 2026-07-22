import { useAppStore } from "../state/store";
import { findActiveBlock } from "../lib/blocks/active";
import { BlockItem } from "./BlockItem";

export function BlockList() {
  const blocks = useAppStore((s) => s.blocks);
  const currentTime = useAppStore((s) => s.currentTime);
  const activeId = findActiveBlock(blocks, currentTime)?.id;

  if (blocks.length === 0) {
    return (
      <main className="block-list empty">
        <p className="muted">
          No subtitle blocks yet — open media and press “Generate SRT”.
        </p>
      </main>
    );
  }

  return (
    <main className="block-list">
      {blocks.map((b, i) => (
        <BlockItem
          key={b.id}
          block={b}
          index={i}
          isFirst={i === 0}
          isLast={i === blocks.length - 1}
          isActive={b.id === activeId}
        />
      ))}
    </main>
  );
}
