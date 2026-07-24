//! Handshake every npx-offered (not installed) agent — downloads adapters on
//! first run: `cargo run --example acp_ping_npx`
fn main() {
    let rt = tokio::runtime::Runtime::new().unwrap();
    for a in srt_editor_lib::acp::acp_detect_agents() {
        if a.installed { continue; }
        print!("{} → ", a.label);
        match rt.block_on(srt_editor_lib::acp::acp_ping_agent(a.command.clone())) {
            Ok(i) => println!("OK protocol v{} audio={}", i.protocol_version, i.audio),
            Err(e) => println!("FAILED: {e}"),
        }
    }
}
