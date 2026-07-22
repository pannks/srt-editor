use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChunkInfo {
    pub path: String,
    pub start_sec: f64,
    pub duration_sec: f64,
}

/// GUI apps on macOS don't inherit the shell PATH, so fall back to common install locations.
fn resolve_bin(name: &str) -> String {
    let candidates = [
        format!("/opt/homebrew/bin/{name}"),
        format!("/usr/local/bin/{name}"),
        format!("/usr/bin/{name}"),
    ];
    for c in &candidates {
        if Path::new(c).exists() {
            return c.clone();
        }
    }
    name.to_string()
}

fn emit_log(app: &AppHandle, message: &str) {
    let _ = app.emit("process-log", message.to_string());
}

fn ffprobe_duration(path: &str) -> Result<f64, String> {
    let out = Command::new(resolve_bin("ffprobe"))
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            path,
        ])
        .output()
        .map_err(|e| format!("failed to run ffprobe: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "ffprobe error: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    String::from_utf8_lossy(&out.stdout)
        .trim()
        .parse::<f64>()
        .map_err(|e| format!("cannot parse media duration: {e}"))
}

#[tauri::command]
pub fn check_ffmpeg() -> Result<String, String> {
    let out = Command::new(resolve_bin("ffmpeg"))
        .arg("-version")
        .output()
        .map_err(|_| {
            "ffmpeg not found — install it first (macOS: `brew install ffmpeg`)".to_string()
        })?;
    Ok(String::from_utf8_lossy(&out.stdout)
        .lines()
        .next()
        .unwrap_or("ffmpeg")
        .to_string())
}

/// Extract the audio track as mono 16 kHz WAV and split it into fixed-length chunks.
#[tauri::command]
pub fn extract_audio_chunks(
    app: AppHandle,
    input_path: String,
    chunk_secs: u32,
) -> Result<Vec<ChunkInfo>, String> {
    let chunk_secs = chunk_secs.clamp(30, 1800);
    let total = ffprobe_duration(&input_path)?;
    emit_log(&app, &format!("Media duration: {total:.1}s"));

    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let dir: PathBuf = std::env::temp_dir().join("srt-editor").join(stamp.to_string());
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create temp dir: {e}"))?;

    emit_log(
        &app,
        &format!("Extracting audio → mono 16 kHz WAV, {chunk_secs}s chunks (ffmpeg)…"),
    );
    let pattern = dir.join("chunk-%04d.wav");
    let out = Command::new(resolve_bin("ffmpeg"))
        .args([
            "-hide_banner",
            "-y",
            "-i",
            &input_path,
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-f",
            "segment",
            "-segment_time",
            &chunk_secs.to_string(),
            "-reset_timestamps",
            "1",
        ])
        .arg(&pattern)
        .output()
        .map_err(|e| format!("failed to run ffmpeg: {e}"))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let tail: Vec<&str> = stderr.lines().rev().take(4).collect();
        return Err(format!(
            "ffmpeg failed: {}",
            tail.into_iter().rev().collect::<Vec<_>>().join(" | ")
        ));
    }

    let mut paths: Vec<PathBuf> = std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|x| x == "wav"))
        .collect();
    paths.sort();
    if paths.is_empty() {
        return Err("ffmpeg produced no audio chunks (no audio track?)".to_string());
    }

    let mut chunks = Vec::with_capacity(paths.len());
    for (i, p) in paths.iter().enumerate() {
        let path_str = p.to_string_lossy().to_string();
        let duration_sec = ffprobe_duration(&path_str)?;
        let start_sec = i as f64 * chunk_secs as f64;
        emit_log(
            &app,
            &format!(
                "Chunk {}/{}: {:.1}s → {:.1}s",
                i + 1,
                paths.len(),
                start_sec,
                start_sec + duration_sec
            ),
        );
        chunks.push(ChunkInfo {
            path: path_str,
            start_sec,
            duration_sec,
        });
    }
    Ok(chunks)
}
