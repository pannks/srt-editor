import { invoke } from "@tauri-apps/api/core";

/** An ACP-capable agent this machine can run. */
export interface AcpAgent {
  id: string;
  label: string;
  /** Ready-to-run command line, absolute path included. */
  command: string;
  /**
   * `true` for a binary found on disk; `false` for an `npx -y …` suggestion
   * that downloads the adapter on first run.
   */
  installed: boolean;
}

/** What the initialize handshake revealed about an agent. */
export interface AcpAgentInfo {
  /** Whether the agent accepts audio content blocks directly. */
  audio: boolean;
  protocolVersion: number;
}

/** Probe PATH (and the usual package-manager bin dirs) for known agents. */
export const detectAcpAgents = (): Promise<AcpAgent[]> =>
  invoke<AcpAgent[]>("acp_detect_agents");

/** Run the initialize handshake only — proves the command speaks ACP. */
export const pingAcpAgent = (command: string): Promise<AcpAgentInfo> =>
  invoke<AcpAgentInfo>("acp_ping_agent", { command });

/** Abandon the running agent turn; the agent process is killed. */
export const cancelAcp = (): Promise<void> => invoke("acp_cancel");
