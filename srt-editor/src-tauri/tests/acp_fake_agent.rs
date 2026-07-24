//! End-to-end check of the ACP client against a scripted fake agent.
//!
//! The fake agent is a Node one-liner speaking newline-delimited JSON-RPC on
//! stdio: it answers initialize / session/new / session/prompt, asks for one
//! permission along the way, and streams the transcript as
//! `agent_message_chunk` updates. Skipped when `node` is not installed.

use srt_editor_lib::acp;
use std::io::Write;

const FAKE_AGENT_JS: &str = r#"
const readline = require("readline");
const rl = readline.createInterface({ input: process.stdin });
const send = (m) => process.stdout.write(JSON.stringify(m) + "\n");
let askedPermission = false;
rl.on("line", (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  // The client's answer to our permission request: finish the turn.
  if (msg.result && msg.result.outcome) {
    const sid = "sess-1";
    send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: sid, update: {
      sessionUpdate: "agent_message_chunk", content: { type: "text", text: '[{"start":0,"end":1.2,' } } } });
    send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: sid, update: {
      sessionUpdate: "agent_message_chunk", content: { type: "text", text: '"text":"fake hello"}]' } } } });
    send({ jsonrpc: "2.0", id: askedPermission, result: { stopReason: "end_turn" } });
    return;
  }
  if (msg.method === "initialize") {
    send({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: 1, agentCapabilities: {
      promptCapabilities: { audio: false, image: false, embeddedContext: false } } } });
  } else if (msg.method === "session/new") {
    send({ jsonrpc: "2.0", id: msg.id, result: { sessionId: "sess-1" } });
  } else if (msg.method === "session/prompt") {
    const hasLink = msg.params.prompt.some((b) => b.type === "resource_link");
    if (!hasLink) { send({ jsonrpc: "2.0", id: msg.id, error: { code: 1, message: "no resource_link" } }); return; }
    // Remember the prompt id so the permission answer can close it out.
    askedPermission = msg.id;
    send({ jsonrpc: "2.0", id: 900, method: "session/request_permission", params: {
      sessionId: "sess-1", toolCall: { toolCallId: "t1" },
      options: [ { optionId: "yes-once", name: "Allow", kind: "allow_once" },
                 { optionId: "no", name: "Reject", kind: "reject_once" } ] } });
  }
});
"#;

fn node_available() -> bool {
    std::process::Command::new("node")
        .arg("--version")
        .output()
        .is_ok_and(|o| o.status.success())
}

#[test]
fn drives_a_full_turn_against_a_fake_agent() {
    if !node_available() {
        eprintln!("skipping: node is not installed");
        return;
    }
    let dir = std::env::temp_dir().join(format!("srt-acp-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let script = dir.join("fake-agent.js");
    std::fs::write(&script, FAKE_AGENT_JS).unwrap();
    let chunk = dir.join("chunk-000.wav");
    let mut f = std::fs::File::create(&chunk).unwrap();
    f.write_all(b"RIFF fake wav").unwrap();

    let text = acp::run_transcribe(
        chunk.to_str().unwrap(),
        &format!("node \"{}\"", script.display()),
        "Transcribe this audio into subtitle segments.",
    )
    .expect("fake agent turn should succeed");

    assert_eq!(text, r#"[{"start":0,"end":1.2,"text":"fake hello"}]"#);
    let _ = std::fs::remove_dir_all(&dir);
}

/// Live handshake against a really installed agent. Ignored by default:
///   cargo test --test acp_fake_agent -- --ignored --nocapture
#[tokio::test]
#[ignore]
async fn initialize_handshake_with_an_installed_agent() {
    // Installed binaries only — pinging an npx offer would download it.
    let agents: Vec<_> = acp::acp_detect_agents()
        .into_iter()
        .filter(|a| a.installed)
        .collect();
    assert!(!agents.is_empty(), "no ACP agent installed on this machine");
    for agent in agents {
        let info = acp::acp_ping_agent(agent.command.clone())
            .await
            .unwrap_or_else(|e| panic!("{} failed the handshake: {e}", agent.label));
        println!(
            "{} ({}): protocol v{}, audio: {}",
            agent.label, agent.command, info.protocol_version, info.audio
        );
    }
}
