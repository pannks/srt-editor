import { useEffect, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { ChevronDown, Download, FolderDown } from "lucide-react";
import { useAppStore } from "../state/store";
import { toast } from "../state/toasts";
import { useT } from "../state/useT";
import { saveTextFile } from "../lib/audio/tauri";
import { blocksToSrt, type SrtOptions } from "../lib/srt/generate";
import { blocksToVtt } from "../lib/vtt/generate";
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
  const [format, setFormat] = useState<"srt" | "vtt">("srt");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // The two subtitle formats differ only in serializer, filter and extension;
  // everything downstream (language selection, naming) is shared.
  const serialize = format === "vtt" ? blocksToVtt : blocksToSrt;
  const filterName = format === "vtt" ? "WebVTT" : "SubRip";

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
      ext: format,
    });

  const exportOne = async (options: SrtOptions, lang?: string) => {
    setOpenMenu(false);
    const path = await save({
      defaultPath: fileName(lang),
      filters: [{ name: filterName, extensions: [format] }],
    });
    if (!path) return;
    try {
      await saveTextFile(path, serialize(blocks, options));
      appendLog(`Exported ${filterName}: ${path}`, "ok");
      toast.ok(`Exported ${filterName}: ${path}`);
    } catch (e) {
      appendLog(`Export failed: ${e}`, "err");
      toast.err(`Export failed: ${e}`);
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
    let failed = 0;
    for (const job of jobs) {
      const path = `${dir.replace(/[\\/]+$/, "")}/${job.name}`;
      try {
        await saveTextFile(path, serialize(blocks, job.options));
        appendLog(`Exported ${filterName}: ${path}`, "ok");
      } catch (e) {
        failed += 1;
        appendLog(`Export failed (${job.name}): ${e}`, "err");
      }
    }
    if (failed > 0) toast.err(`Export finished with ${failed} failure(s)`);
    else toast.ok(`Exported ${jobs.length} file(s) to ${dir}`);
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
          <div
            className="menu-format"
            role="group"
            aria-label={t("export.format")}
          >
            {(["srt", "vtt"] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={format === f ? "active" : undefined}
                aria-pressed={format === f}
                onClick={() => setFormat(f)}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
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
