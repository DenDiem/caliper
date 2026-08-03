import type {InstallConfig} from './types';

// Auto-update mode registers the entry the way big MCP servers (e.g. Playwright) do:
// `npx -y @dendiem/caliper@latest serve`, so each client launch resolves the latest published
// version. Pinned mode keeps the reproducible `node <abs>/dist/server.js` form of this install.
const PACKAGE_SPEC = '@dendiem/caliper@latest';

export interface ServerLaunch {
  command: string;
  args: string[];
}

export const buildServerLaunch = (
  config: Pick<InstallConfig, 'autoUpdate' | 'serverCommand'>,
): ServerLaunch =>
  config.autoUpdate
    ? {command: 'npx', args: ['-y', PACKAGE_SPEC, 'serve']}
    : {command: 'node', args: [config.serverCommand]};
