export interface InstallConfig {
  serverCommand: string; // absolute path to the installed dist/server.js, run as `node <serverCommand>`
  target: string; // pinned loopback dev URL, written into the server's CALIPER_TARGET env
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
