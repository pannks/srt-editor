//! Print the ACP agents this machine can run, as the Settings UI would see
//! them: `cargo run --example acp_detect`
fn main() {
    for a in srt_editor_lib::acp::acp_detect_agents() {
        println!("{} installed={} → {}", a.label, a.installed, a.command);
    }
}
