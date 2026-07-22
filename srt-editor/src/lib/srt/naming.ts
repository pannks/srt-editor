/**
 * Export file names are built from a user-editable prefix and pattern, so a
 * batch of exports comes out consistently named without renaming by hand.
 */
export const DEFAULT_EXPORT_PREFIX = "";
export const DEFAULT_EXPORT_PATTERN = "{media}-{lang}";

export interface NameTokens {
  /** Path of the media file, or null when only an SRT was opened. */
  mediaPath?: string | null;
  projectName?: string;
  /** Language code of this file; omitted for the untranslated export. */
  lang?: string;
  /** Defaults to today. */
  date?: Date;
}

/** File name without directory or extension. */
export function basename(path: string): string {
  const file = path.split(/[\\/]/).pop() ?? path;
  const dot = file.lastIndexOf(".");
  return dot > 0 ? file.slice(0, dot) : file;
}

const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

/** Strip what a file name cannot contain. Spaces and dashes are kept. */
export function sanitizeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .trim();
}

/**
 * Resolve `{media}`, `{project}`, `{lang}` and `{date}` and add the extension.
 *
 * The result carries exactly one dot, the one before `srt`: a name like
 * `clip.th.srt` reads as a second extension to players and file managers, and
 * some of them then treat `.th` as the format. Dots coming from the pattern or
 * from a media file called `my.video.mp4` become dashes. Empty tokens leave no
 * trace either — `{media}-{lang}` with no language is `clip.srt`, not `clip-.srt`.
 */
export function buildExportName(
  prefix: string,
  pattern: string,
  tokens: NameTokens = {},
): string {
  const values: Record<string, string> = {
    media: tokens.mediaPath ? basename(tokens.mediaPath) : "",
    project: tokens.projectName?.trim() ?? "",
    lang: tokens.lang?.trim() ?? "",
    date: isoDate(tokens.date ?? new Date()),
  };

  const resolved = (pattern || DEFAULT_EXPORT_PATTERN).replace(
    /\{(media|project|lang|date)\}/g,
    (_all, key: string) => values[key],
  );

  const stem = `${prefix}${resolved}`
    // `.srt` must be the only extension the name has.
    .replace(/\./g, "-")
    // Separators left stranded by an empty token, or by the line above.
    .replace(/[\-_ ]{2,}/g, (run) => run[0])
    .replace(/^[\-_ ]+|[\-_ ]+$/g, "");

  return `${sanitizeFileName(stem) || "subtitles"}.srt`;
}
