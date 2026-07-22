import { useEffect, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { ChevronDown, Download, FolderDown } from "lucide-react";
import { useAppStore } from "../state/store";
import { useT } from "../state/useT";
import { saveTextFile } from "../lib/audio/tauri";
import { blocksToSrt, type SrtOptions } from "../lib/srt/generate";
import { buildExportName } from "../lib/srt/naming";
import { translatedLanguages } from "../lib/blocks/translations";
import { languageTag } from "../lib/i18n/languages";

/**
 * Export as one file per language. The default file name comes from the
 * prefix + pattern in Settings, so a set of exports is named consistently
 * without renaming anything by hand.
 */
export function ExportMenu() {
  const blocks = useAppStore((s) => s.blocks);
  const mediaPath = useAppStore((s) => s.mediaPath);
  const projectName = useAppStore((s) => s.projectName);
  const settings = useAppStore((s) => s.settings);
  const appendLog = useAppStore((s) => s.appendLog);
  const t = useT();

  const [openMenu, setOpenMenu] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Languages worth offering: the configured targets plus anything already
  // translated, so a project opened with other targets still exports.
  const languages = [
    ...new Set([...settings.translation.targets, ...translatedLanguages(blocks)]),
  ];

  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpenMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenMenu(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  const fileName = (lang?: string) =>
    buildExportName(settings.exportPrefix, settings.exportPattern, {
      mediaPath,
      projectName,
      lang,
    });

  const exportOne = async (options: SrtOptions, lang?: string) => {
    setOpenMenu(false);
    const path = await save({
      defaultPath: fileName(lang),
      filters: [{ name: "SubRip", extensions: ["srt"] }],
    });
    if (!path) return;
    try {
      await saveTextFile(path, blocksToSrt(blocks, options));
      appendLog(`Exported SRT: ${path}`, "ok");
    } catch (e) {
      appendLog(`Export failed: ${e}`, "err");
    }
  };

  const exportAll = async () => {
    setOpenMenu(false);
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir !== "string") return;
    const jobs: { name: string; options: SrtOptions }[] = [
      { name: fileName(), options: {} },
      ...languages.map((lang) => ({
        name: fileName(lang),
        options: { lang } as SrtOptions,
      })),
    ];
    for (const job of jobs) {
      const path = `${dir.replace(/[\\/]+$/, "")}/${job.name}`;
      try {
        await saveTextFile(path, blocksToSrt(blocks, job.options));
        appendLog(`Exported SRT: ${path}`, "ok");
      } catch (e) {
        appendLog(`Export failed (${job.name}): ${e}`, "err");
      }
    }
  };

  return (
    <div className="menu-wrap" ref={wrapRef}>
      <button
        onClick={() => setOpenMenu((v) => !v)}
        disabled={blocks.length === 0}
        aria-expanded={openMenu}
        aria-haspopup="menu"
      >
        <Download size={14} /> {t("toolbar.export")}
        <ChevronDown size={13} />
      </button>
      {openMenu && (
        <div className="menu" role="menu">
          <button role="menuitem" onClick={() => exportOne({})}>
            {t("export.original")}
          </button>
          {languages.length === 0 && (
            <span className="menu-note muted">{t("export.noTargets")}</span>
          )}
          {languages.map((lang) => (
            <button
              key={lang}
              role="menuitem"
              onClick={() => exportOne({ lang }, lang)}
            >
              {languageTag(lang)} ({lang})
            </button>
          ))}
          {languages.map((lang) => (
            <button
              key={`bi-${lang}`}
              role="menuitem"
              onClick={() => exportOne({ lang, bilingual: true }, `${lang}-dual`)}
            >
              {t("export.bilingual", { lang: languageTag(lang) })}
            </button>
          ))}
          {languages.length > 0 && (
            <button role="menuitem" onClick={exportAll}>
              <FolderDown size={13} /> {t("export.everything")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
