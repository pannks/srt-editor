pub mod audio;
mod db;
pub mod export;
mod files;
pub mod gemini;
mod info;
pub mod translate;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle().clone();
            app.manage(db::init(&handle)?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            audio::check_ffmpeg,
            audio::extract_audio_chunks,
            audio::waveform_peaks,
            export::export_captioned_video,
            export::font_metric_ratios,
            gemini::transcribe_chunk,
            translate::translate_chat,
            translate::list_models,
            files::save_text_file,
            files::read_text_file,
            files::path_exists,
            info::app_info,
            db::db_version,
            db::project_save,
            db::project_list,
            db::project_load,
            db::project_delete,
            db::settings_get,
            db::settings_set
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
