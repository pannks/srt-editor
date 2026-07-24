//! Full transcription turn through the ACP path against a real agent, with
//! live progress: `cargo run --example acp_transcribe -- <wav> [command...]`
fn main() {
    let mut args = std::env::args().skip(1);
    let wav = args.next().expect("usage: acp_transcribe <wav> [command]");
    let command = {
        let rest: Vec<String> = args.collect();
        if rest.is_empty() {
            let agent = srt_editor_lib::acp::acp_detect_agents()
                .into_iter()
                .find(|a| a.installed)
                .expect("no installed agent");
            agent.command
        } else {
            rest.join(" ")
        }
    };
    eprintln!("agent: {command}");
    let prompt = "Transcribe this audio into subtitle segments.\n\nRules:\n- Transcribe exactly what is spoken, in the spoken language.\n- \"start\" and \"end\" are seconds from the beginning of THIS audio clip.\n- Return ONLY a JSON array of {\"start\", \"end\", \"text\"} objects.";
    let started = std::time::Instant::now();
    let progress = Box::new(|p: srt_editor_lib::acp::AcpProgress| {
        eprintln!("  [{}] {}", p.kind, p.detail);
    });
    match srt_editor_lib::acp::run_transcribe_with(&wav, &command, prompt, Some(progress)) {
        Ok(text) => println!("OK in {:.1}s:\n{text}", started.elapsed().as_secs_f32()),
        Err(e) => println!("FAILED in {:.1}s: {e}", started.elapsed().as_secs_f32()),
    }
}
