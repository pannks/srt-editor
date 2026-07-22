import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Languages,
  Loader2,
  Scissors,
  Trash2,
} from "lucide-react";
import type { SubtitleBlock } from "../lib/blocks/types";
import { seekTo } from "../lib/player";
import { useAppStore } from "../state/store";
import { useT } from "../state/useT";
import { translateBlockAt } from "../lib/translate/run";
import { languageTag } from "../lib/i18n/languages";
import { TimeField } from "./TimeField";

interface Props {
  block: SubtitleBlock;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  isActive: boolean;
}

export function BlockItem({ block, index, isFirst, isLast, isActive }: Props) {
  // Select field by field: the store's `currentTime` changes every animation
  // frame, and a bare `useAppStore()` would re-render every block with it.
  const editText = useAppStore((s) => s.editText);
  const editTranslation = useAppStore((s) => s.editTranslation);
  const mergePrev = useAppStore((s) => s.mergePrev);
  const mergeNext = useAppStore((s) => s.mergeNext);
  const cutAtCaret = useAppStore((s) => s.cutAtCaret);
  const setTimes = useAppStore((s) => s.setTimes);
  const remove = useAppStore((s) => s.remove);
  const showTranslations = useAppStore((s) => s.settings.showTranslations);
  const targets = useAppStore((s) => s.settings.translation.targets);
  const t = useT();

  const [retranslating, setRetranslating] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  /** Last caret position seen in this block's textarea; survives losing focus. */
  const caretRef = useRef<number | null>(null);

  // Configured targets first, then any language this block already carries.
  const languages = [
    ...new Set([...targets, ...Object.keys(block.translations ?? {})]),
  ];

  const rememberCaret = () => {
    caretRef.current = taRef.current?.selectionStart ?? null;
  };

  /** Cut exactly where the caret sits; with no caret, at the middle word. */
  const cut = () => cutAtCaret(block.id, caretRef.current);

  const retranslate = async () => {
    const store = useAppStore.getState();
    if (languages.length === 0 || retranslating) return;
    setRetranslating(true);
    try {
      await translateBlockAt(
        store.blocks,
        store.blocks.findIndex((b) => b.id === block.id),
        store.settings.translation,
        {
          log: store.appendLog,
          progress: () => {},
          apply: store.applyTranslationBatch,
        },
        languages,
      );
    } catch (e) {
      store.appendLog(
        `Translation failed: ${e instanceof Error ? e.message : e}`,
        "err",
      );
    } finally {
      setRetranslating(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const { selectionStart, selectionEnd, value } = ta;
    const collapsed = selectionStart === selectionEnd;

    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      caretRef.current = selectionStart;
      cut();
      return;
    }
    // At the very start, Backspace joins this block onto the previous one —
    // the same gesture as joining two paragraphs in a text editor.
    if (e.key === "Backspace" && collapsed && selectionStart === 0 && !isFirst) {
      e.preventDefault();
      mergePrev(block.id);
      return;
    }
    if (
      e.key === "Delete" &&
      collapsed &&
      selectionStart === value.length &&
      !isLast
    ) {
      e.preventDefault();
      mergeNext(block.id);
    }
  };

  return (
    <div className={isActive ? "block active" : "block"}>
      <div className="block-head">
        <button
          className="block-index"
          title={t("blocks.seek")}
          onClick={() => seekTo(block.start)}
        >
          #{index + 1}
        </button>
        <TimeField
          value={block.start}
          title={t("blocks.start")}
          onCommit={(start) => setTimes(block.id, start, block.end)}
        />
        <span className="time-sep">→</span>
        <TimeField
          value={block.end}
          title={t("blocks.end")}
          onCommit={(end) => setTimes(block.id, block.start, end)}
        />
        <span className="block-duration">
          {(block.end - block.start).toFixed(2)}s
        </span>
        <span className="spacer" />
        {languages.length > 0 && (
          <button
            className="icon-only"
            title={t("blocks.retranslate")}
            disabled={retranslating}
            onClick={retranslate}
          >
            {retranslating ? (
              <Loader2 size={13} className="spin" />
            ) : (
              <Languages size={13} />
            )}
          </button>
        )}
        <button
          disabled={isFirst}
          title={t("blocks.mergePrev")}
          onClick={() => mergePrev(block.id)}
        >
          <ArrowUpToLine size={13} /> {t("blocks.merge")}
        </button>
        <button
          disabled={isLast}
          title={t("blocks.mergeNext")}
          onClick={() => mergeNext(block.id)}
        >
          <ArrowDownToLine size={13} /> {t("blocks.merge")}
        </button>
        <button
          title={t("blocks.cutHint")}
          // Keep the caret: focus must not leave the textarea on mouse-down.
          onMouseDown={(e) => e.preventDefault()}
          onClick={cut}
        >
          <Scissors size={13} /> {t("blocks.cut")}
        </button>
        <button
          className="danger icon-only"
          title={t("blocks.delete")}
          onClick={() => remove(block.id)}
        >
          <Trash2 size={13} />
        </button>
      </div>
      <textarea
        ref={taRef}
        rows={2}
        value={block.text}
        onChange={(e) => {
          rememberCaret();
          editText(block.id, e.target.value);
        }}
        onSelect={rememberCaret}
        onKeyUp={rememberCaret}
        onClick={rememberCaret}
        onKeyDown={onKeyDown}
      />
      {showTranslations &&
        languages.map((lang) => (
          <TranslationRow
            key={lang}
            lang={lang}
            value={block.translations?.[lang] ?? ""}
            placeholder={t("blocks.translationPlaceholder")}
            onChange={(text) => editTranslation(block.id, lang, text)}
          />
        ))}
    </div>
  );
}

/**
 * One language's line. The field grows to its content instead of reserving
 * rows, so a block with several languages stays as compact as its text.
 */
function TranslationRow({
  lang,
  value,
  placeholder,
  onChange,
}: {
  lang: string;
  value: string;
  placeholder: string;
  onChange: (text: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <div className="block-translation">
      <span className="lang-tag" title={lang}>
        {languageTag(lang)}
      </span>
      <textarea
        ref={ref}
        rows={1}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
