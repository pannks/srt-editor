//! What the About window reports. Everything here is compile-time or process
//! information, so it never fails and needs no permissions.

use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    /// From `tauri.conf.json`, which the version script keeps in step with
    /// `package.json` — a mismatch with the frontend's `APP_VERSION` means a
    /// stale build, which is exactly what the About window is for.
    pub version: String,
    pub identifier: String,
    pub tauri: String,
    pub os: String,
    pub arch: String,
    pub debug: bool,
}

#[tauri::command]
pub fn app_info(app: tauri::AppHandle) -> AppInfo {
    let package = app.package_info();
    AppInfo {
        version: package.version.to_string(),
        identifier: app.config().identifier.clone(),
        tauri: tauri::VERSION.to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        debug: cfg!(debug_assertions),
    }
}
