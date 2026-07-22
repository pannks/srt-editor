//! Live end-to-end check of the transcription command against the real Gemini API.
//!
//! Ignored by default (needs network + a key). Run with:
//!   GEMINI_API_KEY=… SRT_TEST_AUDIO=/path/to.wav cargo test --test gemini_live -- --ignored --nocapture

use srt_editor_lib::gemini;

#[tokio::test]
#[ignore]
async fn transcribes_a_real_chunk() {
    let api_key = std::env::var("GEMINI_API_KEY").expect("GEMINI_API_KEY not set");
    let audio = std::env::var("SRT_TEST_AUDIO").expect("SRT_TEST_AUDIO not set");
    let model = std::env::var("SRT_TEST_MODEL")
        .unwrap_or_else(|_| "gemini-3.1-pro-preview".to_string());

    let text = gemini::transcribe(
        &audio,
        &api_key,
        &model,
        "Transcribe this audio into subtitle segments. Return ONLY a JSON array of \
         {start, end, text} with seconds relative to this clip.",
    )
    .await
    .expect("transcription failed");

    let segments: serde_json::Value = serde_json::from_str(&text).expect("response is not JSON");
    let segments = segments.as_array().expect("response is not an array");
    assert!(!segments.is_empty(), "no segments returned");
    for s in segments {
        assert!(s["start"].is_number(), "segment missing numeric start");
        assert!(s["end"].is_number(), "segment missing numeric end");
        assert!(
            s["text"].as_str().is_some_and(|t| !t.trim().is_empty()),
            "segment missing text"
        );
    }
    println!("{} segments; first: {}", segments.len(), segments[0]);
}
