import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open as openDialog, save } from "@tauri-apps/plugin-dialog";
import {
  FolderOpen,
  PackageOpen,
  RefreshCw,
  Save,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import {
  mergeSettings,
  useAppStore,
  type MediaKind,
  type Settings,
} from "../state/store";
import {
  deleteProject,
  listProjects,
  loadProject,
  saveProject,
  type ProjectSummary,
} from "../lib/db/projects";
import { blocksToSrt } from "../lib/srt/generate";
import { parseSrt } from "../lib/srt/parse";
import {
  attachTranslations,
  extractTranslations,
  type TranslationMap,
} from "../lib/blocks/translations";
import { stripSecrets } from "../lib/settings/share";
import {
  BUNDLE_EXTENSION,
  buildBundle,
  bundleFileName,
  parseBundle,
  serializeBundle,
} from "../lib/project/bundle";
import { pathExists, readTextFile, saveTextFile } from "../lib/audio/tauri";
import { APP_VERSION } from "../lib/version";
import { useT } from "../state/useT";

/** Per-project settings snapshot — no API key is ever stored in a project. */
const projectSettings = (settings: Settings) => stripSecrets(settings);

const basename = (path: string) => path.split(/[\\/]/).pop() ?? path;

export function ProjectsDialog({ onClose }: { onClose: () => void }) {
  const store = useAppStore();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [name, setName] = useState(store.projectName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = useT();

  const refresh = () =>
    listProjects()
      .then((rows) => {
        setProjects(rows);
        setError(null);
      })
      .catch((e) => setError(String(e)));

  useEffect(() => {
    void refresh();
  }, []);

  /** `null` inserts a new row; the current id updates it in place. */
  const persist = async (id: number | null) => {
    const title = name.trim() || "Untitled project";
    setBusy(true);
    try {
      const savedId = await saveProject({
        id,
        name: title,
        mediaPath: store.mediaPath,
        mediaKind: store.mediaKind,
        srt: blocksToSrt(store.blocks),
        // Kept beside the SRT rather than inside it, so the exported file stays
        // a plain single-language subtitle.
        translations: JSON.stringify(extractTranslations(store.blocks)),
        settings: JSON.stringify(projectSettings(store.settings)),
      });
      store.setProject(savedId, title);
      store.appendLog(
        `Saved project #${savedId} “${title}” (${store.blocks.length} block(s))`,
        "ok",
      );
      await refresh();
    } catch (e) {
      setError(String(e));
      store.appendLog(`Save failed: ${e}`, "err");
    } finally {
      setBusy(false);
    }
  };

  const open = async (id: number) => {
    setBusy(true);
    try {
      const project = await loadProject(id);
      const stored = project.translations
        ? (JSON.parse(project.translations) as TranslationMap[])
        : null;
      if (project.mediaPath) {
        store.setMedia(
          project.mediaPath,
          convertFileSrc(project.mediaPath),
          project.mediaKind as MediaKind,
        );
      }
      // After setMedia, which clears blocks (new media = new transcript).
      store.setBlocks(attachTranslations(parseSrt(project.srt), stored));
      if (project.settings) {
        // mergeSettings, not a spread: the snapshot has no API keys, and a
        // shallow spread would replace the whole `translation` group with one.
        const snapshot = JSON.parse(project.settings) as Partial<Settings>;
        store.saveSettings(mergeSettings(store.settings, snapshot));
      }
      store.setProject(project.id, project.name);
      setName(project.name);
      store.appendLog(`Opened project #${project.id} “${project.name}”`, "ok");
      onClose();
    } catch (e) {
      setError(String(e));
      store.appendLog(`Open failed: ${e}`, "err");
    } finally {
      setBusy(false);
    }
  };

  /** Write what is on screen to a single shareable file. */
  const exportBundle = async () => {
    const title = name.trim() || "Untitled project";
    const path = await save({
      defaultPath: bundleFileName(title),
      filters: [{ name: "SRT Studio project", extensions: [BUNDLE_EXTENSION] }],
    });
    if (!path) return;
    setBusy(true);
    try {
      const bundle = buildBundle({
        app: APP_VERSION,
        name: title,
        mediaPath: store.mediaPath,
        mediaKind: store.mediaKind,
        srt: blocksToSrt(store.blocks),
        translations: extractTranslations(store.blocks),
        settings: projectSettings(store.settings) as Record<string, unknown>,
      });
      await saveTextFile(path, serializeBundle(bundle));
      store.appendLog(t("log.projectExported", { path }), "ok");
    } catch (e) {
      setError(String(e));
      store.appendLog(`Export failed: ${e}`, "err");
    } finally {
      setBusy(false);
    }
  };

  const importBundle = async () => {
    const path = await openDialog({
      multiple: false,
      filters: [{ name: "SRT Studio project", extensions: [BUNDLE_EXTENSION] }],
    });
    if (typeof path !== "string") return;
    setBusy(true);
    try {
      const bundle = parseBundle(await readTextFile(path));

      // The media path came from another machine; only follow it if it leads
      // somewhere here, and say so plainly when it does not.
      if (bundle.media.path && (await pathExists(bundle.media.path))) {
        store.setMedia(
          bundle.media.path,
          convertFileSrc(bundle.media.path),
          bundle.media.kind,
        );
      } else {
        // Clear first: whatever is open belongs to the previous project.
        store.closeWorkspace();
        if (bundle.media.name) {
          store.appendLog(
            t("log.projectMediaMissing", { name: bundle.media.name }),
            "info",
          );
        }
      }
      store.setBlocks(attachTranslations(parseSrt(bundle.srt), bundle.translations));
      if (bundle.settings) {
        // The bundle carries no keys, so mergeSettings keeps this machine's.
        store.saveSettings(
          mergeSettings(store.settings, bundle.settings as Partial<Settings>),
        );
      }
      // Imported, not saved: "Save" then puts it in this machine's database.
      store.setProject(null, bundle.name);
      setName(bundle.name);
      store.appendLog(
        t("log.projectImported", { name: bundle.name, app: bundle.app }),
        "ok",
      );
      setError(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      store.appendLog(`Import failed: ${message}`, "err");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: ProjectSummary) => {
    await deleteProject(p.id);
    if (store.projectId === p.id) store.setProject(null, p.name);
    store.appendLog(`Deleted project #${p.id} “${p.name}”`, "info");
    await refresh();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>
          <FolderOpen size={16} /> {t("projects.title")}
          <span className="spacer" />
          <button
            className="icon-only"
            title={t("projects.reload")}
            onClick={refresh}
          >
            <RefreshCw size={14} />
          </button>
          <button className="icon-only" title={t("settings.close")} onClick={onClose}>
            <X size={14} />
          </button>
        </h2>

        <label>
          {t("projects.name")}
          <input
            type="text"
            value={name}
            placeholder="Untitled project"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div className="modal-actions">
          <button
            className="primary"
            onClick={() => persist(store.projectId)}
            disabled={busy}
          >
            <Save size={14} />
            {store.projectId
              ? `${t("projects.save")} (#${store.projectId})`
              : t("projects.save")}
          </button>
          <button
            onClick={() => persist(null)}
            disabled={busy || !store.projectId}
          >
            {t("projects.saveAsNew")}
          </button>
          <button
            onClick={exportBundle}
            disabled={busy || store.blocks.length === 0}
            title={t("projects.exportHint")}
          >
            <Share2 size={14} /> {t("projects.export")}
          </button>
          <button onClick={importBundle} disabled={busy} title={t("projects.importHint")}>
            <PackageOpen size={14} /> {t("projects.import")}
          </button>
          <span className="spacer" />
          <span className="muted">
            {t("projects.blocks", { count: store.blocks.length })}
            {store.mediaPath ? ` · ${basename(store.mediaPath)}` : ""}
          </span>
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="project-list">
          {projects.length === 0 && (
            <p className="muted">{t("projects.empty")}</p>
          )}
          {projects.map((p) => (
            <div
              key={p.id}
              className={p.id === store.projectId ? "project current" : "project"}
            >
              <div className="project-main">
                <strong>{p.name}</strong>
                <span className="muted">
                  {t("projects.blocks", { count: p.blockCount })} · {p.updatedAt}
                  {p.mediaPath ? ` · ${basename(p.mediaPath)}` : ""}
                </span>
              </div>
              <button
                onClick={() => open(p.id)}
                disabled={busy}
                title={t("projects.open")}
              >
                <FolderOpen size={14} /> {t("projects.open")}
              </button>
              <button
                className="danger icon-only"
                title={t("projects.delete")}
                onClick={() => remove(p)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
