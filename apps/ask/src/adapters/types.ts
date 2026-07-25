import type {CaliperMode} from '../config';

export interface InstallConfig {
  serverCommand: string; // absolute path to the installed dist/server.js, run as `node <serverCommand>`
  target: string; // pinned loopback dev URL, written into the server's CALIPER_TARGET env
  mode: CaliperMode; // written into the server's CALIPER_MODE env
  port: number | null; // written into the server's CALIPER_PORT env when mode is 'snippet'; null in proxy mode
  global: boolean;
}

export interface AgentAdapter {
  id: string;
  detect(): boolean;
  registerServer(config: InstallConfig): void;
  installGuidance(config: InstallConfig): void;
  // uninstall only needs to know project-vs-global, not the full InstallConfig
  uninstall(config: Pick<InstallConfig, 'global'>): void;
}
