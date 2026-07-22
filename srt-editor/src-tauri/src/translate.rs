//! Translation chat completions, for a model running locally or in the cloud.
//!
//! Local servers (Ollama, LM Studio, llama.cpp) speak plain HTTP on
//! `localhost`, which the webview will not call from the app's origin, so the
//! request lives here alongside the Gemini one. Replies are returned as raw
//! text — parsing and sanitizing stay in TypeScript, where they are unit-tested.
//!
//! `api` is the wire protocol, not the provider the user picked: Ollama, LM
//! Studio, OpenAI and OpenRouter all arrive here as `openai`.

use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Duration;

const GEMINI_API_BASE: &str = "https://generativelanguage.googleapis.com/v1beta/models";
const ANTHROPIC_VERSION: &str = "2023-06-01";
/// Anthropic requires a limit; a batch of subtitle lines never approaches it.
const ANTHROPIC_MAX_TOKENS: u32 = 4096;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(300);
const LIST_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    /// `openai`, `anthropic` or `gemini`.
    pub api: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub system: String,
    pub user: String,
}

#[tauri::command]
pub async fn translate_chat(request: ChatRequest) -> Result<String, String> {
    match request.api.as_str() {
        "gemini" => gemini_chat(&request).await,
        "anthropic" => anthropic_chat(&request).await,
        _ => openai_chat(&request).await,
    }
}

/// GET the provider's model list and hand the body back untouched.
#[tauri::command]
pub async fn list_models(api: String, url: String, api_key: String) -> Result<String, String> {
    let client = build_client(LIST_TIMEOUT)?;
    let mut get = client.get(&url);
    let key = api_key.trim();
    get = match api.as_str() {
        "anthropic" => get
            .header("x-api-key", key)
            .header("anthropic-version", ANTHROPIC_VERSION),
        "gemini" => get.header("x-goog-api-key", key),
        _ if !key.is_empty() => get.bearer_auth(key),
        _ => get,
    };

    let response = get
        .send()
        .await
        .map_err(|e| format!("cannot reach {url}: {e}"))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("cannot read the model list: {e}"))?;
    if !status.is_success() {
        return Err(format!("{url} returned {status}: {}", api_error(&text)));
    }
    Ok(text)
}

fn build_client(timeout: Duration) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|e| format!("cannot create HTTP client: {e}"))
}

fn client() -> Result<reqwest::Client, String> {
    build_client(REQUEST_TIMEOUT)
}

/// Accept a base (`http://host/v1`) or a full endpoint, and always end up at
/// exactly one `/chat/completions`.
pub fn completions_url(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return "http://localhost:11434/v1/chat/completions".to_string();
    }
    if trimmed.ends_with("/chat/completions") {
        trimmed.to_string()
    } else {
        format!("{trimmed}/chat/completions")
    }
}

/// Same idea for Anthropic's single messages endpoint.
pub fn messages_url(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return "https://api.anthropic.com/v1/messages".to_string();
    }
    if trimmed.ends_with("/messages") {
        trimmed.to_string()
    } else {
        format!("{trimmed}/messages")
    }
}

async fn openai_chat(request: &ChatRequest) -> Result<String, String> {
    let url = completions_url(&request.base_url);
    let body = json!({
        "model": request.model.trim(),
        "temperature": 0.2,
        "stream": false,
        "messages": [
            { "role": "system", "content": request.system },
            { "role": "user", "content": request.user }
        ]
    });

    let mut post = client()?.post(&url).json(&body);
    // A local server needs no key, and sending an empty bearer upsets some.
    if !request.api_key.trim().is_empty() {
        post = post.bearer_auth(request.api_key.trim());
    }

    let text = send(post, &url).await?;
    openai_content(&text)
}

/// Message content of the first choice.
pub fn openai_content(body: &str) -> Result<String, String> {
    let value: Value =
        serde_json::from_str(body).map_err(|e| format!("reply is not JSON: {e}"))?;
    let choice = value["choices"]
        .get(0)
        .ok_or_else(|| format!("no choices in the reply: {}", head(body)))?;
    let content = choice["message"]["content"]
        .as_str()
        // llama.cpp's completion shape, which some servers still return.
        .or_else(|| choice["text"].as_str())
        .unwrap_or_default();
    if content.trim().is_empty() {
        return Err("the model returned no text".to_string());
    }
    Ok(content.to_string())
}

async fn anthropic_chat(request: &ChatRequest) -> Result<String, String> {
    let url = messages_url(&request.base_url);
    let body = json!({
        "model": request.model.trim(),
        "max_tokens": ANTHROPIC_MAX_TOKENS,
        "temperature": 0.2,
        "system": request.system,
        "messages": [{ "role": "user", "content": request.user }]
    });

    let post = client()?
        .post(&url)
        .header("x-api-key", request.api_key.trim())
        .header("anthropic-version", ANTHROPIC_VERSION)
        .json(&body);

    let text = send(post, &url).await?;
    anthropic_content(&text)
}

/// Concatenate the text blocks of an Anthropic message.
pub fn anthropic_content(body: &str) -> Result<String, String> {
    let value: Value =
        serde_json::from_str(body).map_err(|e| format!("reply is not JSON: {e}"))?;
    let text: String = value["content"]
        .as_array()
        .map(|blocks| {
            blocks
                .iter()
                .filter_map(|b| b["text"].as_str())
                .collect::<String>()
        })
        .unwrap_or_default();
    if text.trim().is_empty() {
        let reason = value["stop_reason"].as_str().unwrap_or("unknown");
        return Err(format!(
            "the model returned no text (stop_reason: {reason})"
        ));
    }
    Ok(text)
}

async fn gemini_chat(request: &ChatRequest) -> Result<String, String> {
    let model_id = request.model.trim().trim_start_matches("models/");
    let url = format!("{GEMINI_API_BASE}/{model_id}:generateContent");
    let body = json!({
        "systemInstruction": { "parts": [{ "text": request.system }] },
        "contents": [{ "role": "user", "parts": [{ "text": request.user }] }],
        "generationConfig": { "temperature": 0.2 }
    });

    let post = client()?
        .post(&url)
        .header("x-goog-api-key", request.api_key.trim())
        .json(&body);

    let text = send(post, &url).await?;
    crate::gemini::extract_text(&text)
}

/// Send, and turn a non-2xx into the provider's own error message.
async fn send(post: reqwest::RequestBuilder, url: &str) -> Result<String, String> {
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
    Ok(text)
}

/// Pull the human-readable message out of an API error envelope.
fn api_error(body: &str) -> String {
    serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|v| {
            v["error"]["message"]
                .as_str()
                .or_else(|| v["error"].as_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| head(body))
}

fn head(body: &str) -> String {
    body.chars().take(300).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn completions_url_appends_once() {
        assert_eq!(
            completions_url("http://localhost:11434/v1"),
            "http://localhost:11434/v1/chat/completions"
        );
        assert_eq!(
            completions_url("http://localhost:11434/v1/"),
            "http://localhost:11434/v1/chat/completions"
        );
        assert_eq!(
            completions_url("http://localhost:11434/v1/chat/completions"),
            "http://localhost:11434/v1/chat/completions"
        );
    }

    #[test]
    fn completions_url_falls_back_when_blank() {
        assert_eq!(
            completions_url("   "),
            "http://localhost:11434/v1/chat/completions"
        );
    }

    #[test]
    fn messages_url_appends_once() {
        assert_eq!(
            messages_url("https://api.anthropic.com/v1"),
            "https://api.anthropic.com/v1/messages"
        );
        assert_eq!(
            messages_url("https://api.anthropic.com/v1/messages"),
            "https://api.anthropic.com/v1/messages"
        );
        assert_eq!(messages_url(""), "https://api.anthropic.com/v1/messages");
    }

    #[test]
    fn openai_content_reads_the_first_choice() {
        let body = r#"{"choices":[{"message":{"role":"assistant","content":"[{\"n\":1}]"}}]}"#;
        assert_eq!(openai_content(body).unwrap(), "[{\"n\":1}]");
    }

    #[test]
    fn openai_content_rejects_an_empty_reply() {
        let body = r#"{"choices":[{"message":{"content":"  "}}]}"#;
        assert!(openai_content(body).is_err());
    }

    #[test]
    fn anthropic_content_joins_the_text_blocks() {
        let body = r#"{"content":[{"type":"text","text":"[{\"n\":1,"},{"type":"text","text":"\"text\":\"x\"}]"}]}"#;
        assert_eq!(
            anthropic_content(body).unwrap(),
            "[{\"n\":1,\"text\":\"x\"}]"
        );
    }

    #[test]
    fn anthropic_content_reports_the_stop_reason() {
        let body = r#"{"content":[],"stop_reason":"max_tokens"}"#;
        let err = anthropic_content(body).unwrap_err();
        assert!(err.contains("max_tokens"), "{err}");
    }
}
