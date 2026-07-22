import { invoke } from "@tauri-apps/api/core";

/** Row of the projects list — `srt` is not loaded, only its cue count. */
export interface ProjectSummary {
  id: number;
  name: string;
  mediaPath: string | null;
  mediaKind: string;
  blockCount: number;
  updatedAt: string;
}

export interface Project extends Omit<ProjectSummary, "blockCount"> {
  /** Subtitles as SRT text — the portable form, parsed back on load. */
  srt: string;
  /** JSON array of `{lang: text}`, one entry per cue in `srt` order. */
  translations: string | null;
  settings: string | null;
  createdAt: string;
}

export interface ProjectInput {
  /** Omit or `null` to insert; an id updates that row in place. */
  id: number | null;
  name: string;
  mediaPath: string | null;
  mediaKind: string;
  srt: string;
  translations: string | null;
  settings: string | null;
}

/** Schema version of the SQLite file, advanced by the Rust migrations. */
export const dbVersion = (): Promise<number> => invoke("db_version");

export const saveProject = (project: ProjectInput): Promise<number> =>
  invoke("project_save", { project });

export const listProjects = (): Promise<ProjectSummary[]> =>
  invoke("project_list");

export const loadProject = (id: number): Promise<Project> =>
  invoke("project_load", { id });

export const deleteProject = (id: number): Promise<void> =>
  invoke("project_delete", { id });

export const getSetting = (key: string): Promise<string | null> =>
  invoke("settings_get", { key });

export const setSetting = (key: string, value: string): Promise<void> =>
  invoke("settings_set", { key, value });
