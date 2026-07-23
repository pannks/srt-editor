//! Burn styled captions into a new video file with ffmpeg's libass filter.
//!
//! The ASS script itself is built (and unit-tested) in TypeScript; this side
//! only writes it to a temp file, runs ffmpeg and streams progress back.

use serde::Serialize;
use std::io::BufRead;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::audio::{ffprobe_duration, resolve_bin};

/// User-Agent old enough that Google Fonts serves plain TTF instead of woff2 —
/// libass reads TTF/OTF, not woff2.
const TTF_UA: &str = "Mozilla/4.0";
const FONT_TIMEOUT: Duration = Duration::from_secs(30);

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
    fonts: Vec<String>,
) -> Result<String, String> {
    // Fetch the chosen Google fonts before handing off to the blocking encoder,
    // so libass can render families that are not installed on this machine.
    let fonts_dir = download_fonts(&app, &fonts).await;

    tauri::async_runtime::spawn_blocking(move || {
        run_export(&app, &input_path, &output_path, &ass_content, fonts_dir.as_deref())
    })
    .await
    .map_err(|e| format!("export task failed: {e}"))?
}

/// Extract the `.ttf`/`.otf` URLs from a Google Fonts CSS2 reply.
fn ttf_urls(css: &str) -> Vec<String> {
    let mut out = Vec::new();
    for chunk in css.split("url(").skip(1) {
        if let Some(end) = chunk.find(')') {
            let url = chunk[..end].trim_matches(|c| c == '"' || c == '\'');
            if url.ends_with(".ttf") || url.ends_with(".otf") {
                out.push(url.to_string());
            }
        }
    }
    out
}

/// Best-effort: download each family's TTF into a temp dir and return it, or
/// `None` when nothing could be fetched. Failures are logged, never fatal —
/// libass falls back to a system font of the same name.
async fn download_fonts(app: &AppHandle, families: &[String]) -> Option<PathBuf> {
    let wanted: Vec<&String> = families
        .iter()
        .filter(|f| !f.trim().is_empty() && f.as_str() != "Arial")
        .collect();
    if wanted.is_empty() {
        return None;
    }

    let client = reqwest::Client::builder()
        .timeout(FONT_TIMEOUT)
        .user_agent(TTF_UA)
        .build()
        .ok()?;
    let dir = std::env::temp_dir().join("srt-editor").join("fonts");
    if std::fs::create_dir_all(&dir).is_err() {
        return None;
    }

    let mut saved = 0usize;
    for family in wanted {
        match fetch_family(&client, &dir, family).await {
            Ok(n) => {
                saved += n;
                emit_log(app, &format!("Font ready: {family} ({n} file(s))"));
            }
            Err(e) => emit_log(app, &format!("Font “{family}” unavailable: {e}")),
        }
    }
    (saved > 0).then_some(dir)
}

async fn fetch_family(
    client: &reqwest::Client,
    dir: &Path,
    family: &str,
) -> Result<usize, String> {
    let css_url = format!(
        "https://fonts.googleapis.com/css2?family={}:wght@400;700",
        urlencoding(family)
    );
    let css = client
        .get(&css_url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let urls = ttf_urls(&css);
    if urls.is_empty() {
        return Err("no TTF in the reply".to_string());
    }
    let base = family.replace(' ', "_");
    let mut saved = 0;
    for (i, url) in urls.iter().enumerate() {
        let bytes = client
            .get(url)
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| e.to_string())?
            .bytes()
            .await
            .map_err(|e| e.to_string())?;
        let path = dir.join(format!("{base}-{i}.ttf"));
        std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
        saved += 1;
    }
    Ok(saved)
}

/// Percent-encode a font family for the query string (space → %20).
fn urlencoding(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            ' ' => "%20".to_string(),
            other => format!("%{:02X}", other as u32),
        })
        .collect()
}

fn emit_log(app: &AppHandle, message: &str) {
    let _ = app.emit("process-log", message.to_string());
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
        Err("this ffmpeg build has no libass ('ass' filter missing), so captions cannot be burned in. Homebrew's default ffmpeg no longer bundles libass — install one that does: `brew install homebrew-ffmpeg/ffmpeg/ffmpeg`".to_string())
    }
}

fn run_export(
    app: &AppHandle,
    input_path: &str,
    output_path: &str,
    ass_content: &str,
    fonts_dir: Option<&Path>,
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

    let mut filter = format!("ass={}", escape_filter_path(&ass_path.to_string_lossy()));
    // Point libass at the downloaded fonts so non-installed families render.
    if let Some(dir) = fonts_dir {
        filter.push_str(&format!(
            ":fontsdir={}",
            escape_filter_path(&dir.to_string_lossy())
        ));
    }
    emit_log(app, &format!("Burning captions with ffmpeg → {output_path}"));

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
    use super::{escape_filter_path, has_ass_filter, ttf_urls, urlencoding};

    #[test]
    fn escapes_filter_metacharacters() {
        assert_eq!(escape_filter_path("/tmp/a.ass"), "/tmp/a.ass");
        assert_eq!(escape_filter_path("C:\\x'y.ass"), "C\\:\\\\x\\'y.ass");
    }

    #[test]
    fn pulls_ttf_urls_from_font_css() {
        let css = "@font-face { src: url(https://x/a.ttf) format('truetype'); }\n\
                   @font-face { src: url(https://x/b.woff2) format('woff2'); }\n\
                   @font-face { src: url('https://x/c.otf'); }";
        assert_eq!(
            ttf_urls(css),
            vec!["https://x/a.ttf".to_string(), "https://x/c.otf".to_string()]
        );
    }

    #[test]
    fn encodes_a_spaced_family() {
        assert_eq!(urlencoding("Noto Sans SC"), "Noto%20Sans%20SC");
        assert_eq!(urlencoding("Kanit"), "Kanit");
    }

    #[test]
    fn finds_the_ass_filter_in_a_listing() {
        let listing = " ... acrossfade      AA->A ...\n T.C ass             V->V  Render ASS subtitles onto input video.\n";
        assert!(has_ass_filter(listing));
        assert!(!has_ass_filter(" T.C subtitles V->V\n"));
        assert!(!has_ass_filter(""));
    }
}
