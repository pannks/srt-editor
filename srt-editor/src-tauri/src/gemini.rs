use base64::Engine;
use serde_json::{json, Value};
use std::time::Duration;

const API_BASE: &str = "https://generativelanguage.googleapis.com/v1beta/models";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(900);

fn segment_schema() -> Value {
    json!({
        "type": "ARRAY",
        "items": {
            "type": "OBJECT",
            "properties": {
                "start": { "type": "NUMBER" },
                "end": { "type": "NUMBER" },
                "text": { "type": "STRING" }
            },
            "required": ["start", "end", "text"]
        }
    })
}

/// Send one audio chunk to Gemini and return the raw JSON text of its response.
///
/// The request runs in Rust rather than the webview: the inline audio payload is
/// several megabytes, which the macOS webview's fetch refuses with "Load failed".
#[tauri::command]
pub async fn transcribe_chunk(
    chunk_path: String,
    api_key: String,
    model: String,
    prompt: String,
) -> Result<String, String> {
    transcribe(&chunk_path, &api_key, &model, &prompt).await
}

pub async fn transcribe(
    chunk_path: &str,
    api_key: &str,
    model: &str,
    prompt: &str,
) -> Result<String, String> {
    let bytes =
        std::fs::read(chunk_path).map_err(|e| format!("cannot read chunk {chunk_path}: {e}"))?;
    let audio_b64 = base64::engine::general_purpose::STANDARD.encode(bytes);

    // Accept "gemini-3.1-pro-preview" or a fully qualified "models/…" name.
    let model_id = model.trim().trim_start_matches("models/");
    let url = format!("{API_BASE}/{model_id}:generateContent");

    let body = json!({
        "contents": [{
            "role": "user",
            "parts": [
                { "text": prompt },
                { "inline_data": { "mime_type": "audio/wav", "data": audio_b64 } }
            ]
        }],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": segment_schema()
        }
    });

    let client = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| format!("cannot create HTTP client: {e}"))?;

    let response = client
        .post(&url)
        .header("x-goog-api-key", api_key.trim())
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("request to Gemini failed: {e}"))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("cannot read Gemini response: {e}"))?;
    if !status.is_success() {
        return Err(format!("Gemini returned {status}: {}", api_error(&text)));
    }
    extract_text(&text)
}

/// Pull the human-readable message out of an API error envelope.
fn api_error(body: &str) -> String {
    serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|v| v["error"]["message"].as_str().map(str::to_string))
        .unwrap_or_else(|| body.chars().take(300).collect())
}

/// Concatenate the text parts of the first candidate.
fn extract_text(body: &str) -> Result<String, String> {
    let value: Value =
        serde_json::from_str(body).map_err(|e| format!("Gemini response is not JSON: {e}"))?;
    let candidate = value["candidates"]
        .get(0)
        .ok_or_else(|| match value["promptFeedback"]["blockReason"].as_str() {
            Some(reason) => format!("Gemini blocked the request: {reason}"),
            None => "Gemini returned no candidates".to_string(),
        })?;
    let text: String = candidate["content"]["parts"]
        .as_array()
        .map(|parts| {
            parts
                .iter()
                .filter_map(|p| p["text"].as_str())
                .collect::<String>()
        })
        .unwrap_or_default();
    if text.trim().is_empty() {
        let reason = candidate["finishReason"].as_str().unwrap_or("unknown");
        return Err(format!("Gemini returned no text (finishReason: {reason})"));
    }
    Ok(text)
}
