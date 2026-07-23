import { useMemo, useState } from "react";
import { Replace, X } from "lucide-react";
import { useAppStore } from "../state/store";
import { toast } from "../state/toasts";
import { useT } from "../state/useT";
import { countMatches, replaceAll } from "../lib/blocks/replace";

/** Inline find & replace across every block, shown above the block list. */
export function FindReplaceBar({ onClose }: { onClose: () => void }) {
  const blocks = useAppStore((s) => s.blocks);
  const applyBulkEdit = useAppStore((s) => s.applyBulkEdit);
  const t = useT();

  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [includeTranslations, setIncludeTranslations] = useState(true);

  const matches = useMemo(
    () => countMatches(blocks, query, { matchCase, includeTranslations }),
    [blocks, query, matchCase, includeTranslations],
  );

  const run = () => {
    const { blocks: next, replaced } = replaceAll(blocks, query, replacement, {
      matchCase,
      includeTranslations,
    });
    if (replaced === 0) {
      toast.info(t("tools.noMatches"));
      return;
    }
    applyBulkEdit(next);
    toast.ok(t("tools.replaced", { count: replaced }));
  };

  return (
    <div className="find-bar">
      <input
        type="text"
        value={query}
        placeholder={t("tools.find")}
        spellCheck={false}
        autoFocus
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter" && matches > 0) run();
        }}
      />
      <input
        type="text"
        value={replacement}
        placeholder={t("tools.replaceWith")}
        spellCheck={false}
        onChange={(e) => setReplacement(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter" && matches > 0) run();
        }}
      />
      <label className="check">
        <input
          type="checkbox"
          checked={matchCase}
          onChange={(e) => setMatchCase(e.target.checked)}
        />
        {t("tools.matchCase")}
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={includeTranslations}
          onChange={(e) => setIncludeTranslations(e.target.checked)}
        />
        {t("tools.inTranslations")}
      </label>
      <span className="muted find-count">
        {query === "" ? "" : t("tools.matches", { count: matches })}
      </span>
      <button onClick={run} disabled={matches === 0}>
        <Replace size={14} /> {t("tools.replaceAll")}
      </button>
      <button
        className="icon-only"
        onClick={onClose}
        title={t("tools.close")}
        aria-label={t("tools.close")}
      >
        <X size={14} />
      </button>
    </div>
  );
}
