import type {InstallConfig} from './types';

export const buildServerEnv = (config: InstallConfig): Record<string, string> => {
  const env: Record<string, string> = {
    CALIPER_TARGET: config.target,
    CALIPER_MODE: config.mode,
  };
  if (config.mode === 'snippet' && config.port !== null) {
    env.CALIPER_PORT = String(config.port);
  }
  return env;
};
