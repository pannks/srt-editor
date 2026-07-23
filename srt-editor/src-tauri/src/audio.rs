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
pub fn resolve_bin(name: &str) -> String {
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

pub fn ffprobe_duration(path: &str) -> Result<f64, String> {
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

/// Waveform envelope for the player, one value per bucket in the range 0..1.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Waveform {
    pub peaks: Vec<f32>,
    pub duration_sec: f64,
}

/// Sample rate the envelope is decoded at — far below audible, but 2 kHz still
/// puts ~130 samples in the shortest bucket we produce.
const PEAK_SAMPLE_RATE: u32 = 2000;

/// Which bucket a sample index belongs to, clamped to the last bucket so a
/// stream that runs longer than `ffprobe` predicted cannot go out of range.
fn bucket_of(sample: u64, total: u64, buckets: usize) -> usize {
    if total == 0 || buckets == 0 {
        return 0;
    }
    ((sample * buckets as u64) / total).min(buckets as u64 - 1) as usize
}

/// Decode the audio track with ffmpeg and fold it into a peak envelope.
///
/// The webview cannot do this itself: wavesurfer decodes with the browser's
/// `decodeAudioData`, which rejects most video containers (mkv, avi, opus in
/// webm), leaving the waveform empty. ffmpeg reads all of them.
#[tauri::command]
pub fn waveform_peaks(
    app: AppHandle,
    input_path: String,
    buckets: u32,
) -> Result<Waveform, String> {
    let wave = decode_peaks(&input_path, buckets, |m| emit_log(&app, m))?;
    emit_log(&app, "Waveform ready");
    Ok(wave)
}

/// The body of `waveform_peaks`, free of the Tauri handle so it can be tested.
pub fn decode_peaks(
    input_path: &str,
    buckets: u32,
    log: impl Fn(&str),
) -> Result<Waveform, String> {
    use std::io::Read;

    let buckets = buckets.clamp(200, 40_000) as usize;
    let duration_sec = ffprobe_duration(input_path)?;
    log(&format!(
        "Reading waveform ({duration_sec:.1}s, {buckets} buckets)…"
    ));

    let mut child = Command::new(resolve_bin("ffmpeg"))
        .args([
            "-hide_banner",
            "-v",
            "error",
            "-i",
            input_path,
            "-vn",
            "-ac",
            "1",
            "-ar",
            &PEAK_SAMPLE_RATE.to_string(),
            "-f",
            "f32le",
            "-",
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to run ffmpeg: {e}"))?;

    let mut stdout = child.stdout.take().expect("stdout piped above");
    let total_samples = (duration_sec * PEAK_SAMPLE_RATE as f64).max(1.0) as u64;
    let mut peaks = vec![0f32; buckets];
    // Read the raw stream rather than collecting it: an hour of audio is tens of
    // megabytes, and only the running maximum per bucket is ever needed.
    let mut buf = [0u8; 16 * 1024];
    let mut carry: Vec<u8> = Vec::with_capacity(4);
    let mut index: u64 = 0;

    loop {
        let read = stdout
            .read(&mut buf)
            .map_err(|e| format!("cannot read ffmpeg output: {e}"))?;
        if read == 0 {
            break;
        }
        carry.extend_from_slice(&buf[..read]);
        let usable = carry.len() - carry.len() % 4;
        for frame in carry[..usable].chunks_exact(4) {
            let value = f32::from_le_bytes([frame[0], frame[1], frame[2], frame[3]]).abs();
            let bucket = bucket_of(index, total_samples, buckets);
            if value > peaks[bucket] {
                peaks[bucket] = value;
            }
            index += 1;
        }
        carry.drain(..usable);
    }

    let status = child
        .wait()
        .map_err(|e| format!("ffmpeg did not exit cleanly: {e}"))?;
    if !status.success() || index == 0 {
        let mut stderr = String::new();
        if let Some(mut pipe) = child.stderr.take() {
            let _ = pipe.read_to_string(&mut stderr);
        }
        let tail: Vec<&str> = stderr.lines().rev().take(3).collect();
        return Err(format!(
            "no audio track to draw: {}",
            tail.into_iter().rev().collect::<Vec<_>>().join(" | ")
        ));
    }

    Ok(Waveform {
        peaks,
        duration_sec,
    })
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

#[cfg(test)]
mod tests {
    use super::bucket_of;

    #[test]
    fn spreads_samples_evenly_across_buckets() {
        assert_eq!(bucket_of(0, 100, 10), 0);
        assert_eq!(bucket_of(9, 100, 10), 0);
        assert_eq!(bucket_of(10, 100, 10), 1);
        assert_eq!(bucket_of(99, 100, 10), 9);
    }

    #[test]
    fn clamps_a_stream_longer_than_ffprobe_predicted() {
        assert_eq!(bucket_of(250, 100, 10), 9);
    }

    #[test]
    fn survives_degenerate_input() {
        assert_eq!(bucket_of(5, 0, 10), 0);
        assert_eq!(bucket_of(5, 100, 0), 0);
    }
}
