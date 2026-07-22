mod audio;
mod files;
pub mod gemini;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            audio::check_ffmpeg,
            audio::extract_audio_chunks,
            gemini::transcribe_chunk,
            files::save_text_file,
            files::read_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
