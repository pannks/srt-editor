import type { TranslationMap } from "../blocks/translations";
import { sanitizeFileName } from "../srt/naming";

/**
 * A project as a single file, so it can be mailed, committed or handed over.
 *
 * The subtitles travel as SRT text — the same portable form the database
 * stores — with the translations beside them, one entry per cue in SRT order.
 * Media is **referenced, not embedded**: bundles stay small and text-diffable,
 * and the recipient opens their own copy of the video.
 */
export const BUNDLE_FORMAT = "srt-studio-project";
export const BUNDLE_VERSION = 1;
export const BUNDLE_EXTENSION = "srtproj";

export interface BundleMedia {
  /** Absolute path on the machine that exported it; likely wrong elsewhere. */
  path: string | null;
  /** File name alone — what to tell the recipient to go and find. */
  name: string | null;
  kind: "video" | "audio";
}

export interface ProjectBundle {
  format: typeof BUNDLE_FORMAT;
  version: number;
  /** App version that wrote the file, for diagnosing an odd import. */
  app: string;
  exportedAt: string;
  name: string;
  media: BundleMedia;
  srt: string;
  translations: TranslationMap[];
  /** Settings snapshot with every API key removed. Never contains a secret. */
  settings: Record<string, unknown> | null;
}

export interface BundleInput {
  app: string;
  name: string;
  mediaPath: string | null;
  mediaKind: "video" | "audio";
  srt: string;
  translations: TranslationMap[];
  settings: Record<string, unknown> | null;
  /** Defaults to now; injectable so the tests are not clock-dependent. */
  now?: Date;
}

const fileNameOf = (path: string) => path.split(/[\\/]/).pop() ?? path;

export function buildBundle(input: BundleInput): ProjectBundle {
  return {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    app: input.app,
    exportedAt: (input.now ?? new Date()).toISOString(),
    name: input.name,
    media: {
      path: input.mediaPath,
      name: input.mediaPath ? fileNameOf(input.mediaPath) : null,
      kind: input.mediaKind,
    },
    srt: input.srt,
    translations: input.translations,
    settings: input.settings,
  };
}

/** Pretty-printed, so the file is readable and diffs line by line. */
export const serializeBundle = (bundle: ProjectBundle): string =>
  `${JSON.stringify(bundle, null, 2)}\n`;

/**
 * Read a bundle back, rejecting anything that is not one. Errors name what was
 * wrong: an import is a file the user picked, so it is worth being clear.
 */
export function parseBundle(text: string): ProjectBundle {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("not a project file — it is not valid JSON");
  }
  if (typeof data !== "object" || data === null) {
    throw new Error("not a project file — expected an object");
  }
  const raw = data as Record<string, unknown>;
  if (raw.format !== BUNDLE_FORMAT) {
    throw new Error(
      `not an SRT Studio project file (format: ${String(raw.format ?? "missing")})`,
    );
  }
  const version = typeof raw.version === "number" ? raw.version : 0;
  if (version > BUNDLE_VERSION) {
    throw new Error(
      `this project file needs a newer SRT Studio (file version ${version}, this app reads ${BUNDLE_VERSION})`,
    );
  }
  if (typeof raw.srt !== "string") {
    throw new Error("project file has no subtitles");
  }

  const media = (raw.media ?? {}) as Record<string, unknown>;
  const path = typeof media.path === "string" ? media.path : null;
  return {
    format: BUNDLE_FORMAT,
    version,
    app: typeof raw.app === "string" ? raw.app : "unknown",
    exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : "",
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : "Imported project",
    media: {
      path,
      name:
        typeof media.name === "string"
          ? media.name
          : path
            ? fileNameOf(path)
            : null,
      kind: media.kind === "audio" ? "audio" : "video",
    },
    srt: raw.srt,
    translations: Array.isArray(raw.translations)
      ? (raw.translations as TranslationMap[])
      : [],
    settings:
      typeof raw.settings === "object" && raw.settings !== null
        ? (raw.settings as Record<string, unknown>)
        : null,
  };
}

/** Default file name offered by the save dialog. */
export const bundleFileName = (projectName: string): string =>
  `${sanitizeFileName(projectName).replace(/\./g, "-") || "project"}.${BUNDLE_EXTENSION}`;
