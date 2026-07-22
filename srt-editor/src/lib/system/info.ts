import { invoke } from "@tauri-apps/api/core";

export interface AppInfo {
  /** Version baked into the Rust/Tauri side of the build. */
  version: string;
  identifier: string;
  tauri: string;
  os: string;
  arch: string;
  debug: boolean;
}

export const appInfo = (): Promise<AppInfo> => invoke("app_info");
