//! Burn styled captions into a new video file with ffmpeg's libass filter.
//!
//! The ASS script itself is built (and unit-tested) in TypeScript; this side
//! only writes it to a temp file, runs ffmpeg and streams progress back.

use serde::Serialize;
use std::io::BufRead;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

use crate::audio::{ffprobe_duration, resolve_bin};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExportProgress {
    pub done_sec: f64,
    pub total_sec: f64,
}

/// The ass filter parses `:` and `'` specially; our temp path contains
/// neither, but escape defensively in case the temp dir is exotic.
fn escape_filter_path(path: &str) -> String {
    path.replace('\\', "\\\\").replace(':', "\\:").replace('\'', "\\'")
}

#[tauri::command]
pub async fn export_captioned_video(
    app: AppHandle,
    input_path: String,
    output_path: String,
    ass_content: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_export(&app, &input_path, &output_path, &ass_content)
    })
    .await
    .map_err(|e| format!("export task failed: {e}"))?
}

/// True when the filter list advertises libass's `ass` filter.
fn has_ass_filter(filters_output: &str) -> bool {
    filters_output
        .lines()
        .any(|l| l.split_whitespace().nth(1) == Some("ass"))
}

/// Slim ffmpeg builds ship without libass; failing early beats a cryptic
/// "No option name near" from the filter parser after the user picked a path.
fn ensure_libass() -> Result<(), String> {
    let out = std::process::Command::new(resolve_bin("ffmpeg"))
        .args(["-hide_banner", "-filters"])
        .output()
        .map_err(|e| format!("failed to run ffmpeg: {e}"))?;
    let listing = String::from_utf8_lossy(&out.stdout);
    if has_ass_filter(&listing) {
        Ok(())
    } else {
        Err("this ffmpeg build has no libass ('ass' filter missing), so captions cannot be burned in — reinstall ffmpeg with libass support (macOS: `brew reinstall ffmpeg`, or `brew install homebrew-ffmpeg/ffmpeg/ffmpeg --with-libass`)".to_string())
    }
}

fn run_export(
    app: &AppHandle,
    input_path: &str,
    output_path: &str,
    ass_content: &str,
) -> Result<String, String> {
    ensure_libass()?;
    let total_sec = ffprobe_duration(input_path)?;

    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let dir: PathBuf = std::env::temp_dir().join("srt-editor");
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create temp dir: {e}"))?;
    let ass_path = dir.join(format!("captions-{stamp}.ass"));
    std::fs::write(&ass_path, ass_content)
        .map_err(|e| format!("cannot write subtitle file: {e}"))?;

    let filter = format!("ass={}", escape_filter_path(&ass_path.to_string_lossy()));
    let _ = app.emit("process-log", format!("Burning captions with ffmpeg → {output_path}"));

    let mut child = std::process::Command::new(resolve_bin("ffmpeg"))
        .args([
            "-hide_banner",
            "-y",
            "-v",
            "error",
            "-i",
            input_path,
            "-vf",
            &filter,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "18",
            // Re-encode audio: a copy of PCM or exotic codecs cannot land in mp4.
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-progress",
            "pipe:1",
            output_path,
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to run ffmpeg: {e}"))?;

    // `-progress pipe:1` prints key=value lines; out_time_ms is microseconds.
    if let Some(stdout) = child.stdout.take() {
        for line in std::io::BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Some(value) = line.strip_prefix("out_time_ms=") {
                if let Ok(us) = value.trim().parse::<i64>() {
                    let _ = app.emit(
                        "export-progress",
                        ExportProgress {
                            done_sec: (us as f64 / 1_000_000.0).clamp(0.0, total_sec),
                            total_sec,
                        },
                    );
                }
            }
        }
    }

    let status = child
        .wait()
        .map_err(|e| format!("ffmpeg did not exit cleanly: {e}"))?;
    let _ = std::fs::remove_file(&ass_path);
    if !status.success() {
        let mut stderr = String::new();
        if let Some(mut pipe) = child.stderr.take() {
            use std::io::Read;
            let _ = pipe.read_to_string(&mut stderr);
        }
        let tail: Vec<&str> = stderr.lines().rev().take(4).collect();
        return Err(format!(
            "ffmpeg failed: {}",
            tail.into_iter().rev().collect::<Vec<_>>().join(" | ")
        ));
    }
    Ok(output_path.to_string())
}

#[cfg(test)]
mod tests {
    use super::{escape_filter_path, has_ass_filter};

    #[test]
    fn escapes_filter_metacharacters() {
        assert_eq!(escape_filter_path("/tmp/a.ass"), "/tmp/a.ass");
        assert_eq!(escape_filter_path("C:\\x'y.ass"), "C\\:\\\\x\\'y.ass");
    }

    #[test]
    fn finds_the_ass_filter_in_a_listing() {
        let listing = " ... acrossfade      AA->A ...\n T.C ass             V->V  Render ASS subtitles onto input video.\n";
        assert!(has_ass_filter(listing));
        assert!(!has_ass_filter(" T.C subtitles V->V\n"));
        assert!(!has_ass_filter(""));
    }
}
