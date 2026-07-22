import { useRef } from "react";
import type { SubtitleBlock } from "../lib/blocks/types";
import { seekTo } from "../lib/player";
import { useAppStore } from "../state/store";
import { TimeField } from "./TimeField";

interface Props {
  block: SubtitleBlock;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  isActive: boolean;
}

export function BlockItem({ block, index, isFirst, isLast, isActive }: Props) {
  const { editText, mergePrev, mergeNext, split, setTimes, remove } =
    useAppStore();
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  /** Cut at the caret's word boundary; falls back to the middle word. */
  const cut = () => {
    const ta = taRef.current;
    const caret = ta?.selectionStart ?? 0;
    const before = block.text.slice(0, caret).trim();
    const wordIndex =
      caret > 0 && before !== "" ? before.split(/\s+/).length : undefined;
    split(block.id, wordIndex);
  };

  return (
    <div className={isActive ? "block active" : "block"}>
      <div className="block-head">
        <button
          className="block-index"
          title="Seek player to this block"
          onClick={() => seekTo(block.start)}
        >
          #{index + 1}
        </button>
        <TimeField
          value={block.start}
          title="Start — arrows nudge, Shift for larger steps"
          onCommit={(start) => setTimes(block.id, start, block.end)}
        />
        <span className="time-sep">→</span>
        <TimeField
          value={block.end}
          title="End — arrows nudge, Shift for larger steps"
          onCommit={(end) => setTimes(block.id, block.start, end)}
        />
        <span className="block-duration">
          {(block.end - block.start).toFixed(2)}s
        </span>
        <span className="spacer" />
        <button
          disabled={isFirst}
          title="Merge with previous block"
          onClick={() => mergePrev(block.id)}
        >
          ⇡ merge
        </button>
        <button
          disabled={isLast}
          title="Merge with next block"
          onClick={() => mergeNext(block.id)}
        >
          ⇣ merge
        </button>
        <button title="Cut at caret (or middle)" onClick={cut}>
          ✂ cut
        </button>
        <button
          className="danger"
          title="Delete block"
          onClick={() => remove(block.id)}
        >
          ✕
        </button>
      </div>
      <textarea
        ref={taRef}
        rows={2}
        value={block.text}
        onChange={(e) => editText(block.id, e.target.value)}
      />
    </div>
  );
}
