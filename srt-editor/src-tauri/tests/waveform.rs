//! End-to-end check of the ffmpeg peak decoder against real containers.
//! Needs ffmpeg on the machine, so it is ignored by default:
//!
//!   cargo test --test waveform -- --ignored --nocapture

use srt_editor_lib::audio::decode_peaks;
use std::process::Command;

/// 3 s of a 440 Hz tone, then 3 s of silence, in the requested container.
fn fixture(name: &str, args: &[&str]) -> String {
    let path = std::env::temp_dir().join(name);
    let path_str = path.to_string_lossy().to_string();
    let out = Command::new("ffmpeg")
        .args([
            "-hide_banner", "-v", "error", "-y",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
            "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=3",
            "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1",
        ])
        .args(args)
        .arg(&path_str)
        .output()
        .expect("ffmpeg must be installed to run this test");
    assert!(
        out.status.success(),
        "fixture {name} failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    path_str
}

#[test]
#[ignore]
fn decodes_containers_the_webview_cannot() {
    // mkv/opus is exactly the case that leaves wavesurfer's own decoder blank.
    for (name, args) in [
        ("srt-wave-test.mkv", vec!["-c:a", "libopus"]),
        ("srt-wave-test.mp4", vec!["-c:a", "aac"]),
        ("srt-wave-test.wav", vec![]),
    ] {
        let path = fixture(name, &args);
        let wave = decode_peaks(&path, 600, |m| println!("{name}: {m}")).unwrap();

        assert_eq!(wave.peaks.len(), 600);
        assert!(
            (wave.duration_sec - 6.0).abs() < 0.3,
            "{name}: duration {} not ~6s",
            wave.duration_sec
        );
        // Loud in the first half, silent in the second. The thresholds are
        // relative: lavfi's `sine` is not full-scale on every ffmpeg build.
        let loudest = wave.peaks[..250].iter().cloned().fold(0f32, f32::max);
        let quietest = wave.peaks[350..].iter().cloned().fold(0f32, f32::max);
        assert!(loudest > 0.02, "{name}: tone half is silent ({loudest})");
        assert!(
            quietest < loudest / 10.0,
            "{name}: silent half is loud ({quietest} vs {loudest})"
        );
        let _ = std::fs::remove_file(&path);
    }
}

#[test]
#[ignore]
fn reports_a_video_with_no_audio_track() {
    let path = std::env::temp_dir().join("srt-wave-silent.mp4");
    let path_str = path.to_string_lossy().to_string();
    let out = Command::new("ffmpeg")
        .args([
            "-hide_banner", "-v", "error", "-y",
            "-f", "lavfi", "-i", "testsrc=size=64x64:rate=10:duration=2",
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
        ])
        .arg(&path_str)
        .output()
        .expect("ffmpeg must be installed");
    assert!(out.status.success());

    let err = decode_peaks(&path_str, 600, |_| {}).unwrap_err();
    assert!(
        err.contains("no audio track"),
        "expected a no-audio error, got: {err}"
    );
    let _ = std::fs::remove_file(&path_str);
}
