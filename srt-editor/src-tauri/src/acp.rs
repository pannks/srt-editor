//! Minimal Agent Client Protocol (ACP) client: spawn an installed agent
//! (Gemini CLI, the Claude Code adapter, …) as a subprocess and drive one
//! transcription turn over newline-delimited JSON-RPC on its stdio.
//!
//! This is an alternative to the HTTP providers in `gemini.rs`: the agent
//! brings its own login, so no API key is stored. If the agent advertises the
//! `audio` prompt capability the chunk travels inline as base64; otherwise the
//! prompt carries a resource link and the agent reads the file with its own
//! tools from the session's working directory.

use serde::Serialize;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Set by `acp_cancel`, polled by the message loop. One transcription runs at
/// a time, so a single flag is enough.
static CANCEL: AtomicBool = AtomicBool::new(false);

const PROTOCOL_VERSION: u64 = 1;
/// Whole-conversation budget for one chunk. An agent may run tools (read the
/// file, shell out to a transcriber) before answering, so this matches the
/// HTTP path's 900 s request timeout rather than a snappy RPC timeout.
const TRANSCRIBE_TIMEOUT: Duration = Duration::from_secs(900);
/// An initialize handshake involves no model call, but an `npx -y …` command
/// may download the adapter first, so this is generous.
const PING_TIMEOUT: Duration = Duration::from_secs(180);

/// Agents worth probing for: id, label, binary name, extra args, and the npm
/// package `npx -y` can fetch when the binary is not installed globally.
const KNOWN_AGENTS: &[(&str, &str, &str, &str, Option<&str>)] = &[
    (
        "gemini",
        "Gemini CLI",
        "gemini",
        "--experimental-acp",
        Some("@google/gemini-cli"),
    ),
    (
        "claude-code",
        "Claude Code",
        "claude-code-acp",
        "",
        Some("@zed-industries/claude-code-acp"),
    ),
    (
        "codex",
        "Codex",
        "codex-acp",
        "",
        Some("@agentclientprotocol/codex-acp"),
    ),
];

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DetectedAgent {
    pub id: String,
    pub label: String,
    pub command: String,
    /// `true` for a binary found on this machine; `false` for an `npx -y`
    /// suggestion that downloads the adapter on first run.
    pub installed: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpAgentInfo {
    pub audio: bool,
    pub protocol_version: u64,
}

/// One line of live agent activity, streamed to the UI while a chunk runs so
/// a long agentic turn is not a silent wait.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AcpProgress {
    /// "tool" | "thinking" | "reply"
    pub kind: String,
    /// Tool title, or a running character count for the reply.
    pub detail: String,
}

type ProgressFn = Box<dyn Fn(AcpProgress) + Send>;

/// Which agents this machine can run. Binaries found on disk come first, as
/// ready-to-run command lines with absolute paths (the app itself may have
/// been launched from Finder/Explorer with a PATH that misses them). Agents
/// whose binary is missing are still offered through `npx -y <package>` when
/// npx exists — npx fetches the adapter on first run.
#[tauri::command]
pub fn acp_detect_agents() -> Vec<DetectedAgent> {
    let npx = find_binary("npx");
    let mut found = Vec::new();
    let mut offers = Vec::new();
    for (id, label, bin, args, npx_package) in KNOWN_AGENTS {
        if let Some(path) = find_binary(bin) {
            found.push(DetectedAgent {
                id: (*id).to_string(),
                label: (*label).to_string(),
                command: join_command(&quote_path(&path), args),
                installed: true,
            });
        } else if let (Some(npx), Some(pkg)) = (&npx, npx_package) {
            offers.push(DetectedAgent {
                id: format!("{id}-npx"),
                label: (*label).to_string(),
                command: join_command(&format!("{} -y {pkg}", quote_path(npx)), args),
                installed: false,
            });
        }
    }
    found.extend(offers);
    found
}

fn join_command(base: &str, args: &str) -> String {
    if args.is_empty() {
        base.to_string()
    } else {
        format!("{base} {args}")
    }
}

/// Handshake only: proves the command speaks ACP and reports whether it
/// accepts audio content directly.
#[tauri::command]
pub async fn acp_ping_agent(command: String) -> Result<AcpAgentInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut agent = AgentProc::spawn(&command, &std::env::temp_dir(), PING_TIMEOUT)?;
        let init = agent.initialize()?;
        Ok(AcpAgentInfo {
            audio: prompt_audio_capability(&init),
            protocol_version: init["protocolVersion"].as_u64().unwrap_or(0),
        })
    })
    .await
    .map_err(|e| format!("ACP task failed: {e}"))?
}

/// Transcribe one chunk through an ACP agent and return its raw text reply
/// (the TypeScript side parses and validates the JSON, as for HTTP providers).
/// Agent activity is streamed to the webview as `acp-progress` events.
#[tauri::command]
pub async fn acp_transcribe_chunk(
    app: tauri::AppHandle,
    chunk_path: String,
    command: String,
    prompt: String,
) -> Result<String, String> {
    CANCEL.store(false, Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || {
        let progress: ProgressFn = Box::new(move |p| {
            use tauri::Emitter;
            let _ = app.emit("acp-progress", &p);
        });
        run_transcribe_with(&chunk_path, &command, &prompt, Some(progress))
    })
    .await
    .map_err(|e| format!("ACP task failed: {e}"))?
}

/// Abandon the running agent turn: the message loop notices the flag within
/// half a second and the agent process is killed on the way out.
#[tauri::command]
pub fn acp_cancel() {
    CANCEL.store(true, Ordering::SeqCst);
}

/// Public for the fake-agent integration test and the dev examples; the UI
/// goes through the `acp_transcribe_chunk` command.
pub fn run_transcribe(chunk_path: &str, command: &str, prompt: &str) -> Result<String, String> {
    run_transcribe_with(chunk_path, command, prompt, None)
}

pub fn run_transcribe_with(
    chunk_path: &str,
    command: &str,
    prompt: &str,
    progress: Option<ProgressFn>,
) -> Result<String, String> {
    let chunk = Path::new(chunk_path);
    // The chunk's directory doubles as the session workspace, so an agent
    // without the audio capability can reach the file with its own tools.
    let cwd = chunk
        .parent()
        .filter(|p| p.is_dir())
        .map(Path::to_path_buf)
        .unwrap_or_else(std::env::temp_dir);

    let mut agent = AgentProc::spawn(command, &cwd, TRANSCRIBE_TIMEOUT)?;
    agent.progress = progress;
    let init = agent.initialize()?;
    let audio_ok = prompt_audio_capability(&init);

    let session = agent.request(
        "session/new",
        json!({ "cwd": cwd.display().to_string(), "mcpServers": [] }),
    )?;
    let session_id = session["sessionId"]
        .as_str()
        .ok_or("agent returned no sessionId")?
        .to_string();

    let mut blocks = vec![json!({ "type": "text", "text": prompt_text(prompt, chunk, audio_ok) })];
    if audio_ok {
        use base64::Engine;
        let bytes = std::fs::read(chunk)
            .map_err(|e| format!("cannot read chunk {chunk_path}: {e}"))?;
        blocks.push(json!({
            "type": "audio",
            "data": base64::engine::general_purpose::STANDARD.encode(bytes),
            "mimeType": "audio/wav"
        }));
    } else {
        blocks.push(json!({
            "type": "resource_link",
            "uri": file_uri(chunk),
            "name": file_name(chunk),
            "mimeType": "audio/wav"
        }));
    }

    let done = agent.request(
        "session/prompt",
        json!({ "sessionId": session_id, "prompt": blocks }),
    )?;

    let text = agent.transcript.trim().to_string();
    if text.is_empty() {
        let stop = done["stopReason"].as_str().unwrap_or("unknown");
        return Err(format!(
            "agent produced no text (stopReason: {stop}){}",
            agent.stderr_tail()
        ));
    }
    Ok(text)
}

/// The user's prompt, hardened for an agentic model, plus — when the agent
/// cannot hear audio directly — where the chunk lives and what to do with it.
fn prompt_text(prompt: &str, chunk: &Path, audio_ok: bool) -> String {
    let base = format!(
        "{prompt}\n\nWork silently and reply with ONLY the JSON array — no commentary, no markdown fences."
    );
    if audio_ok {
        base
    } else {
        format!(
            "{base}\n\nThe audio clip is the file \"{}\" in the working directory (also attached as a resource link). Use your available tools to read and transcribe it.",
            file_name(chunk)
        )
    }
}

fn prompt_audio_capability(init: &Value) -> bool {
    init["agentCapabilities"]["promptCapabilities"]["audio"]
        .as_bool()
        .unwrap_or(false)
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.display().to_string())
}

/// RFC 8089 file URI from a native path (Windows drives get the third slash).
fn file_uri(path: &Path) -> String {
    let s = path.display().to_string().replace('\\', "/");
    if s.starts_with('/') {
        format!("file://{s}")
    } else {
        format!("file:///{s}")
    }
}

fn quote_path(p: &Path) -> String {
    let s = p.display().to_string();
    if s.contains(' ') {
        format!("\"{s}\"")
    } else {
        s
    }
}

/// PATH plus the package-manager bin dirs a Finder/Explorer-launched app
/// usually misses.
fn search_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();
    #[cfg(not(windows))]
    {
        for extra in ["/opt/homebrew/bin", "/usr/local/bin"] {
            dirs.push(PathBuf::from(extra));
        }
        if let Some(home) = std::env::var_os("HOME") {
            let home = PathBuf::from(home);
            for extra in [".local/bin", ".bun/bin", ".npm-global/bin", ".volta/bin"] {
                dirs.push(home.join(extra));
            }
            // nvm keeps one bin dir per Node version; take them all, newest
            // last wins nothing here — the first hit is used.
            if let Ok(versions) = std::fs::read_dir(home.join(".nvm/versions/node")) {
                let mut nvm: Vec<PathBuf> =
                    versions.flatten().map(|v| v.path().join("bin")).collect();
                nvm.sort();
                nvm.reverse(); // prefer the newest version
                dirs.extend(nvm);
            }
        }
    }
    dirs
}

fn find_binary(name: &str) -> Option<PathBuf> {
    #[cfg(windows)]
    let exts: Vec<String> = std::env::var("PATHEXT")
        .unwrap_or_else(|_| ".EXE;.CMD;.BAT;.COM".into())
        .split(';')
        .map(str::to_lowercase)
        .collect();
    #[cfg(not(windows))]
    let exts: Vec<String> = vec![String::new()];

    for dir in search_dirs() {
        for ext in &exts {
            let candidate = dir.join(format!("{name}{ext}"));
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

/// Split leading shell-style `VAR=value` words off a parsed command line.
fn split_env_prefix(words: Vec<String>) -> (Vec<(String, String)>, Vec<String>) {
    let mut envs = Vec::new();
    let mut rest = words.into_iter().peekable();
    while let Some(word) = rest.peek() {
        let Some((key, value)) = word.split_once('=') else { break };
        let valid = !key.is_empty()
            && !key.starts_with(|c: char| c.is_ascii_digit())
            && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
        if !valid {
            break;
        }
        envs.push((key.to_string(), value.to_string()));
        rest.next();
    }
    (envs, rest.collect())
}

/// Text carried by an `agent_message_chunk` update, if this is one.
fn update_text(params: &Value) -> Option<&str> {
    let update = &params["update"];
    if update["sessionUpdate"].as_str()? != "agent_message_chunk" {
        return None;
    }
    update["content"]["text"].as_str()
}

/// Auto-answer a permission request. Prefer a one-shot grant — the agent may
/// legitimately need to read or process the chunk file — and fall back to any
/// allow option; with nothing allowable, cancel rather than hang.
fn permission_reply(options: &Value) -> Value {
    let pick = options.as_array().and_then(|opts| {
        opts.iter()
            .find(|o| o["kind"] == "allow_once")
            .or_else(|| {
                opts.iter()
                    .find(|o| o["kind"].as_str().is_some_and(|k| k.starts_with("allow")))
            })
            .and_then(|o| o["optionId"].as_str())
    });
    match pick {
        Some(id) => json!({ "outcome": { "outcome": "selected", "optionId": id } }),
        None => json!({ "outcome": { "outcome": "cancelled" } }),
    }
}

/// One live agent subprocess: newline-delimited JSON-RPC on stdin/stdout, a
/// reader thread feeding a channel, stderr collected for error reporting.
struct AgentProc {
    child: Child,
    stdin: ChildStdin,
    rx: Receiver<Result<Value, String>>,
    deadline: Instant,
    timeout: Duration,
    next_id: u64,
    /// Concatenation of the agent's `agent_message_chunk` updates.
    transcript: String,
    stderr: Arc<Mutex<String>>,
    /// Live-activity callback (Tauri event emitter in the app, print in dev
    /// examples, absent in tests).
    progress: Option<ProgressFn>,
    last_progress: Instant,
    last_progress_kind: String,
}

impl AgentProc {
    fn spawn(command: &str, cwd: &Path, timeout: Duration) -> Result<Self, String> {
        let words = shell_words::split(command)
            .map_err(|e| format!("cannot parse the agent command: {e}"))?;
        // Shell-style `VAR=value` prefixes become the agent's environment —
        // the way to hand an API key to an agent whose login flow is gone
        // (e.g. `GEMINI_API_KEY=… gemini --experimental-acp`).
        let (envs, words) = split_env_prefix(words);
        let (bin, args) = words
            .split_first()
            .ok_or_else(|| "the agent command is empty".to_string())?;
        // A bare name is resolved against the extended search path, because a
        // GUI-launched app's PATH usually misses the agent's install dir.
        let program = if bin.contains('/') || bin.contains('\\') {
            PathBuf::from(bin)
        } else {
            find_binary(bin).unwrap_or_else(|| PathBuf::from(bin))
        };

        let mut cmd = Command::new(&program);
        cmd.args(args)
            .current_dir(cwd)
            // If this app was itself launched from inside an agent session
            // (e.g. a dev server started from Claude Code), the inherited
            // marker makes the child agent refuse to start as "nested".
            .env_remove("CLAUDECODE")
            .env_remove("CLAUDE_CODE_ENTRYPOINT")
            .envs(envs)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("cannot start the agent `{}`: {e}", program.display()))?;

        let stdin = child.stdin.take().ok_or("agent stdin unavailable")?;
        let stdout = child.stdout.take().ok_or("agent stdout unavailable")?;
        let child_stderr = child.stderr.take().ok_or("agent stderr unavailable")?;

        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                match line {
                    Ok(line) if line.trim().is_empty() => continue,
                    // Some agents print a banner on stdout before speaking
                    // JSON-RPC; non-JSON lines are skipped, not fatal.
                    Ok(line) => match serde_json::from_str::<Value>(&line) {
                        Ok(v) => {
                            if tx.send(Ok(v)).is_err() {
                                return;
                            }
                        }
                        Err(_) => continue,
                    },
                    Err(_) => break,
                }
            }
            let _ = tx.send(Err("the agent closed its output".into()));
        });

        let stderr = Arc::new(Mutex::new(String::new()));
        {
            let buf = Arc::clone(&stderr);
            std::thread::spawn(move || {
                let mut reader = BufReader::new(child_stderr);
                let mut line = String::new();
                while matches!(reader.read_line(&mut line), Ok(n) if n > 0) {
                    let mut b = buf.lock().unwrap();
                    b.push_str(&line);
                    // Keep only the tail; some agents log verbosely.
                    if b.len() > 4000 {
                        let cut = b.len() - 4000;
                        let cut = (cut..b.len()).find(|&i| b.is_char_boundary(i)).unwrap_or(0);
                        b.drain(..cut);
                    }
                    line.clear();
                }
            });
        }

        Ok(Self {
            child,
            stdin,
            rx,
            deadline: Instant::now() + timeout,
            timeout,
            next_id: 0,
            transcript: String::new(),
            stderr,
            progress: None,
            last_progress: Instant::now(),
            last_progress_kind: String::new(),
        })
    }

    /// Forward one activity line, rate-limited so a token stream does not
    /// flood the log. A change of activity kind always goes through.
    fn report(&mut self, kind: &str, detail: String) {
        let Some(cb) = &self.progress else { return };
        let now = Instant::now();
        if kind == self.last_progress_kind
            && now.duration_since(self.last_progress) < Duration::from_secs(3)
        {
            return;
        }
        self.last_progress_kind = kind.to_string();
        self.last_progress = now;
        cb(AcpProgress { kind: kind.to_string(), detail });
    }

    fn initialize(&mut self) -> Result<Value, String> {
        self.request(
            "initialize",
            json!({
                "protocolVersion": PROTOCOL_VERSION,
                "clientCapabilities": { "fs": { "readTextFile": false, "writeTextFile": false } }
            }),
        )
    }

    /// Send one request and pump messages until its response arrives.
    /// Notifications and agent-to-client requests are handled along the way.
    fn request(&mut self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id;
        self.next_id += 1;
        self.send(&json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }))?;

        loop {
            // Poll in short slices so a user cancel lands promptly; Drop
            // kills the agent process on the way out.
            if CANCEL.swap(false, Ordering::SeqCst) {
                return Err("stopped by the user".to_string());
            }
            let remaining = self
                .deadline
                .checked_duration_since(Instant::now())
                .ok_or_else(|| self.timeout_error(method))?;
            let slice = remaining.min(Duration::from_millis(500));
            let msg = match self.rx.recv_timeout(slice) {
                Ok(Ok(msg)) => msg,
                Ok(Err(closed)) => {
                    return Err(format!("{closed} during {method}{}", self.stderr_tail()))
                }
                Err(RecvTimeoutError::Timeout) => continue, // deadline is checked above
                Err(RecvTimeoutError::Disconnected) => {
                    return Err(format!("the agent exited during {method}{}", self.stderr_tail()))
                }
            };

            let is_reply =
                msg["id"] == json!(id) && (msg.get("result").is_some() || msg.get("error").is_some());
            if is_reply {
                if let Some(err) = msg.get("error") {
                    let mut detail = err["message"].as_str().map(str::to_string)
                        .unwrap_or_else(|| err.to_string());
                    // Agents often put the real reason in `data`.
                    if !err["data"].is_null() {
                        detail.push_str(&format!(" ({})", err["data"]));
                    }
                    return Err(format!("{method} failed: {detail}{}", self.stderr_tail()));
                }
                return Ok(msg["result"].clone());
            }
            self.handle_incoming(msg)?;
        }
    }

    fn handle_incoming(&mut self, msg: Value) -> Result<(), String> {
        let method = msg["method"].as_str().unwrap_or_default().to_string();
        match (method.as_str(), msg.get("id").cloned()) {
            ("session/update", _) => {
                if let Some(text) = update_text(&msg["params"]) {
                    self.transcript.push_str(text);
                    let chars = self.transcript.chars().count();
                    self.report("reply", format!("{chars} chars"));
                } else {
                    let update = &msg["params"]["update"];
                    match update["sessionUpdate"].as_str() {
                        Some("agent_thought_chunk") => self.report("thinking", String::new()),
                        Some("tool_call") => {
                            let title = update["title"].as_str().unwrap_or("a tool").to_string();
                            // A fresh tool call is always worth a line.
                            self.last_progress_kind.clear();
                            self.report("tool", title);
                        }
                        _ => {}
                    }
                }
            }
            ("session/request_permission", Some(id)) => {
                let reply = permission_reply(&msg["params"]["options"]);
                self.send(&json!({ "jsonrpc": "2.0", "id": id, "result": reply }))?;
            }
            (_, Some(id)) => {
                // fs/* and terminal/* — capabilities this client did not offer.
                self.send(&json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "error": { "code": -32601, "message": format!("{method} is not supported by this client") }
                }))?;
            }
            _ => {} // other notifications are progress noise
        }
        Ok(())
    }

    fn send(&mut self, msg: &Value) -> Result<(), String> {
        let mut line = msg.to_string();
        line.push('\n');
        self.stdin
            .write_all(line.as_bytes())
            .map_err(|e| format!("cannot write to the agent: {e}"))
    }

    fn timeout_error(&self, method: &str) -> String {
        format!(
            "the agent did not finish {method} within {}s{}",
            self.timeout.as_secs(),
            self.stderr_tail()
        )
    }

    /// The last stderr lines, for attaching to an error message.
    fn stderr_tail(&self) -> String {
        let log = self.stderr.lock().map(|b| b.trim().to_string()).unwrap_or_default();
        if log.is_empty() {
            String::new()
        } else {
            let tail: String = log.chars().rev().take(300).collect::<Vec<_>>().into_iter().rev().collect();
            format!(" — agent log: {tail}")
        }
    }
}

impl Drop for AgentProc {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn update_text_reads_agent_message_chunks_only() {
        let msg = json!({
            "sessionId": "s1",
            "update": { "sessionUpdate": "agent_message_chunk", "content": { "type": "text", "text": "hello" } }
        });
        assert_eq!(update_text(&msg), Some("hello"));

        let thought = json!({
            "update": { "sessionUpdate": "agent_thought_chunk", "content": { "type": "text", "text": "hmm" } }
        });
        assert_eq!(update_text(&thought), None);
    }

    #[test]
    fn permission_prefers_a_one_shot_allow() {
        let options = json!([
            { "optionId": "always", "name": "Always", "kind": "allow_always" },
            { "optionId": "once", "name": "Once", "kind": "allow_once" },
            { "optionId": "no", "name": "No", "kind": "reject_once" }
        ]);
        assert_eq!(
            permission_reply(&options),
            json!({ "outcome": { "outcome": "selected", "optionId": "once" } })
        );
    }

    #[test]
    fn permission_falls_back_to_any_allow_then_cancels() {
        let always_only = json!([
            { "optionId": "always", "kind": "allow_always" },
            { "optionId": "no", "kind": "reject_once" }
        ]);
        assert_eq!(
            permission_reply(&always_only),
            json!({ "outcome": { "outcome": "selected", "optionId": "always" } })
        );

        let reject_only = json!([{ "optionId": "no", "kind": "reject_once" }]);
        assert_eq!(
            permission_reply(&reject_only),
            json!({ "outcome": { "outcome": "cancelled" } })
        );
    }

    #[cfg(unix)]
    #[test]
    fn cancel_interrupts_a_silent_agent() {
        // `cat` answers nothing, so without the cancel flag this would sit
        // until the deadline; with it, the loop must bail within a slice.
        CANCEL.store(true, Ordering::SeqCst);
        let mut agent =
            AgentProc::spawn("cat", Path::new("/tmp"), Duration::from_secs(30)).unwrap();
        let started = Instant::now();
        let err = agent.request("initialize", json!({})).unwrap_err();
        assert!(err.contains("stopped by the user"), "got: {err}");
        assert!(started.elapsed() < Duration::from_secs(5));
        CANCEL.store(false, Ordering::SeqCst);
    }

    #[test]
    fn env_prefix_is_split_off_the_command() {
        let words = vec![
            "GEMINI_API_KEY=abc123".to_string(),
            "gemini".to_string(),
            "--experimental-acp".to_string(),
        ];
        let (envs, rest) = split_env_prefix(words);
        assert_eq!(envs, vec![("GEMINI_API_KEY".to_string(), "abc123".to_string())]);
        assert_eq!(rest, vec!["gemini", "--experimental-acp"]);

        // A path with '=' in an argument is not an env var.
        let words = vec!["mytool".to_string(), "--mode=fast".to_string()];
        let (envs, rest) = split_env_prefix(words);
        assert!(envs.is_empty());
        assert_eq!(rest.len(), 2);
    }

    #[test]
    fn file_uri_handles_both_path_flavours() {
        assert_eq!(file_uri(Path::new("/tmp/a b.wav")), "file:///tmp/a b.wav");
        assert_eq!(
            file_uri(Path::new("C:\\Temp\\chunk.wav")),
            "file:///C:/Temp/chunk.wav"
        );
    }

    #[test]
    fn prompt_text_mentions_the_file_only_without_audio_capability() {
        let chunk = Path::new("/tmp/chunk-003.wav");
        let direct = prompt_text("Transcribe.", chunk, true);
        assert!(!direct.contains("chunk-003.wav"));
        let via_file = prompt_text("Transcribe.", chunk, false);
        assert!(via_file.contains("chunk-003.wav"));
        assert!(via_file.contains("ONLY the JSON array"));
    }
}
