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

/// Send one audio chunk to a transcription model and return its raw text reply.
///
/// The request runs in Rust rather than the webview: the inline audio payload is
/// several megabytes, which the macOS webview's fetch refuses with "Load failed".
///
/// `api` picks the wire protocol: `gemini` uses inline_data with a response
/// schema, anything else is sent as an OpenAI-compatible chat completion with
/// an `input_audio` part (OpenAI, OpenRouter, local servers). Whether the model
/// actually accepts audio is the provider's answer to give.
#[tauri::command]
pub async fn transcribe_chunk(
    chunk_path: String,
    api: String,
    base_url: String,
    api_key: String,
    model: String,
    prompt: String,
) -> Result<String, String> {
    let bytes =
        std::fs::read(&chunk_path).map_err(|e| format!("cannot read chunk {chunk_path}: {e}"))?;
    let audio_b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    match api.as_str() {
        "gemini" => transcribe_gemini(&audio_b64, &api_key, &model, &prompt).await,
        "anthropic" => Err("Anthropic models cannot read audio — pick another provider for transcription".to_string()),
        _ => transcribe_openai(&audio_b64, &base_url, &api_key, &model, &prompt).await,
    }
}

async fn transcribe_gemini(
    audio_b64: &str,
    api_key: &str,
    model: &str,
    prompt: &str,
) -> Result<String, String> {
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

/// OpenAI-compatible chat completion carrying the chunk as an `input_audio`
/// part. Structured output is not portable across these servers, so the reply
/// is free text; the TypeScript side strips fences and validates the JSON.
async fn transcribe_openai(
    audio_b64: &str,
    base_url: &str,
    api_key: &str,
    model: &str,
    prompt: &str,
) -> Result<String, String> {
    let url = crate::translate::completions_url(base_url);
    let body = json!({
        "model": model.trim(),
        "temperature": 0.2,
        "stream": false,
        "messages": [{
            "role": "user",
            "content": [
                { "type": "text", "text": prompt },
                { "type": "input_audio", "input_audio": { "data": audio_b64, "format": "wav" } }
            ]
        }]
    });

    let client = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| format!("cannot create HTTP client: {e}"))?;

    let mut post = client.post(&url).json(&body);
    if !api_key.trim().is_empty() {
        post = post.bearer_auth(api_key.trim());
    }

    let response = post
        .send()
        .await
        .map_err(|e| format!("request to {url} failed: {e}"))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("cannot read the reply: {e}"))?;
    if !status.is_success() {
        return Err(format!("{url} returned {status}: {}", api_error(&text)));
    }
    crate::translate::openai_content(&text)
}

/// Pull the human-readable message out of an API error envelope.
fn api_error(body: &str) -> String {
    serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|v| v["error"]["message"].as_str().map(str::to_string))
        .unwrap_or_else(|| body.chars().take(300).collect())
}

/// Concatenate the text parts of the first candidate.
pub fn extract_text(body: &str) -> Result<String, String> {
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
